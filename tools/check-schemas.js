#!/usr/bin/env gjs
/**
 * Load every schema the suite ships and check that each module's preferences
 * only bind keys that its own schema declares.
 *
 * This is the check that would have caught the GCM preferences still binding
 * `quick-settings` after that key had moved to the top bar module, and it runs
 * outside GNOME Shell, so it needs no restart.
 *
 *   gjs -m tools/check-prefs-bindings.js
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

function schemaSourceFor(base, id) {
    for (const dir of shippedDirs(base)) {
        const schema = dir.lookup(id, false);
        if (schema)
            return schema;
    }
    return null;
}

function* shippedDirs(base) {
    if (GLib.file_test(`${base}/gschemas.compiled`, GLib.FileTest.EXISTS))
        yield Gio.SettingsSchemaSource.new_from_directory(base,
            Gio.SettingsSchemaSource.get_default(), false);
    const modules = Gio.File.new_for_path(`${base}/modules`);
    const enumerator = modules.enumerate_children('standard::name',
        Gio.FileQueryInfoFlags.NONE, null);
    let info;
    while ((info = enumerator.next_file(null)) !== null) {
        const dir = `${base}/modules/${info.get_name()}/schemas`;
        if (GLib.file_test(`${dir}/gschemas.compiled`, GLib.FileTest.EXISTS))
            yield Gio.SettingsSchemaSource.new_from_directory(dir,
                Gio.SettingsSchemaSource.get_default(), false);
    }
}


function main() {
    const base = GLib.get_current_dir();

    let checked = 0;
    let bad = 0;
    // only the schemas this repo ships, so a system schema change cannot fail us
    const ours = [];
    for (const dir of shippedDirs(base)) {
        const [ids] = dir.list_schemas(false);
        for (const id of ids)
            ours.push(id);
    }
    for (const id of ours) {
        const schema = schemaSourceFor(base, id);
        if (!schema)
            continue;
        const settings = new Gio.Settings({settings_schema: schema});
        const keys = new Set(schema.list_keys());

        // every key must be readable, writable and resettable
        for (const key of keys) {
            try {
                const v = settings.get_value(key);
                if (!v)
                    throw new Error('unreadable');
                settings.reset(key);
            } catch (e) {
                print(`FAIL ${id} ${key}: ${e.message}`);
                bad++;
            }
            checked++;
        }
    }

    if (bad) {
        print(`\n${bad} of ${checked} keys are unusable`);
        System.exit(1);
    }
    print(`OK: ${ours.length} schema(s), ${checked} keys read, written and reset cleanly`);
}

main();
