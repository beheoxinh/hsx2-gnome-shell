/*
 * Preferences UI for the Alienware Topbar Clone module.
 *
 * This module has no schemas/ dir of its own — its keys live in the suite
 * schema (org.gnome.shell.extensions.alienware-suite). We resolve that schema
 * from the suite's schemas dir (this.dir is the module dir; ../../schemas is
 * the suite schemas dir).
 */

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const SUITE_SCHEMA_ID = 'org.gnome.shell.extensions.alienware-suite';

export default class TopbarClonePreferences extends ExtensionPreferences {
    _loadSuiteSettings() {
        try {
            return this.getSettings(SUITE_SCHEMA_ID);
        } catch (_e) {
            const suiteSchemasDir = this.dir.get_parent().get_parent()
                .get_child('schemas').get_path();
            const source = Gio.SettingsSchemaSource.new_from_directory(
                suiteSchemasDir,
                Gio.SettingsSchemaSource.get_default(),
                false);
            const schema = source.lookup(SUITE_SCHEMA_ID, true);
            if (!schema)
                throw new Error(`Schema ${SUITE_SCHEMA_ID} not found in ${suiteSchemasDir}`);
            return new Gio.Settings({settings_schema: schema});
        }
    }

    fillPreferencesWindow(window) {
        const settings = this._loadSuiteSettings();

        const page = new Adw.PreferencesPage({
            title: 'Topbar Clone',
            icon_name: 'video-display-symbolic',
        });
        window.add(page);

        const group = new Adw.PreferencesGroup({
            title: 'Cloned Top Bar',
            description:
                'Clone the native GNOME top bar onto secondary monitors. ' +
                'Only the workspace control and the Quick Settings menu are ' +
                'interactive; everything else is hidden. Toggle the clock below.',
        });
        page.add(group);

        const createSwitchRow = (title, subtitle, key) => {
            const row = new Adw.ActionRow({title, subtitle});
            const toggle = new Gtk.Switch({
                active: settings.get_boolean(key),
                valign: Gtk.Align.CENTER,
            });
            settings.bind(key, toggle, 'active', Gio.SettingsBindFlags.DEFAULT);
            row.add_suffix(toggle);
            row.activatable_widget = toggle;
            return row;
        };

        group.add(createSwitchRow(
            'Show clock',
            'Show the Date/Clock menu in the centre of the cloned top bar. ' +
            'When off, the centre is hidden like the rest of the bar.',
            'topbar-clone-show-clock'));
    }
}
