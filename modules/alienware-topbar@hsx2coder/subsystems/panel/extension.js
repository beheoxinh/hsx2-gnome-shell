/**
 * Applies the alienware-topbar GSettings keys to the panel.
 *
 * One table of [key, apply, revert] so every panel key is handled in exactly
 * one place, and so a new key cannot be added without a matching entry: the
 * self-check at the bottom walks the schema and complains about any key that
 * this table does not mention.
 */

import {PanelHost} from './host.js';

const PANEL_SIDE = ['top', 'bottom'];

/** index of a value inside an enum, or -1 */
function enumIndex(values, value) {
    const i = values.indexOf(value);
    return i < 0 ? 0 : i;
}

export class PanelExtension {
    #settings = null;
    #signalIds = [];
    #originalPanelStyle = undefined;

    constructor(settings) {
        this.#settings = settings;
    }

    enable() {
        this.#connect();
        this.applyAll();
        this.#assertEveryKeyHandled();
    }

    disable() {
        this.#disconnect();
        this.revertAll();
        this.#originalPanelStyle = undefined;
    }

    get settings() {
        return this.#settings;
    }

    applyAll() {
        for (const [key, apply] of this.#table()) {
            try {
                apply(this.#settings, false);
            } catch (e) {
                logError(e, `[alienware-topbar] apply ${key} failed`);
            }
        }
    }

    revertAll() {
        for (const [, , revert] of this.#table()) {
            try {
                revert(this.#settings, true);
            } catch (e) {
                logError(e, `[alienware-topbar] revert failed`);
            }
        }
    }

    /**
     * [key, apply(settings, force), revert(settings, force)]
     * `force` is true while reverting, so handlers can restore defaults.
     */
    #table() {
        const a = PanelHost.api;
        const t = [
            // both of these feed the same decision, so both point at the same
            // applier; panel-in-overview used to be read only while applying
            // panel-visible, so toggling it on its own did nothing
            ['panel-visible', (s, f) => this.#applyPanelVisibility(s, f),
                () => a.panelShow()],
            ['panel-in-overview', (s, f) => this.#applyPanelVisibility(s, f),
                () => a.panelShow()],

            ['panel-height',
                (s, f) => {
                    const h = s.get_int('panel-height');
                    if (f || h === 0)
                        a.panelSetDefaultSize();
                    else
                        a.panelSetSize(h, false);
                },
                s => a.panelSetDefaultSize()],

            ['panel-position',
                (s, f) => {
                    const p = enumIndex(PANEL_SIDE, s.get_string('panel-position'));
                    a.panelSetPosition(f ? 0 : p);
                },
                () => a.panelSetPosition(0)],

            ['panel-corner-size',
                (s, f) => this.#corner(f ? 0 : s.get_int('panel-corner-size')),
                () => this.#corner(0)],

            ['panel-button-padding',
                (s, f) => {
                    const v = s.get_int('panel-button-padding');
                    if (f || v === 0)
                        a.panelButtonHpaddingSetDefault();
                    else
                        a.panelButtonHpaddingSizeSet(v);
                },
                () => a.panelButtonHpaddingSetDefault()],

            ['panel-indicator-padding',
                (s, f) => {
                    const v = s.get_int('panel-indicator-padding');
                    if (f || v === 0)
                        a.panelIndicatorPaddingSetDefault();
                    else
                        a.panelIndicatorPaddingSizeSet(v);
                },
                () => a.panelIndicatorPaddingSetDefault()],

            ['panel-icon-size',
                (s, f) => {
                    const v = s.get_int('panel-icon-size');
                    if (f || v === 0)
                        a.panelIconSetDefaultSize();
                    else
                        a.panelIconSetSize(v);
                },
                () => a.panelIconSetDefaultSize()],

            ['background-menu',
                (s, f) => (f || s.get_boolean('background-menu'))
                    ? a.backgroundMenuEnable() : a.backgroundMenuDisable(),
                () => a.backgroundMenuEnable()],

            ['activities-button',
                (s, f) => (f || s.get_boolean('activities-button'))
                    ? a.activitiesButtonShow() : a.activitiesButtonHide(),
                () => a.activitiesButtonShow()],

            ['show-apps-button',
                (s, f) => (f || s.get_boolean('show-apps-button'))
                    ? a.showAppsButtonEnable() : a.showAppsButtonDisable(),
                () => a.showAppsButtonEnable()],

            ['search-entry',
                (s, f) => (f || s.get_boolean('search-entry'))
                    ? a.searchEntryShow(false) : a.searchEntryHide(),
                () => a.searchEntryShow(false)],

            ['start-search',
                (s, f) => (f || s.get_boolean('start-search'))
                    ? a.startSearchEnable() : a.startSearchDisable(),
                () => a.startSearchEnable()],

            ['max-search-results',
                (s, f) => {
                    const v = s.get_int('max-search-results');
                    if (f || v === 0)
                        a.setMaxDisplayedSearchResultToDefault();
                    else
                        a.setMaxDisplayedSearchResult(v);
                },
                () => a.setMaxDisplayedSearchResultToDefault()],

            ['notification-icon',
                (s, f) => (f || s.get_boolean('notification-icon'))
                    ? a.panelNotificationIconEnable() : a.panelNotificationIconDisable(),
                () => a.panelNotificationIconEnable()],

            ['keyboard-layout-indicator',
                (s, f) => (f || s.get_boolean('keyboard-layout-indicator'))
                    ? a.keyboardLayoutShow() : a.keyboardLayoutHide(),
                () => a.keyboardLayoutShow()],

            ['accessibility-menu',
                (s, f) => (f || s.get_boolean('accessibility-menu'))
                    ? a.accessibilityMenuShow() : a.accessibilityMenuHide(),
                () => a.accessibilityMenuShow()],

            ['power-icon',
                (s, f) => (f || s.get_boolean('power-icon'))
                    ? a.powerIconShow() : a.powerIconHide(),
                () => a.powerIconShow()],

            ['screen-sharing-indicator',
                (s, f) => (f || s.get_boolean('screen-sharing-indicator'))
                    ? a.screenSharingIndicatorEnable() : a.screenSharingIndicatorDisable(),
                () => a.screenSharingIndicatorEnable()],

            ['screen-recording-indicator',
                (s, f) => (f || s.get_boolean('screen-recording-indicator'))
                    ? a.screenRecordingIndicatorEnable() : a.screenRecordingIndicatorDisable(),
                () => a.screenRecordingIndicatorEnable()],

            ['accent-color-icon',
                (s, f) => (f || s.get_boolean('accent-color-icon'))
                    ? a.accentColorIconEnable() : a.accentColorIconDisable(),
                () => a.accentColorIconDisable()],
        ];
        return t;
    }

    #applyPanelVisibility(settings, force) {
        const a = PanelHost.api;
        if (force || settings.get_boolean('panel-visible'))
            return a.panelShow();
        return a.panelHide(settings.get_boolean('panel-in-overview') ? 1 : 0);
    }

    /**
     * The old topbar-panel-controls module had a "Panel Corner Size" key whose
     * handler called panelButtonHpadding* instead, so the radius never changed.
     * There is no API method for it, so it is applied here as inline style on
     * the panel actor, remembering whatever was there before so a revert is
     * exact rather than a guess.
     */
    #corner(radius) {
        const panel = PanelHost.panel;
        if (!panel)
            return;

        if (this.#originalPanelStyle === undefined)
            this.#originalPanelStyle = panel.style ?? null;

        panel.style = radius > 0
            ? `${this.#originalPanelStyle ?? ''}border-radius: ${radius}px;`
            : this.#originalPanelStyle;
    }

    #connect() {
        for (const [key, apply] of this.#table()) {
            this.#signalIds.push(
                this.#settings.connect(`changed::${key}`, () => {
                    try {
                        apply(this.#settings, false);
                    } catch (e) {
                        logError(e, `[alienware-topbar] apply ${key} failed`);
                    }
                }));
        }
    }

    #disconnect() {
        for (const id of this.#signalIds) {
            try {
                this.#settings.disconnect(id);
            } catch (_) {
                /* already gone */
            }
        }
        this.#signalIds = [];
    }

    /** every schema key must appear in the table, otherwise it can never apply */
    #assertEveryKeyHandled() {
        const handled = new Set(this.#table().map(([k]) => k));
        const nonPanelKeys = new Set([
            'clone-topbar', 'clone-show-clock', 'clone-show-tray',
            'enable-system-monitor', 'enable-indicators',
        ]);
        const missing = this.#settings.settings_schema.list_keys()
            .filter(k => !handled.has(k) && !nonPanelKeys.has(k));
        if (missing.length) {
            logError(new Error(missing.join(', ')),
                '[alienware-topbar] schema keys with no handler');
        }
    }
}
