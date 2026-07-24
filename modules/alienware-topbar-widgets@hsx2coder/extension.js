import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import ClipboardIndicatorExtension from './subsystems/clipboard/extension.js';
import CommandMenuExtension from './subsystems/command-menu/extension.js';
import {TopbarCloneSubsystem} from './subsystems/topbar-clone/main.js';

export default class TopbarWidgetsExtension extends Extension {
    enable() {
        // Build sub-metadata mimicking what buildSubMetadata() does for suite modules.
        // Each subsystem needs its own settings-schema so getSettings() resolves correctly.
        // dir/path point to this module's root (schemas/ dir lives here).
        const baseMeta = {
            uuid: this.uuid,
            dir: this.dir,
            path: this.path,
            url: `file://${this.path}/`,
        };

        // Clipboard indicator
        this._clipboard = new ClipboardIndicatorExtension({
            ...baseMeta,
            ...this.metadata,
            'settings-schema': 'org.gnome.shell.extensions.clipboard-indicator',
        });
        this._clipboard.enable();

        // Command menu
        this._cmdMenu = new CommandMenuExtension({
            ...baseMeta,
            ...this.metadata,
            'settings-schema': 'org.gnome.shell.extensions.commandmenu2',
        });
        this._cmdMenu.enable();

        // Topbar clone (uses subsystem class, not raw Extension)
        this._topbar = new TopbarCloneSubsystem({
            settings: this._loadSettings('org.gnome.shell.extensions.panel-clone'),
            extension: this,
        });
        this._topbar.enable();
    }

    disable() {
        this._topbar?.disable();
        this._topbar = null;

        this._cmdMenu?.disable();
        this._cmdMenu = null;

        this._clipboard?.disable();
        this._clipboard = null;
    }

    _loadSettings(schemaId) {
        // Resolve settings from our own schemas/ dir
        const schemaDir = this.dir.get_child('schemas').get_path();
        const source = Gio.SettingsSchemaSource.new_from_directory(
            schemaDir, Gio.SettingsSchemaSource.get_default(), false);
        const schema = source.lookup(schemaId, true);
        if (schema)
            return new Gio.Settings({settings_schema: schema});
        return this.getSettings(schemaId);
    }
}
