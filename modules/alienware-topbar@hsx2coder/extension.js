/**
 * alienware-topbar — sole owner of the GNOME Shell top bar.
 *
 * Subsystems, in enable order:
 *   panel          geometry, visibility, panel items, clock, quick settings
 *   topbar-clone   the same bar rendered on every secondary monitor
 *   widgets        clipboard indicator and command menus injected into the bar
 *
 * Everything that needs to reach the panel from another module goes through
 * PanelHost (subsystems/panel/host.js); nothing outside this directory may
 * import Main.panel for writing.
 */

import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {PanelHost} from './subsystems/panel/host.js';
import {PanelExtension} from './subsystems/panel/extension.js';
import {TopbarCloneSubsystem} from './subsystems/topbar-clone/main.js';
import ClipboardIndicatorExtension from './subsystems/widgets/clipboard/extension.js';
import CommandMenuExtension from './subsystems/widgets/command-menu/extension.js';
import SystemMonitorExtension from './subsystems/system-monitor/extension.js';
import AppIndicatorExtension from './subsystems/appindicator/extension.js';
import CapsNumTouchpadExtension from './subsystems/capsnum-touchpad/extension.js';

const SUB_SCHEMAS = {
    clipboard: 'org.gnome.shell.extensions.clipboard-indicator',
    commandMenu: 'org.gnome.shell.extensions.commandmenu2',
    systemMonitor: 'org.gnome.shell.extensions.system-monitor-next-applet',
    appIndicator: 'org.gnome.shell.extensions.indicators-appindicator',
    capsNumTouchpad: 'org.gnome.shell.extensions.capsnum-touchpad',
};

export default class TopbarExtension extends Extension {
    #panel = null;
    #clone = null;
    #clipboard = null;
    #commandMenu = null;
    #systemMonitor = null;
    #appIndicator = null;
    #capsNumTouchpad = null;
    #hostUnwatch = null;
    #settingsIds = [];

    enable() {
        const shellVersion = Number.parseInt(Config.PACKAGE_VERSION.split('.')[0]);
        PanelHost.enable(shellVersion);

        const settings = this.getSettings();

        this.#panel = new PanelExtension(settings);
        this.#panel.enable();

        // widgets are panel items: rebuild them when the panel engine restarts
        this.#hostUnwatch = PanelHost.watch(() => this.#rebuildWidgets());

        this.#clone = new TopbarCloneSubsystem({settings, extension: this});
        this.#clone.enable();

        this.#settingsIds.push(settings.connect('changed::enable-system-monitor', () => {
            if (!settings.get_boolean('enable-system-monitor')) {
                // If clock-visible was turned off due to System Monitor replacement, re-enable clock
                if (!settings.get_boolean('clock-visible')) {
                    settings.set_boolean('clock-visible', true);
                } else {
                    PanelHost.api?.dateMenuShow?.();
                }
            }
            this.#rebuildWidgets();
        }));
        this.#settingsIds.push(settings.connect('changed::enable-indicators', () => this.#rebuildWidgets()));

        this.#rebuildWidgets();
    }

    disable() {
        for (const id of this.#settingsIds) {
            try { this.getSettings()?.disconnect(id); } catch (e) {}
        }
        this.#settingsIds = [];
        this.#rebuildWidgets(true);
        this.#hostUnwatch?.();
        this.#hostUnwatch = null;

        this.#clone?.disable();
        this.#clone = null;

        this.#panel?.disable();
        this.#panel = null;

        PanelHost.disable();
    }

    /**
     * Tear the widget subsystems down, then build them again unless this is
     * the disabling pass. One teardown path so a future field cannot be added
     * to only one of two identical blocks.
     * @param {boolean} teardown true while disabling
     */
    #rebuildWidgets(teardown = false) {
        try {
            this.#capsNumTouchpad?.disable();
        } catch (e) {
            logError(e, '[alienware-topbar] capsNumTouchpad disable failed');
        }
        this.#capsNumTouchpad = null;

        try {
            this.#appIndicator?.disable();
        } catch (e) {
            logError(e, '[alienware-topbar] appIndicator disable failed');
        }
        this.#appIndicator = null;

        try {
            this.#systemMonitor?.disable();
        } catch (e) {
            logError(e, '[alienware-topbar] systemMonitor disable failed');
        }
        this.#systemMonitor = null;

        try {
            this.#commandMenu?.disable();
        } catch (e) {
            logError(e, '[alienware-topbar] commandMenu disable failed');
        }
        this.#commandMenu = null;

        try {
            this.#clipboard?.disable();
        } catch (e) {
            logError(e, '[alienware-topbar] clipboard disable failed');
        }
        this.#clipboard = null;

        if (teardown)
            return;

        const settings = this.getSettings();

        // each widget subsystem is a real Extension and needs its own
        // settings-schema, but the schemas dir is this module's
        const baseMeta = {
            uuid: this.uuid,
            dir: this.dir,
            path: this.path,
            url: `file://${this.path}/`,
        };

        try {
            this.#clipboard = new ClipboardIndicatorExtension({
                ...baseMeta,
                ...this.metadata,
                'settings-schema': SUB_SCHEMAS.clipboard,
            });
            this.#clipboard.enable();
        } catch (e) {
            logError(e, '[alienware-topbar] clipboard enable failed');
        }

        try {
            this.#commandMenu = new CommandMenuExtension({
                ...baseMeta,
                ...this.metadata,
                'settings-schema': SUB_SCHEMAS.commandMenu,
            });
            this.#commandMenu.enable();
        } catch (e) {
            logError(e, '[alienware-topbar] commandMenu enable failed');
        }

        if (settings.get_boolean('enable-system-monitor')) {
            try {
                this.#systemMonitor = new SystemMonitorExtension({
                    ...baseMeta,
                    ...this.metadata,
                    'settings-schema': SUB_SCHEMAS.systemMonitor,
                });
                this.#systemMonitor.enable();
            } catch (e) {
                logError(e, '[alienware-topbar] systemMonitor enable failed');
            }
        }

        if (settings.get_boolean('enable-indicators')) {
            try {
                this.#appIndicator = new AppIndicatorExtension({
                    ...baseMeta,
                    ...this.metadata,
                    'settings-schema': SUB_SCHEMAS.appIndicator,
                });
                this.#appIndicator.enable();
            } catch (e) {
                logError(e, '[alienware-topbar] appIndicator enable failed');
            }
        }

        try {
            this.#capsNumTouchpad = new CapsNumTouchpadExtension({
                ...baseMeta,
                ...this.metadata,
                'settings-schema': SUB_SCHEMAS.capsNumTouchpad,
            });
            this.#capsNumTouchpad.enable();
        } catch (e) {
            logError(e, '[alienware-topbar] capsNumTouchpad enable failed');
        }
    }
}
