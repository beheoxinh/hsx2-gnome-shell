/**
 * Topbar Panel Controls — panel, clock, activities, indicators, search.
 * Borrows JP API engine via lookupByUUID (GCM host).
 */

import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

export default class TopbarPanelControlsExtension extends Extension {
    #mgr = null;

    enable() {
        console.log('[TPC] enable() called, metadata.settings-schema =', this.metadata['settings-schema']);
        const settings = this.getSettings();
        console.log('[TPC] getSettings() returned:', settings?.constructor?.name, 'null?', settings === null);
        if (settings) {
            try {
                console.log('[TPC] panel setting =', settings.get_boolean('panel'));
                console.log('[TPC] panel-size setting =', settings.get_int('panel-size'));
            } catch (e) {
                console.warn('[TPC] getSettings() read error:', e.message);
            }
        }
        this.#mgr = new TPCManager(settings);
        this.#mgr.start();
    }

    disable() {
        this.#mgr?.stop();
        this.#mgr = null;
    }
}

class TPCManager {
    #s = null;
    #a = null;

    constructor(s) { this.#s = s; }

    start() {
        console.log('[TPC] starting');

        // === DIRECT TEST: manipulate Main.panel directly ===
        try {
            console.log('[TPC] TEST: Main.panel exists =', !!Main?.panel);
            if (Main?.panel) {
                const origHeight = Main.panel.height;
                console.log('[TPC] TEST: Main.panel.height =', origHeight);
                // Try setting panel height directly
                Main.panel.height = 48;
                console.log('[TPC] TEST: set panel.height=48, new value =', Main.panel.height);
                Main.panel.height = origHeight;
                console.log('[TPC] TEST: restored to', origHeight);
            }
        } catch (e) {
            console.warn('[TPC] TEST panel error:', e.message);
        }

        // === API lookup ===
        this.#findAPI();

        // === Signal connections ===
        try {
            this.#connect();
            console.log('[TPC] signals connected');
        } catch (e) {
            console.warn('[TPC] connect() error:', e);
        }

        // === Apply initial settings ===
        this.#applyAll();
        console.log('[TPC] initial apply done');
    }

    stop() {
        this.#disconnect();
        this.#revertAll();
        this.#a = null;
    }

    #findAPI() {
        try {
            console.log('[TPC] #findAPI looking up alienware-gnome-customizer-manager@hsx2coder');
            const gcm = Extension.lookupByUUID('alienware-gnome-customizer-manager@hsx2coder');
            console.log('[TPC] lookup returned:', !!gcm, 'type:', typeof gcm);
            if (gcm) {
                console.log('[TPC] gcm keys:', Object.keys(gcm).filter(k => k.startsWith('_')));
            }
            if (gcm?._api) {
                this.#a = gcm._api;
                console.log('[TPC] API found ✓');
                // Test API directly
                try {
                    const testResult = this.#a.panelGetSize ? this.#a.panelGetSize() : 'no panelGetSize';
                    console.log('[TPC] API test: panelGetSize() =', testResult);
                } catch (e) {
                    console.warn('[TPC] API test error:', e.message);
                }
            } else {
                console.warn('[TPC] API NOT found (gcm:', !!gcm, 'gcm._api:', !!gcm?._api, ')');
            }
        } catch (e) {
            console.warn('[TPC] API lookup error:', e, e.message, e.stack);
        }
    }

    #api() {
        if (!this.#a) {
            console.warn('[TPC] #api() called but #a is null');
        }
        return this.#a;
    }

    #connect() {
        if (!this.#s) {
            console.warn('[TPC] cannot connect: settings is null');
            return;
        }
        this.#s.connectObject(
            'changed::panel', () => this.#applyPanel(false),
            'changed::panel-in-overview', () => this.#applyPanel(false),
            'changed::panel-size', () => this.#applyPanelSize(false),
            'changed::top-panel-position', () => this.#applyTopPanelPosition(false),
            'changed::panel-corner-size', () => this.#applyCornerSize(false),
            'changed::panel-button-padding-size', () => this.#applyBtnPad(false),
            'changed::panel-indicator-padding-size', () => this.#applyIndPad(false),
            'changed::panel-icon-size', () => this.#applyIconSize(false),
            'changed::activities-button', () => this.#applyActivities(false),
            'changed::background-menu', () => this.#applyBkgMenu(false),
            'changed::show-apps-button', () => this.#applyShowApps(false),
            'changed::clock-menu', () => this.#applyClock(false),
            'changed::clock-menu-position', () => this.#applyClockPos(false),
            'changed::clock-menu-position-offset', () => this.#applyClockPos(false),
            'changed::world-clock', () => this.#applyWorldClock(false),
            'changed::weather', () => this.#applyWeather(false),
            'changed::events-button', () => this.#applyEvents(false),
            'changed::calendar', () => this.#applyCalendar(false),
            'changed::panel-notification-icon', () => this.#applyNotifIcon(false),
            'changed::keyboard-layout', () => this.#applyKbLayout(false),
            'changed::accessibility-menu', () => this.#applyAccess(false),
            'changed::power-icon', () => this.#applyPower(false),
            'changed::screen-sharing-indicator', () => this.#applyShareScreen(false),
            'changed::screen-recording-indicator', () => this.#applyRecScreen(false),
            'changed::search', () => this.#applySearch(false),
            'changed::type-to-search', () => this.#applyTypeSearch(false),
            this
        );
    }

    #disconnect() { try { this.#s?.disconnectObject(this); } catch(e) { console.warn('[TPC] disconnect error:', e); } }

    #applyAll() {
        console.log('[TPC] applyAll');
        this.#applyPanel(false); this.#applyPanelSize(false); this.#applyTopPanelPosition(false);
        this.#applyCornerSize(false); this.#applyBtnPad(false); this.#applyIndPad(false);
        this.#applyIconSize(false); this.#applyActivities(false); this.#applyBkgMenu(false);
        this.#applyShowApps(false); this.#applyClock(false); this.#applyClockPos(false);
        this.#applyWorldClock(false); this.#applyWeather(false); this.#applyEvents(false);
        this.#applyCalendar(false); this.#applyNotifIcon(false); this.#applyKbLayout(false);
        this.#applyAccess(false); this.#applyPower(false); this.#applyShareScreen(false);
        this.#applyRecScreen(false); this.#applySearch(false); this.#applyTypeSearch(false);
    }

    #revertAll() {
        this.#applyPanel(true); this.#applyPanelSize(true); this.#applyTopPanelPosition(true);
        this.#applyCornerSize(true); this.#applyBtnPad(true); this.#applyIndPad(true);
        this.#applyIconSize(true); this.#applyActivities(true); this.#applyBkgMenu(true);
        this.#applyShowApps(true); this.#applyClock(true); this.#applyClockPos(true);
        this.#applyWorldClock(true); this.#applyWeather(true); this.#applyEvents(true);
        this.#applyCalendar(true); this.#applyNotifIcon(true); this.#applyKbLayout(true);
        this.#applyAccess(true); this.#applyPower(true); this.#applyShareScreen(true);
        this.#applyRecScreen(true); this.#applySearch(true); this.#applyTypeSearch(true);
    }

    // === Panel ===
    #applyPanel(f) {
        const a=this.#api();if(!a){console.warn('[TPC] applyPanel: no API');return;}
        const panel=this.#s.get_boolean('panel');
        if (f||panel) {a.panelShow();return;}
        // JP: mode=(panelInOverview)?1:0 — ALL(0)=hide, DESKTOP(1)=show in overview
        const mode=this.#s.get_boolean('panel-in-overview')?1:0;
        console.log('[TPC] applyPanel hide mode=',mode,'panel=',panel,'pin=',this.#s.get_boolean('panel-in-overview'));
        a.panelHide(mode);
    }
    #applyPanelSize(f) { const a=this.#api();if(!a){console.warn('[TPC] applyPanelSize: no API');return;}const v=this.#s.get_int('panel-size');console.log('[TPC] applyPanelSize',v,'revert=',f);f||v===0?a.panelSetDefaultSize():a.panelSetSize(v);console.log('[TPC] after panelSetSize, Main.panel.height =', Main?.panel?.height); }
    #applyTopPanelPosition(f) { const a=this.#api();if(!a)return;f||this.#s.get_int('top-panel-position')===0?a.panelSetPosition(0):a.panelSetPosition(1); }
    #applyCornerSize(f) { const a=this.#api();if(!a)return;const v=this.#s.get_int('panel-corner-size');f||v===0?a.panelButtonHpaddingSetDefault():a.panelButtonHpaddingSizeSet(v); }
    #applyBtnPad(f) { const a=this.#api();if(!a)return;const v=this.#s.get_int('panel-button-padding-size');f||v===0?a.panelButtonHpaddingSetDefault():a.panelButtonHpaddingSizeSet(v); }
    #applyIndPad(f) { const a=this.#api();if(!a)return;const v=this.#s.get_int('panel-indicator-padding-size');f||v===0?a.panelIndicatorPaddingSetDefault():a.panelIndicatorPaddingSizeSet(v); }
    #applyIconSize(f) { const a=this.#api();if(!a)return;const v=this.#s.get_int('panel-icon-size');f||v===0?a.panelIconSetDefaultSize():a.panelIconSetSize(v); }
    // === Activities ===
    #applyActivities(f) { const a=this.#api();if(!a)return;f||this.#s.get_boolean('activities-button')?a.activitiesButtonShow():a.activitiesButtonHide(); }
    #applyBkgMenu(f) { const a=this.#api();if(!a)return;f||this.#s.get_boolean('background-menu')?a.backgroundMenuEnable():a.backgroundMenuDisable(); }
    #applyShowApps(f) { const a=this.#api();if(!a)return;f||this.#s.get_boolean('show-apps-button')?a.showAppsButtonEnable():a.showAppsButtonDisable(); }
    // === Clock ===
    #applyClock(f) { const a=this.#api();if(!a)return;f||this.#s.get_boolean('clock-menu')?a.dateMenuShow():a.dateMenuHide(); }
    #applyClockPos(f) { const a=this.#api();if(!a)return;const p=this.#s.get_int('clock-menu-position');const o=this.#s.get_int('clock-menu-position-offset');f||(p===0&&o===0)?a.clockMenuPositionSetDefault():a.clockMenuPositionSet(p,o); }
    #applyWorldClock(f) { const a=this.#api();if(!a)return;f||this.#s.get_boolean('world-clock')?a.worldClocksShow():a.worldClocksHide(); }
    #applyWeather(f) { const a=this.#api();if(!a)return;f||this.#s.get_boolean('weather')?a.weatherShow():a.weatherHide(); }
    #applyEvents(f) { const a=this.#api();if(!a)return;f||this.#s.get_boolean('events-button')?a.eventsButtonShow():a.eventsButtonHide(); }
    #applyCalendar(f) { const a=this.#api();if(!a)return;f||this.#s.get_boolean('calendar')?a.calendarShow():a.calendarHide(); }
    // === Indicators ===
    #applyNotifIcon(f) { const a=this.#api();if(!a)return;f||this.#s.get_boolean('panel-notification-icon')?a.panelNotificationIconEnable():a.panelNotificationIconDisable(); }
    #applyKbLayout(f) { const a=this.#api();if(!a)return;f||this.#s.get_boolean('keyboard-layout')?a.keyboardLayoutShow():a.keyboardLayoutHide(); }
    #applyAccess(f) { const a=this.#api();if(!a)return;f||this.#s.get_boolean('accessibility-menu')?a.accessibilityMenuShow():a.accessibilityMenuHide(); }
    #applyPower(f) { const a=this.#api();if(!a)return;f||this.#s.get_boolean('power-icon')?a.powerIconShow():a.powerIconHide(); }
    #applyShareScreen(f) { const a=this.#api();if(!a)return;f||this.#s.get_boolean('screen-sharing-indicator')?a.screenSharingIndicatorEnable():a.screenSharingIndicatorDisable(); }
    #applyRecScreen(f) { const a=this.#api();if(!a)return;f||this.#s.get_boolean('screen-recording-indicator')?a.screenRecordingIndicatorEnable():a.screenRecordingIndicatorDisable(); }
    // === Search ===
    #applySearch(f) { const a=this.#api();if(!a)return;f||this.#s.get_boolean('search')?a.searchEntryShow():a.searchEntryHide(); }
    #applyTypeSearch(f) { const a=this.#api();if(!a)return;f||this.#s.get_boolean('type-to-search')?a.startSearchEnable():a.startSearchDisable(); }
}
