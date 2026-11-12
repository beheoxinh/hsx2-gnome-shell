import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import { getThemeDirs, getModeThemeDirs, lookupThemeSchema } from './util.js';
import {
    collectThemeNames,
    rowLabelToThemeName,
    selectedIndexForTheme,
    themeNameToRowLabel,
} from './theme-names.js';
import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const SETTINGS_KEY = 'name';

/**
 * @param {string} moduleDir - this module's directory (for the bundled schema)
 * @returns {Adw.PreferencesGroup|null} the shell theme picker
 */
export function buildShellThemeGroup(moduleDir) {
    const schema = lookupThemeSchema(moduleDir);
    if (!schema)
        return null;

    const settings = new Gio.Settings({ settings_schema: schema });

    const group = new Adw.PreferencesGroup({
        title: _('User Shell Theme'),
        description: 'Apply a custom theme to GNOME Shell (replaces the system User Themes extension).',
    });

    const themeRow = new Adw.ComboRow({
        title: _('Shell Theme'),
        subtitle: _('GNOME Shell theme applied immediately on change.'),
    });

    const scanDir = dir => {
        try {
            const dirFile = Gio.File.new_for_path(dir);
            if (!dirFile.query_exists(null))
                return null;
            const enumerator = dirFile.enumerate_children(
                'standard::name,standard::type',
                Gio.FileQueryInfoFlags.NONE, null);
            const entries = [];
            let info;
            while ((info = enumerator.next_file(null))) {
                if (info.get_file_type() !== Gio.FileType.DIRECTORY)
                    continue;
                const name = info.get_name();
                const cssFile = Gio.File.new_for_path(
                    GLib.build_filenamev([dir, name, 'gnome-shell', 'gnome-shell.css']));
                entries.push([name, cssFile.query_exists(null)]);
            }
            return entries;
        } catch {
            return null;
        }
    };

    let syncing = false;
    const refreshThemes = () => {
        syncing = true;
        try {
            const list = collectThemeNames(
                [...getThemeDirs(), ...getModeThemeDirs()], scanDir);
            const model = new Gtk.StringList();
            for (const n of list)
                model.append(themeNameToRowLabel(n));
            themeRow.model = model;
            const current = settings.get_string(SETTINGS_KEY);
            themeRow.selected = selectedIndexForTheme(list, current);
        } catch (e) {
            logError(e, '[ShellThemePrefs] refresh failed');
        } finally {
            syncing = false;
        }
    };

    themeRow.connect('notify::selected', () => {
        if (syncing)
            return;
        try {
            const idx = themeRow.selected;
            const item = themeRow.model?.get_item(idx);
            const label = item?.get_string?.() ?? '';
            settings.set_string(SETTINGS_KEY, rowLabelToThemeName(label));
        } catch (e) {
            logError(e, '[ShellThemePrefs] set theme failed');
        }
    });

    try {
        settings.connect(`changed::${SETTINGS_KEY}`, refreshThemes);
    } catch (e) {
        logError(e, '[ShellThemePrefs] watch failed');
    }

    const reloadRow = new Adw.ActionRow({
        title: _('Rescan Theme Folders'),
        subtitle: _('Refresh the list from ~/.themes and /usr/share/themes.'),
        activatable: true,
    });
    reloadRow.connect('activated', refreshThemes);

    group.add(themeRow);
    group.add(reloadRow);

    refreshThemes();
    return group;
}
