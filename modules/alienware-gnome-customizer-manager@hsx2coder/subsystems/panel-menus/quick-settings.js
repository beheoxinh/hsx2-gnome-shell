/**
 * Quick Settings customizer — visibility of the stock GNOME quick settings
 * menu and of the toggles inside it.
 *
 * Moved here from alienware-topbar (subsystems/panel/api.js + extension.js):
 * the quick settings menu is a default GNOME Shell component, so it belongs to
 * the module that customizes GNOME's own UI. Method bodies are the PanelApi
 * ones, with three fixes:
 *   * show-signal ids are cleared after disconnecting, so hide -> show -> hide
 *     reconnects instead of keeping a dead id
 *   * pending property-call signals are disconnected on stop() (PanelApi never
 *     did, so a toggle could fire after the module was disabled)
 *   * a stored "original visible" of false is honoured (was `!value`)
 *
 * @license GPL-3.0-only
 */

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {hasBacklight, isHeadlessSession} from '../../../../lib/headless.js';

const LOG = '[GCM quick-settings]';

export class QuickSettingsCustomizer {
    #settings = null;
    #shellVersion = 0;
    #signalIds = [];
    #originals = {};
    #callSignals = {};
    #logged = {};
    #rfkillShowSignal = null;
    #rfkillToggle = null;
    #backlightShowSignal = null;
    #backlightItem = null;

    /**
     * @param {Gio.Settings} settings gnome-customizer-manager settings
     * @param {number} shellVersion major GNOME Shell version
     */
    constructor(settings, shellVersion) {
        this.#settings = settings;
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

        this.#stopAllPropertyCalls();
    }

    /** [key, apply(revert)] — `revert` restores the GNOME default */
    #table() {
        const s = this.#settings;
        const on = (key, revert) => revert || s.get_boolean(key);
        return [
            ['quick-settings', r => on('quick-settings', r)
                ? this.#menuShow() : this.#menuHide()],
            ['quick-settings-dark-mode', r => on('quick-settings-dark-mode', r)
                ? this.#firstItemVisible('_darkMode', true) : this.#firstItemVisible('_darkMode', false)],
            ['quick-settings-night-light', r => on('quick-settings-night-light', r)
                ? this.#firstItemVisible('_nightLight', true) : this.#firstItemVisible('_nightLight', false)],
            ['quick-settings-do-not-disturb', r => on('quick-settings-do-not-disturb', r)
                ? this.#doNotDisturbVisible(true) : this.#doNotDisturbVisible(false)],
            ['quick-settings-backlight', r => on('quick-settings-backlight', r)
                ? this.#backlightShow() : this.#backlightHide()],
            ['quick-settings-airplane-mode', r => on('quick-settings-airplane-mode', r)
                ? this.#airplaneModeShow() : this.#airplaneModeHide()],
        ];
    }

    #run(key, fn) {
        try {
            fn();
        } catch (e) {
            logError(e, `${LOG} apply ${key} failed`);
        }
    }

    // ── menu ─────────────────────────────────────────────────────────────

    #menuShow() {
        Main.panel.statusArea.quickSettings?.container.show();
    }

    #menuHide() {
        Main.panel.statusArea.quickSettings?.container.hide();
    }

    // ── simple toggles (first item of an indicator) ──────────────────────

    #firstItemVisible(propertyName, visible) {
        this.#onPropertyCall(propertyName, indicator => {
            const item = this.#firstItem(indicator);
            if (visible)
                item?.show();
            else
                item?.hide();
        });
    }

    #doNotDisturbVisible(visible) {
        // the Do Not Disturb quick toggle only exists since GNOME 49
        if (this.#shellVersion < 49)
            return;
        this.#firstItemVisible('_doNotDisturb', visible);
    }

    // ── airplane mode ────────────────────────────────────────────────────

    #airplaneModeShow() {
        this.#onPropertyCall('_rfkill', rfkill => {
            if (!rfkill?._rfkillToggle)
                return;

            this.#disconnectRfkillShow();

            if (this.#originals.rfkillVisible !== undefined) {
                rfkill._rfkillToggle.visible = this.#originals.rfkillVisible;
                rfkill._sync();
                delete this.#originals.rfkillVisible;
            }
        });
    }

    #airplaneModeHide() {
        this.#onPropertyCall('_rfkill', rfkill => {
            if (!rfkill?._rfkillToggle)
                return;

            if (this.#originals.rfkillVisible === undefined)
                this.#originals.rfkillVisible = rfkill._rfkillToggle.visible;

            rfkill._rfkillToggle.hide();
            rfkill._sync();

            if (!this.#rfkillShowSignal) {
                this.#rfkillToggle = rfkill._rfkillToggle;
                this.#rfkillShowSignal = rfkill._rfkillToggle.connect('show', () => {
                    rfkill._rfkillToggle.hide();
                    rfkill._sync();
                });
            }
        });
    }

    #disconnectRfkillShow() {
        if (this.#rfkillShowSignal) {
            try {
                this.#rfkillToggle?.disconnect(this.#rfkillShowSignal);
            } catch (_) {}
        }
        this.#rfkillShowSignal = null;
        this.#rfkillToggle = null;
    }

    // ── backlight ────────────────────────────────────────────────────────

    #backlightShow() {
        // no panel backlight (desktop / headless RDP) -> nothing to toggle
        if (isHeadlessSession() || !hasBacklight())
            return;

        this.#onPropertyCall('_backlight', backlight => {
            const item = this.#firstItem(backlight);
            if (!item)
                return;

            this.#disconnectBacklightShow();

            if (this.#originals.backlightVisible !== undefined) {
                item.visible = this.#originals.backlightVisible;
                delete this.#originals.backlightVisible;
            }
        });
    }

    #backlightHide() {
        if (isHeadlessSession() || !hasBacklight())
            return;

        this.#onPropertyCall('_backlight', backlight => {
            const item = this.#firstItem(backlight);
            if (!item)
                return;

            if (this.#originals.backlightVisible === undefined)
                this.#originals.backlightVisible = item.visible;

            item.hide();

            if (!this.#backlightShowSignal) {
                this.#backlightItem = item;
                this.#backlightShowSignal = item.connect('show', () => item.hide());
            }
        });
    }

    #disconnectBacklightShow() {
        if (this.#backlightShowSignal) {
            try {
                this.#backlightItem?.disconnect(this.#backlightShowSignal);
            } catch (_) {}
        }
        this.#backlightShowSignal = null;
        this.#backlightItem = null;
    }

    // ── async quick settings properties ──────────────────────────────────

    /**
     * Call func once the async quick settings property is available. Quick
     * settings indicators are created lazily, so a property may not exist yet
     * when the module enables.
     */
    #onPropertyCall(propertyName, func) {
        try {
            const quickSettings = Main.panel.statusArea.quickSettings;
            if (!quickSettings)
                return;
            const indicators = quickSettings._indicators;

            if (quickSettings[propertyName]) {
                this.#runGuarded(propertyName, func, quickSettings[propertyName]);
                return;
            }

            this.#disconnectPropertyCall(propertyName);

            this.#callSignals[propertyName] = indicators.connect(
                this.#shellVersion >= 46 ? 'child-added' : 'actor-added',
                () => {
                    try {
                        if (!quickSettings[propertyName])
                            return;
                        // one-shot: clear the id before running the callback, so
                        // a second child-added cannot disconnect the closure twice
                        this.#disconnectPropertyCall(propertyName);
                        this.#runGuarded(propertyName, func, quickSettings[propertyName]);
                    } catch (e) {
                        this.#logOnce(propertyName, e);
                    }
                });
        } catch (e) {
            this.#logOnce(propertyName, e);
        }
    }

    #disconnectPropertyCall(propertyName) {
        const id = this.#callSignals[propertyName];
        delete this.#callSignals[propertyName];
        if (!id)
            return;
        try {
            Main.panel.statusArea.quickSettings?._indicators.disconnect(id);
        } catch (_) {}
    }

    #stopAllPropertyCalls() {
        for (const name of Object.keys(this.#callSignals))
            this.#disconnectPropertyCall(name);
        this.#disconnectRfkillShow();
        this.#disconnectBacklightShow();
    }

    #runGuarded(propertyName, func, indicator) {
        try {
            func(indicator);
        } catch (e) {
            this.#logOnce(propertyName, e);
        }
    }

    /** a headless/hardware-less session lacks most items: log the first miss only */
    #logOnce(propertyName, error) {
        if (this.#logged[propertyName])
            return;
        this.#logged[propertyName] = true;
        const where = isHeadlessSession() ? 'headless session' : 'this session';
        console.warn(`${LOG} "${propertyName}" not available in ${where}: ` +
            `${error?.message ?? error}`);
    }

    #firstItem(indicator) {
        const items = indicator?.quickSettingsItems;
        if (!Array.isArray(items) || items.length === 0)
            return null;
        return items[0] ?? null;
    }
}
