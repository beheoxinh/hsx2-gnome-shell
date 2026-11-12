/**
 * Gnome Customizer Manager — tweaks to GNOME Shell's own components.
 *
 * Everything here changes something GNOME ships (animations, windows, OSD,
 * overview & workspaces, the top bar's date menu and quick settings, shell
 * theme, screenshot UI, notifications); panel geometry and panel items belong
 * to alienware-topbar, Alt+Tab to alienware-advanced-alt-tab, the dash to
 * alienware-dash-to-panel.
 *
 * The shell-tweak engine (lib/API.js) is owned here and handed directly to
 * CustomizerManager and WorkspaceControl; nothing crosses a module boundary.
 */

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as OverviewControls from 'resource:///org/gnome/shell/ui/overviewControls.js';
import * as WorkspaceSwitcherPopup from 'resource:///org/gnome/shell/ui/workspaceSwitcherPopup.js';
import * as WorkspaceThumbnail from 'resource:///org/gnome/shell/ui/workspaceThumbnail.js';
import * as WorkspacesView from 'resource:///org/gnome/shell/ui/workspacesView.js';
import * as Workspace from 'resource:///org/gnome/shell/ui/workspace.js';
import * as OSDWindow from 'resource:///org/gnome/shell/ui/osdWindow.js';
import * as WindowMenu from 'resource:///org/gnome/shell/ui/windowMenu.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {API} from './lib/API.js';
import {ScreenshotBox} from './lib/ScreenshotBox.js';
import {WorkspaceControl} from './subsystems/workspace-control.js';
import {UserShellThemeSubsystem} from './subsystems/user-shell-theme/subsystem.js';
import {NotificationConfiguratorSubsystem} from './subsystems/notification-configurator/subsystem.js';
import {QuickSettingsCustomizer} from './subsystems/panel-menus/quick-settings.js';
import {DateMenuCustomizer} from './subsystems/panel-menus/date-menu.js';

/**
 * slow_down_factor for animation values 2..8 (0 = off, 1 = GNOME default).
 * The value used to be passed straight through, and since a bigger factor is
 * slower, every "faster" choice made animations 2-8x slower and 0 froze them.
 */
const ANIMATION_FACTORS = [0.01, 0.2, 0.6, 0.8, 1.3, 1.6, 2.8];

export default class GnomeCustomizerManagerExtension extends Extension {
    #api = null;
    #manager = null;
    #notifications = null;
    #shellTheme = null;
    #quickSettings = null;
    #dateMenu = null;

    enable() {
        const shellVersion = Number.parseInt(
            Config.PACKAGE_VERSION.split('.')[0]
        );
        this.#api = new API(
            {
                Main,
                St,
                Clutter,
                Meta,
                GObject,
                OverviewControls,
                WorkspaceSwitcherPopup,
                WorkspaceThumbnail,
                WorkspacesView,
                Workspace,
                OSDWindow,
                WindowMenu,
                Util,
            },
            shellVersion
        );

        this.#api.open();

        const settings = this.getSettings();
        this.#manager = new CustomizerManager(settings, this.#api);
        this.#manager.start();

        // GNOME's own top bar menus: Quick Settings and the date menu
        try {
            this.#quickSettings = new QuickSettingsCustomizer(settings, shellVersion);
            this.#quickSettings.start();
        } catch (e) {
            logError(e, '[GCM] quick settings start failed');
        }
        try {
            this.#dateMenu = new DateMenuCustomizer(settings, this.#api, shellVersion);
            this.#dateMenu.start();
        } catch (e) {
            logError(e, '[GCM] date menu start failed');
        }

        try {
            const notifSettings = this.getSettings('org.gnome.shell.extensions.notification-configurator');
            this.#notifications = new NotificationConfiguratorSubsystem(notifSettings);
            this.#notifications.start();
            this.#shellTheme = new UserShellThemeSubsystem(this.path);
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

        for (const [name, part] of [['date menu', this.#dateMenu], ['quick settings', this.#quickSettings]]) {
            try {
                part?.stop();
            } catch (e) {
                logError(e, `[GCM] ${name} stop failed`);
            }
        }
        this.#dateMenu = null;
        this.#quickSettings = null;

        this.#manager?.stop();
        this.#manager = null;
        this.#api?.close();
        this.#api = null;
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
        });
        this.#workspace = new WorkspaceControl(this.#settings, api);
    }

    start() {
        for (const [keys, apply] of this.#table()) {
            for (const key of keys)
                this.#settings.connectObject(`changed::${key}`, () => this.#run(key, apply, false), this);
            this.#run(keys[0], apply, false);
        }
        this.#screenshotBox?.enable();
        this.#workspace.start();
    }

    stop() {
        this.#workspace?.stop();
        this.#screenshotBox?.disable();
        this.#settings.disconnectObject(this);
        for (const [keys, apply] of this.#table())
            this.#run(keys[0], apply, true);
        this.#screenshotBox = null;
        this.#api = null;
    }

    #run(key, apply, revert) {
        try {
            apply(revert);
        } catch (e) {
            logError(e, `[GCM] ${revert ? 'revert' : 'apply'} ${key} failed`);
        }
    }

    /**
     * [[keys that feed it], apply(revert)]; `revert` restores GNOME's default
     */
    #table() {
        const a = this.#api;
        const s = this.#settings;
        const on = key => s.get_boolean(key);
        return [
            [['animation'], r => {
                const v = s.get_int('animation');
                if (r || v === 1) {
                    a.animationSpeedSetDefault();
                    a.animationsEnable();
                } else if (v === 0) {
                    a.animationSpeedSetDefault();
                    a.animationsDisable();
                } else {
                    a.animationsEnable();
                    a.animationSpeedSet(ANIMATION_FACTORS[v - 2] ?? 1);
                }
            }],
            [['window-demands-attention-focus'], r => !r && on('window-demands-attention-focus')
                ? a.windowDemandsAttentionFocusEnable() : a.windowDemandsAttentionFocusDisable()],
            [['window-maximized-on-create'], r => !r && on('window-maximized-on-create')
                ? a.windowMaximizedOnCreateEnable() : a.windowMaximizedOnCreateDisable()],
            [['window-picker-icon'], r => r || on('window-picker-icon')
                ? a.windowPickerIconEnable() : a.windowPickerIconDisable()],
            [['window-menu'], r => r || on('window-menu')
                ? a.windowMenuShow() : a.windowMenuHide()],
            [['window-menu-take-screenshot-button'], r => r || on('window-menu-take-screenshot-button')
                ? a.screenshotInWindowMenuShow() : a.screenshotInWindowMenuHide()],
            [['fullscreen-unredirect'], r => r || on('fullscreen-unredirect')
                ? a.fullscreenUnredirectEnable() : a.fullscreenUnredirectDisable()],
            [['osd'], r => r || on('osd') ? a.OSDEnable() : a.OSDDisable()],
            // 0 is "default"; 1..9 map onto the engine's 0-based XY_POSITION
            // (the value used to be passed as is, so every choice was one off
            // and the last one matched nothing)
            [['osd-position'], r => {
                const pos = s.get_int('osd-position');
                if (r || pos === 0)
                    a.osdPositionSetDefault();
                else
                    a.osdPositionSet(pos - 1);
            }],
            [['theme'], r => !r && on('theme')
                ? a.UIStyleClassAdd('just-perfection') : a.UIStyleClassRemove('just-perfection')],
        ];
    }
}
