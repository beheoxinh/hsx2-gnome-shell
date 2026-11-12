/**
 * Clock & Calendar customizer — the stock GNOME date menu: clock visibility
 * and position in the top bar, and what the calendar popup shows.
 *
 * Moved here from alienware-topbar (subsystems/panel/api.js + extension.js):
 * the date menu is a default GNOME Shell component, so it belongs to the
 * module that customizes GNOME's own UI. Fixes made while moving:
 *   * "Right" with offset 0 used to reset the clock to the centre (the default
 *     check tested the wrong box index)
 *   * "Invert calendar items" applied unconditionally and could never be
 *     undone; it now follows the setting and restores the original order
 *   * clock visibility goes through lib/dateMenuVisibility.js, so the topbar
 *     System Monitor can take over the centre box without reading this
 *     module's settings
 *
 * @license GPL-3.0-only
 */

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {DateMenuVisibility} from '../../../../lib/dateMenuVisibility.js';

const LOG = '[GCM date-menu]';

/** clock-position nick -> index into #panelBoxes() */
const BOX_INDEX = {center: 0, right: 1, left: 2};

export class DateMenuCustomizer {
    #settings = null;
    #api = null;
    #shellVersion = 0;
    #signalIds = [];
    #boxSignals = null;
    #clocksItemSync = null;
    #clocksItemShowSignal = null;
    #calendarOrder = null;

    /**
     * @param {Gio.Settings} settings gnome-customizer-manager settings
     * @param {object} api GCM engine (lib/API.js), for UI style classes
     * @param {number} shellVersion major GNOME Shell version
     */
    constructor(settings, api, shellVersion) {
        this.#settings = settings;
        this.#api = api;
        this.#shellVersion = shellVersion;
    }

    start() {
        for (const [key, apply] of this.#table()) {
            this.#signalIds.push(this.#settings.connect(`changed::${key}`,
                () => this.#run(key, () => apply(false))));
            this.#run(key, () => apply(false));
        }
    }

    stop() {
        for (const id of this.#signalIds) {
            try {
                this.#settings.disconnect(id);
            } catch (_) {
                /* already gone */
            }
        }
        this.#signalIds = [];

        for (const [key, apply] of this.#table())
            this.#run(key, () => apply(true));
    }

    /** [key, apply(revert)] — `revert` restores the GNOME default */
    #table() {
        const s = this.#settings;
        const on = (key, revert) => revert || s.get_boolean(key);
        return [
            ['clock-visible', r => DateMenuVisibility.setWanted(on('clock-visible', r))],
            ['clock-position', r => this.#applyPosition(r)],
            ['clock-position-offset', r => this.#applyPosition(r)],
            ['world-clock', r => on('world-clock', r)
                ? this.#worldClocksShow() : this.#worldClocksHide()],
            ['weather', r => this.#styleClass('no-weather', !on('weather', r))],
            ['events-button', r => this.#styleClass('no-events-button', !on('events-button', r))],
            ['calendar', r => on('calendar', r)
                ? this.#dateMenu()?._calendar?.show() : this.#dateMenu()?._calendar?.hide()],
            ['invert-calendar-column-items', r =>
                this.#setCalendarInverted(!r && s.get_boolean('invert-calendar-column-items'))],
        ];
    }

    #run(key, fn) {
        try {
            fn();
        } catch (e) {
            logError(e, `${LOG} apply ${key} failed`);
        }
    }

    #dateMenu() {
        return Main.panel?.statusArea?.dateMenu ?? null;
    }

    #styleClass(type, add) {
        const name = `just-perfection-api-${type}`;
        if (add)
            this.#api?.UIStyleClassAdd(name);
        else
            this.#api?.UIStyleClassRemove(name);
    }

    // ── clock position ───────────────────────────────────────────────────

    #panelBoxes() {
        return [
            Main.panel._centerBox,
            Main.panel._rightBox,
            Main.panel._leftBox,
        ];
    }

    #applyPosition(revert) {
        const nick = this.#settings.get_string('clock-position');
        const pos = revert ? 0 : (BOX_INDEX[nick] ?? 0);
        const offset = revert ? 0 : this.#settings.get_int('clock-position-offset');

        if (pos === 0 && offset === 0) {
            this.#positionSet(0, 0);
            this.#disconnectBoxSignals();
            return;
        }
        this.#positionSet(pos, offset);
    }

    /**
     * Move the date menu to box `pos` at child index `offset`, and keep it
     * there when other items are added to any box later.
     */
    #positionSet(pos, offset) {
        const dateMenu = this.#dateMenu();
        if (!dateMenu)
            return;

        const panelBoxes = this.#panelBoxes();
        this.#disconnectBoxSignals();

        let fromPos = -1;
        let fromIndex = -1;
        let toIndex = -1;
        for (let i = 0; i <= 2; i++) {
            const childIndex = panelBoxes[i].get_children().indexOf(dateMenu.container);
            if (childIndex !== -1) {
                fromPos = i;
                fromIndex = childIndex;
                const childLength = panelBoxes[pos].get_children().length;
                toIndex = Math.max(0, Math.min(offset, childLength));
                break;
            }
        }

        // removed by someone else (e.g. dash-to-panel took the date menu)
        if (fromPos === -1 || fromIndex === -1 || toIndex === -1)
            return;

        if (pos !== fromPos || toIndex !== fromIndex) {
            panelBoxes[fromPos].remove_child(dateMenu.container);
            panelBoxes[pos].insert_child_at_index(dateMenu.container, toIndex);
            DateMenuVisibility.sync();
            if (Main.sessionMode.isLocked)
                dateMenu.container.hide();
        }

        if (pos === 0 && offset === 0)
            return;

        this.#boxSignals = panelBoxes.map(box => [box, box.connect(
            this.#shellVersion >= 46 ? 'child-added' : 'actor-added',
            () => this.#positionSet(pos, offset))]);
    }

    #disconnectBoxSignals() {
        for (const [box, id] of this.#boxSignals ?? []) {
            try {
                box.disconnect(id);
            } catch (_) {}
        }
        this.#boxSignals = null;
    }

    // ── world clocks ─────────────────────────────────────────────────────

    #worldClocksShow() {
        const clocksItem = this.#dateMenu()?._clocksItem;
        if (!clocksItem || !this.#clocksItemSync)
            return;

        clocksItem._sync = this.#clocksItemSync;
        this.#clocksItemSync = null;

        if (this.#clocksItemShowSignal) {
            clocksItem.disconnect(this.#clocksItemShowSignal);
            this.#clocksItemShowSignal = null;
        }

        clocksItem._sync();
    }

    #worldClocksHide() {
        const clocksItem = this.#dateMenu()?._clocksItem;
        if (!clocksItem)
            return;

        if (!this.#clocksItemSync)
            this.#clocksItemSync = clocksItem._sync;

        clocksItem._sync = function () {
            this.visible = false;
        };

        if (!this.#clocksItemShowSignal)
            this.#clocksItemShowSignal = clocksItem.connect('show', () => clocksItem._sync());

        clocksItem._sync();
    }

    // ── calendar column order ────────────────────────────────────────────

    /**
     * Put weather/clocks/events above the calendar and the calendar above the
     * date, or restore the order GNOME built.
     */
    #setCalendarInverted(inverted) {
        if (inverted === !!this.#calendarOrder)
            return;

        const dateMenu = this.#dateMenu();
        if (!dateMenu)
            return;

        if (!inverted) {
            for (const [box, children] of this.#calendarOrder) {
                children.forEach((child, index) => {
                    if (child.get_parent() === box)
                        box.set_child_at_index(child, index);
                });
            }
            this.#calendarOrder = null;
            return;
        }

        const {_calendar: calendar, _date: date, _eventsItem: eventsItem,
            _clocksItem: clocksItem, _weatherItem: weatherItem} = dateMenu;
        const displayBox = eventsItem?.get_parent();
        const calendarBox = calendar?.get_parent();
        this.#calendarOrder = [displayBox, calendarBox]
            .filter(Boolean)
            .map(box => [box, box.get_children()]);

        // same remove/insert sequence as upstream Just Perfection, so the
        // resulting layout is identical; the snapshot above undoes it
        if (displayBox && clocksItem && weatherItem) {
            displayBox.remove_child(clocksItem);
            displayBox.remove_child(eventsItem);
            displayBox.remove_child(weatherItem);
            displayBox.insert_child_at_index(weatherItem, 1);
            displayBox.insert_child_at_index(clocksItem, 2);
            displayBox.insert_child_at_index(eventsItem, 3);
        }

        if (calendarBox && date) {
            calendarBox.remove_child(calendar);
            calendarBox.remove_child(date);
            calendarBox.insert_child_at_index(calendar, 1);
            calendarBox.insert_child_at_index(date, 2);
        }
    }
}
