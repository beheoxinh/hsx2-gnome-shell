import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import ClipboardIndicatorPreferences from './subsystems/clipboard/prefs.js';
import CommandMenu2Preferences from './subsystems/command-menu/prefs.js';

export default class TopbarWidgetsPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window.set_default_size(720, 650);

        // Clipboard page
        const clipMeta = {
            ...this.metadata,
            uuid: this.uuid,
            dir: this.dir,
            path: this.path,
            'settings-schema': 'org.gnome.shell.extensions.clipboard-indicator',
        };
        const clipPrefs = new ClipboardIndicatorPreferences(clipMeta);
        clipPrefs.fillPreferencesWindow(window);

        // Command menu page
        const cmdMeta = {
            ...this.metadata,
            uuid: this.uuid,
            dir: this.dir,
            path: this.path,
            'settings-schema': 'org.gnome.shell.extensions.commandmenu2',
        };
        const cmdPrefs = new CommandMenu2Preferences(cmdMeta);
        cmdPrefs.fillPreferencesWindow(window);

        // Topbar Clone — inject into clipboard UI tab
        const panelSettings = this._loadSettings('org.gnome.shell.extensions.panel-clone');
        if (window._clipSettingsUI) {
            const cloneGroup = new Adw.PreferencesGroup({
                title: 'Cloned Top Bar',
                description: 'Clone the native GNOME top bar onto secondary monitors.',
            });
            const clockRow = new Adw.ActionRow({
                title: 'Show clock',
                subtitle: 'Show the Date/Clock menu in the centre of the cloned top bar.',
            });
            const clockToggle = new Gtk.Switch({
                active: panelSettings.get_boolean('topbar-clone-show-clock'),
                valign: Gtk.Align.CENTER,
            });
            panelSettings.bind('topbar-clone-show-clock', clockToggle, 'active', Gio.SettingsBindFlags.DEFAULT);
            clockRow.add_suffix(clockToggle);
            clockRow.activatable_widget = clockToggle;
            cloneGroup.add(clockRow);
            window._clipSettingsUI.ui.add(cloneGroup);
        }
    }

    _loadSettings(schemaId) {
        const schemaDir = this.dir.get_child('schemas').get_path();
        const source = Gio.SettingsSchemaSource.new_from_directory(
            schemaDir, Gio.SettingsSchemaSource.get_default(), false);
        const schema = source.lookup(schemaId, true);
        if (schema)
            return new Gio.Settings({settings_schema: schema});
        return this.getSettings(schemaId);
    }
}
