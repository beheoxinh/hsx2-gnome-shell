// SPDX-FileCopyrightText: 2020 Florian Müllner <fmuellner@gnome.org>
//
// SPDX-License-Identifier: GPL-2.0-or-later

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const fn = (...args) => GLib.build_filenamev(args);

/**
 * @returns {string[]} - an ordered list of theme directories
 */
export function getThemeDirs() {
    return [
        fn(GLib.get_home_dir(), '.themes'),
        fn(GLib.get_user_data_dir(), 'themes'),
        ...GLib.get_system_data_dirs().map(dir => fn(dir, 'themes')),
    ];
}

/**
 * @returns {string[]} - an ordered list of mode theme directories
 */
export function getModeThemeDirs() {
    return GLib.get_system_data_dirs()
        .map(dir => fn(dir, 'gnome-shell', 'theme'));
}

/**
 * The user-theme schema: the system copy when the User Themes extension is
 * installed (same path, so both read the same value), else the copy this
 * module ships. Looking only at the system source made the whole feature,
 * prefs page included, vanish on machines without that extension.
 *
 * @param {string} moduleDir - this module's directory
 * @returns {Gio.SettingsSchema|null}
 */
export function lookupThemeSchema(moduleDir) {
    const id = 'org.gnome.shell.extensions.user-theme';
    const system = Gio.SettingsSchemaSource.get_default()?.lookup(id, true);
    if (system)
        return system;
    try {
        const dir = fn(moduleDir, 'schemas');
        if (!GLib.file_test(fn(dir, 'gschemas.compiled'), GLib.FileTest.EXISTS))
            return null;
        return Gio.SettingsSchemaSource.new_from_directory(dir, null, false)
            .lookup(id, false);
    } catch (e) {
        return null;
    }
}
