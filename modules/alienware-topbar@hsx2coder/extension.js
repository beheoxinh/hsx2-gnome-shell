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

import Config from 'resource:///org/gnome/shell/misc/config.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {PanelHost} from './subsystems/panel/host.js';
import {PanelExtension} from './subsystems/panel/extension.js';
import {TopbarCloneSubsystem} from './subsystems/topbar-clone/main.js';
import ClipboardIndicatorExtension from './subsystems/widgets/clipboard/extension.js';
import CommandMenuExtension from './subsystems/widgets/command-menu/extension.js';

const SUB_SCHEMAS = {
    clipboard: 'org.gnome.shell.extensions.clipboard-indicator',
    commandMenu: 'org.gnome.shell.extensions.commandmenu2',
};

export default class TopbarExtension extends Extension {
    #panel = null;
    #clone = null;
    #clipboard = null;
    #commandMenu = null;
    #hostUnwatch = null;

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

        this.#rebuildWidgets();
    }

    disable() {
        this.#rebuildWidgets(true);
        this.#hostUnwatch?.();
        this.#hostUnwatch = null;

        this.#clone?.disable();
        this.#clone = null;

        this.#panel?.disable();
        this.#panel = null;

        PanelHost.disable();
    }

    /** @param {boolean} teardown true while disabling */
    #rebuildWidgets(teardown = false) {
        if (teardown) {
            this.#commandMenu?.disable();
            this.#commandMenu = null;
            this.#clipboard?.disable();
            this.#clipboard = null;
            return;
        }

        this.#commandMenu?.disable();
        this.#commandMenu = null;
        this.#clipboard?.disable();
        this.#clipboard = null;

        // each widget subsystem is a real Extension and needs its own
        // settings-schema, but the schemas dir is this module's
        const baseMeta = {
            uuid: this.uuid,
            dir: this.dir,
            path: this.path,
            url: `file://${this.path}/`,
        };

        this.#clipboard = new ClipboardIndicatorExtension({
            ...baseMeta,
            ...this.metadata,
            'settings-schema': SUB_SCHEMAS.clipboard,
        });
        this.#clipboard.enable();

        this.#commandMenu = new CommandMenuExtension({
            ...baseMeta,
            ...this.metadata,
            'settings-schema': SUB_SCHEMAS.commandMenu,
        });
        this.#commandMenu.enable();
    }
}
