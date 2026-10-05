/**
 * Gnome Customizer Manager — Extension entry point + API host.
 *
 * Self-hosts the shell-tweak engine (API.js) for theme, workspace, overview and
 * OSD. Workspace Control lives in subsystems/ and takes the instance directly;
 * the panel half of the old engine moved to alienware-topbar.
 * Also applies 24 GCM settings via CustomizerManager.
 */

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import St from 'gi://St';
import Gdk from 'gi://Gdk';

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
import {WorkspaceControl} from './subsystems/workspace-control.js';
import {UserShellThemeSubsystem} from './subsystems/user-shell-theme/subsystem.js';
import {NotificationConfiguratorSubsystem} from './subsystems/notification-configurator/subsystem.js';

export default class GnomeCustomizerManagerExtension extends Extension {
    #api = null;
    #manager = null;
    #notifications = null;
    #shellTheme = null;

    enable() {
        const shellVersion = Number.parseInt(
            Config.PACKAGE_VERSION.split('.')[0]
        );
        this.#api = new API(
            {
                Main,
                St,
                Gdk,
                Clutter,
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

        // Workspace Control below takes this instance directly; the panel domain
        // moved to alienware-topbar, so nothing crosses the module boundary now
        this._api = this.#api;
        this.#api.open();

        const settings = this.getSettings();
        this.#manager = new CustomizerManager(settings, this.#api);
        this.#manager.start();

        try {
            const notifSettings = this.getSettings('org.gnome.shell.extensions.notification-configurator');
            this.#notifications = new NotificationConfiguratorSubsystem(notifSettings);
            this.#notifications.start();
            this.#shellTheme = new UserShellThemeSubsystem();
            this.#shellTheme.start();
        } catch (e) {
            logError(e, '[GCM] notification subsystem start failed');
        }

        log('[gnome-customizer-manager] API engine active');
    }

    disable() {
        try {
            this.#notifications?.stop();
            this.#shellTheme?.stop();
            this.#shellTheme = null;
        } catch (e) {
            logError(e, '[GCM] notification subsystem stop failed');
        }
        this.#notifications = null;

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

    #workspace = null;

    constructor(settings, api) {
        this.#settings = settings;
        this.#api = api;
        this.#screenshotBox = new ScreenshotBox({
            Settings: this.#settings,
            Gdk: Gdk,
        });
        this.#workspace = new WorkspaceControl(this.#settings, api);
    }

    start() {
        log('[GCM] start(), api?', !!this.#api);
        this.#registerSignals();
        this.#applyAll();
        this.#screenshotBox?.enable();
        this.#workspace.start();
    }

    stop() {
        this.#workspace?.stop();
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
            'changed::window-picker-icon',               () => this.#applyWinPickerIcon(false),
            'changed::window-menu',                      () => this.#applyWindowMenu(false),
            'changed::window-menu-take-screenshot-button', () => this.#applyWinMenuScreenshot(false),
            'changed::osd',                              () => this.#applyOSD(false),
            'changed::osd-position',                     () => this.#applyOSDPosition(false),
            'changed::theme',                            () => this.#applyTheme(false),
            'changed::looking-glass-width',               () => this.#applyLGSize(false),
            'changed::looking-glass-height',               () => this.#applyLGSize(false),
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
        this.#applyWinPickerIcon(false);
        this.#applyWindowMenu(false);
        this.#applyWinMenuScreenshot(false);
        this.#applyOSD(false);
        this.#applyOSDPosition(false);
        this.#applyTheme(false);
        this.#applyLGSize(false);
    }

    #revertAll() {
        this.#applyAnimation(true);
        this.#applyWinDemandFocus(true);
        this.#applyWinMaxOnCreate(true);
        this.#applyWinPickerIcon(true);
        this.#applyWindowMenu(true);
        this.#applyWinMenuScreenshot(true);
        this.#applyOSD(true);
        this.#applyOSDPosition(true);
        this.#applyTheme(true);
        this.#applyLGSize(true);
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
        !f && this.#settings.get_boolean('window-demands-attention-focus')
            ? a.windowDemandsAttentionFocusEnable() : a.windowDemandsAttentionFocusDisable();
    }
    #applyWinMaxOnCreate(f) {
        const a = this.#a(); if (!a) return;
        !f && this.#settings.get_boolean('window-maximized-on-create')
            ? a.windowMaximizedOnCreateEnable() : a.windowMaximizedOnCreateDisable();
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
    // --- Search ---
}
