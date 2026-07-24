/**
 * Gnome Customizer Manager — Extension entry point + API host.
 *
 * Self-hosts the JP API engine (API.js) and exposes it via _api
 * so that Workspace Control and Topbar Panel Controls can borrow it.
 * Also applies 24 GCM settings via CustomizerManager.
 */

import Clutter from 'gi://Clutter';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Panel from 'resource:///org/gnome/shell/ui/panel.js';
import * as BackgroundMenu from 'resource:///org/gnome/shell/ui/backgroundMenu.js';
import * as OverviewControls from 'resource:///org/gnome/shell/ui/overviewControls.js';
import * as WorkspaceSwitcherPopup from 'resource:///org/gnome/shell/ui/workspaceSwitcherPopup.js';
import * as SwitcherPopup from 'resource:///org/gnome/shell/ui/switcherPopup.js';
const InterfaceSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
import * as Search from 'resource:///org/gnome/shell/ui/search.js';
import * as SearchController from 'resource:///org/gnome/shell/ui/searchController.js';
import * as WorkspaceThumbnail from 'resource:///org/gnome/shell/ui/workspaceThumbnail.js';
import * as WorkspacesView from 'resource:///org/gnome/shell/ui/workspacesView.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as WindowPreview from 'resource:///org/gnome/shell/ui/windowPreview.js';
import * as Workspace from 'resource:///org/gnome/shell/ui/workspace.js';
import * as LookingGlass from 'resource:///org/gnome/shell/ui/lookingGlass.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import * as OSDWindow from 'resource:///org/gnome/shell/ui/osdWindow.js';
import * as WindowMenu from 'resource:///org/gnome/shell/ui/windowMenu.js';
import * as AltTab from 'resource:///org/gnome/shell/ui/altTab.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {API} from './lib/API.js';
import {ScreenshotBox} from './lib/ScreenshotBox.js';

export default class GnomeCustomizerManagerExtension extends Extension {
    #api = null;
    #manager = null;

    enable() {
        const shellVersion = Number.parseInt(
            Config.PACKAGE_VERSION.split('.')[0]
        );
        this.#api = new API(
            {
                Main,
                St,
                Clutter,
                Gdk,
                GLib,
                Meta,
                GObject,
                Panel,
                BackgroundMenu,
                OverviewControls,
                WorkspaceSwitcherPopup,
                SwitcherPopup,
                InterfaceSettings,
                Search,
                SearchController,
                WorkspaceThumbnail,
                WorkspacesView,
                PanelMenu,
                WindowPreview,
                Workspace,
                LookingGlass,
                MessageTray,
                OSDWindow,
                WindowMenu,
                AltTab,
                Util,
            },
            shellVersion
        );

        // Expose API for child modules (Workspace Control, Topbar Panel Controls)
        this._api = this.#api;
        this.#api.open();

        const settings = this.getSettings();
        this.#manager = new CustomizerManager(settings, this.#api);
        this.#manager.start();

        console.log('[gnome-customizer-manager] API engine active');
    }

    disable() {
        this.#manager?.stop();
        this.#manager = null;
        this.#api?.close();
        this.#api = null;
        this._api = null;
    }
}

class CustomizerManager {
    #settings = null;
    #api = null;
    #screenshotBox = null;

    constructor(settings, api) {
        this.#settings = settings;
        this.#api = api;
        this.#screenshotBox = new ScreenshotBox({
            Settings: this.#settings,
            Gdk: Gdk,
        });
    }

    start() {
        console.log('[GCM] start(), api?', !!this.#api);
        this.#registerSignals();
        this.#applyAll();
        this.#screenshotBox?.enable();
    }

    stop() {
        this.#screenshotBox?.disable();
        this.#disconnectSignals();
        this.#revertAll();
        this.#screenshotBox = null;
        this.#api = null;
    }

    #registerSignals() {
        this.#settings.connectObject(
            'changed::animation',                        () => this.#applyAnimation(false),
            'changed::window-demands-attention-focus',   () => this.#applyWinDemandFocus(false),
            'changed::window-maximized-on-create',       () => this.#applyWinMaxOnCreate(false),
            'changed::window-preview-caption',           () => this.#applyWinPreviewCaption(false),
            'changed::window-preview-close-button',      () => this.#applyWinPreviewClose(false),
            'changed::window-picker-icon',               () => this.#applyWinPickerIcon(false),
            'changed::window-menu',                      () => this.#applyWindowMenu(false),
            'changed::window-menu-take-screenshot-button', () => this.#applyWinMenuScreenshot(false),
            'changed::osd',                              () => this.#applyOSD(false),
            'changed::osd-position',                     () => this.#applyOSDPosition(false),
            'changed::quick-settings',                   () => this.#applyQuickSettings(false),
            'changed::quick-settings-dark-mode',          () => this.#applyQSDarkMode(false),
            'changed::quick-settings-night-light',        () => this.#applyQSNightLight(false),
            'changed::quick-settings-do-not-disturb',     () => this.#applyQSDoNotDisturb(false),
            'changed::quick-settings-backlight',          () => this.#applyQSBacklight(false),
            'changed::quick-settings-airplane-mode',      () => this.#applyQSAirplaneMode(false),
            'changed::theme',                            () => this.#applyTheme(false),
            'changed::looking-glass-width',               () => this.#applyLGSize(false),
            'changed::looking-glass-height',               () => this.#applyLGSize(false),
            'changed::accent-color-icon',                 () => this.#applyAccentColor(false),
            'changed::max-displayed-search-results',      () => this.#applyMaxSearchResults(false),
            'changed::remove-preselected-box',             () => this.#applyScreenshotBox(false),
            'changed::screenshot-on-release',              () => this.#applyScreenshotRelease(false),
            'changed::invert-calendar-column-items',       () => this.#applyInvertCalendar(false),
            this
        );
    }

    #disconnectSignals() {
        this.#settings.disconnectObject(this);
    }

    #applyAll() {
        this.#applyAnimation(false);
        this.#applyWinDemandFocus(false);
        this.#applyWinMaxOnCreate(false);
        this.#applyWinPreviewCaption(false);
        this.#applyWinPreviewClose(false);
        this.#applyWinPickerIcon(false);
        this.#applyWindowMenu(false);
        this.#applyWinMenuScreenshot(false);
        this.#applyOSD(false);
        this.#applyOSDPosition(false);
        this.#applyQuickSettings(false);
        this.#applyQSDarkMode(false);
        this.#applyQSNightLight(false);
        this.#applyQSDoNotDisturb(false);
        this.#applyQSBacklight(false);
        this.#applyQSAirplaneMode(false);
        this.#applyTheme(false);
        this.#applyLGSize(false);
        this.#applyAccentColor(false);
        this.#applyMaxSearchResults(false);
        this.#applyScreenshotBox(false);
        this.#applyScreenshotRelease(false);
        this.#applyInvertCalendar(false);
    }

    #revertAll() {
        this.#applyAnimation(true);
        this.#applyWinDemandFocus(true);
        this.#applyWinMaxOnCreate(true);
        this.#applyWinPreviewCaption(true);
        this.#applyWinPreviewClose(true);
        this.#applyWinPickerIcon(true);
        this.#applyWindowMenu(true);
        this.#applyWinMenuScreenshot(true);
        this.#applyOSD(true);
        this.#applyOSDPosition(true);
        this.#applyQuickSettings(true);
        this.#applyQSDarkMode(true);
        this.#applyQSNightLight(true);
        this.#applyQSDoNotDisturb(true);
        this.#applyQSBacklight(true);
        this.#applyQSAirplaneMode(true);
        this.#applyTheme(true);
        this.#applyLGSize(true);
        this.#applyAccentColor(true);
        this.#applyMaxSearchResults(true);
        this.#applyScreenshotBox(true);
        this.#applyScreenshotRelease(true);
        this.#applyInvertCalendar(true);
    }

    #a() { return this.#api; }

    // --- Animation ---
    #applyAnimation(f) {
        const a = this.#a(); if (!a) return;
        if (f || this.#settings.get_int('animation') === 1)
            a.animationSpeedSetDefault();
        else
            a.animationSpeedSet(this.#settings.get_int('animation'));
    }

    // --- Window ---
    #applyWinDemandFocus(f) {
        const a = this.#a(); if (!a) return;
        f || this.#settings.get_boolean('window-demands-attention-focus')
            ? a.windowDemandsAttentionFocusEnable() : a.windowDemandsAttentionFocusDisable();
    }
    #applyWinMaxOnCreate(f) {
        const a = this.#a(); if (!a) return;
        f || this.#settings.get_boolean('window-maximized-on-create')
            ? a.windowMaximizedOnCreateEnable() : a.windowMaximizedOnCreateDisable();
    }
    #applyWinPreviewCaption(f) {
        const a = this.#a(); if (!a) return;
        f || this.#settings.get_boolean('window-preview-caption')
            ? a.windowPreviewCaptionEnable() : a.windowPreviewCaptionDisable();
    }
    #applyWinPreviewClose(f) {
        const a = this.#a(); if (!a) return;
        f || this.#settings.get_boolean('window-preview-close-button')
            ? a.windowPreviewCloseButtonEnable() : a.windowPreviewCloseButtonDisable();
    }
    #applyWinPickerIcon(f) {
        const a = this.#a(); if (!a) return;
        f || this.#settings.get_boolean('window-picker-icon')
            ? a.windowPickerIconEnable() : a.windowPickerIconDisable();
    }
    #applyWindowMenu(f) {
        const a = this.#a(); if (!a) return;
        f || this.#settings.get_boolean('window-menu')
            ? a.windowMenuShow() : a.windowMenuHide();
    }
    #applyWinMenuScreenshot(f) {
        const a = this.#a(); if (!a) return;
        f || this.#settings.get_boolean('window-menu-take-screenshot-button')
            ? a.screenshotInWindowMenuShow() : a.screenshotInWindowMenuHide();
    }

    // --- OSD ---
    #applyOSD(f) {
        const a = this.#a(); if (!a) return;
        f || this.#settings.get_boolean('osd')
            ? a.OSDEnable() : a.OSDDisable();
    }
    #applyOSDPosition(f) {
        const a = this.#a(); if (!a) return;
        const pos = this.#settings.get_int('osd-position');
        if (f || pos === 0) a.osdPositionSetDefault();
        else a.osdPositionSet(pos);
    }

    // --- Quick Settings ---
    #applyQuickSettings(f) {
        const a = this.#a(); if (!a) return;
        f || this.#settings.get_boolean('quick-settings')
            ? a.quickSettingsMenuShow() : a.quickSettingsMenuHide();
    }
    #applyQSDarkMode(f) {
        const a = this.#a(); if (!a) return;
        f || this.#settings.get_boolean('quick-settings-dark-mode')
            ? a.quickSettingsDarkStyleToggleShow() : a.quickSettingsDarkStyleToggleHide();
    }
    #applyQSNightLight(f) {
        const a = this.#a(); if (!a) return;
        f || this.#settings.get_boolean('quick-settings-night-light')
            ? a.quickSettingsNightLightToggleShow() : a.quickSettingsNightLightToggleHide();
    }
    #applyQSDoNotDisturb(f) {
        const a = this.#a(); if (!a) return;
        f || this.#settings.get_boolean('quick-settings-do-not-disturb')
            ? a.quickSettingsDoNotDisturbToggleShow() : a.quickSettingsDoNotDisturbToggleHide();
    }
    #applyQSBacklight(f) {
        const a = this.#a(); if (!a) return;
        f || this.#settings.get_boolean('quick-settings-backlight')
            ? a.quickSettingsBacklightToggleShow() : a.quickSettingsBacklightToggleHide();
    }
    #applyQSAirplaneMode(f) {
        const a = this.#a(); if (!a) return;
        f || this.#settings.get_boolean('quick-settings-airplane-mode')
            ? a.quickSettingsAirplaneModeToggleShow() : a.quickSettingsAirplaneModeToggleHide();
    }

    // --- Theme ---
    #applyTheme(f) {
        const a = this.#a(); if (!a) return;
        // Match JP exactly: add 'just-perfection' when enabled, remove when disabled
        if (f || !this.#settings.get_boolean('theme'))
            a.UIStyleClassRemove('just-perfection');
        else
            a.UIStyleClassAdd('just-perfection');
    }

    // --- Looking Glass ---
    #applyLGSize() {
        const a = this.#a(); if (!a) return;
        const w = this.#settings.get_int('looking-glass-width');
        const h = this.#settings.get_int('looking-glass-height');
        if (w === 0 && h === 0) a.lookingGlassSetDefaultSize();
        else a.lookingGlassSetSize(w, h);
    }

    // --- Accent ---
    #applyAccentColor(f) {
        const a = this.#a(); if (!a) return;
        f || this.#settings.get_boolean('accent-color-icon')
            ? a.accentColorIconEnable() : a.accentColorIconDisable();
    }

    // --- Search ---
    #applyMaxSearchResults(f) {
        const a = this.#a(); if (!a) return;
        const val = this.#settings.get_int('max-displayed-search-results');
        f || val === 0
            ? a.setMaxDisplayedSearchResultToDefault()
            : a.setMaxDisplayedSearchResult(val);
    }

    // --- Screenshot (handled by ScreenshotBox internally via its own signal connections) ---
    #applyScreenshotBox(f) {}
    #applyScreenshotRelease(f) {}

    // --- Calendar ---
    #applyInvertCalendar(f) {
        const a = this.#a(); if (!a) return;
        f || this.#settings.get_boolean('invert-calendar-column-items')
            ? a.invertCalendarColumnItems()
            : a.revertCalendarColumnItemsToDefault();
    }
}
