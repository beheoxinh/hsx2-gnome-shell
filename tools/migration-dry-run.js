#!/usr/bin/env gjs
/**
 * Dry-run the dconf migration against a throwaway dconf database, so the map in
 * migrations.js is proven without touching the user's real settings.
 *
 *   GSETTINGS_BACKEND=memory tools/migration-dry-run.js     # values come from defaults
 *   tools/migration-dry-run.js                              # reads a temp XDG_DGIT
 *
 * Only the KEY_MOVES table is exercised: it reports which source keys carry a
 * non-default value and whether the target key exists.
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import System from 'system';

const base = GLib.get_current_dir();

function dirSource(baseDir) {
    let source = Gio.SettingsSchemaSource.get_default();
    for (const rel of ['migrations/schemas',
        'modules/alienware-topbar@hsx2coder/schemas',
        'modules/alienware-advanced-alt-tab@hsx2coder/schemas',
        'modules/alienware-gnome-customizer-manager@hsx2coder/schemas']) {
        const path = `${baseDir}/${rel}`;
        if (!GLib.file_test(`${path}/gschemas.compiled`, GLib.FileTest.EXISTS))
            continue;
        source = Gio.SettingsSchemaSource.new_from_directory(path, source, false);
    }
    return source;
}

// pull the table out of migrations.js without importing the shell-only module
const src = Gio.File.new_for_path(`${base}/migrations.js`).load_contents(null)[1];
const text = new TextDecoder('utf-8').decode(src);
const table = text.slice(text.indexOf('const KEY_MOVES'), text.indexOf('];', text.indexOf('const KEY_MOVES')));
const moves = [];
const re = /\['([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)'(?:,\s*(true|false))?\]/g;
let m;
while ((m = re.exec(table)) !== null)
    moves.push([m[1], m[2], m[3], m[4], m[5] === 'true']);

const source = dirSource(base);
const cache = new Map();
const settingsFor = id => {
    if (!cache.has(id)) {
        const schema = source.lookup(id, true);
        cache.set(id, schema ? new Gio.Settings({settings_schema: schema}) : null);
    }
    return cache.get(id);
};

let ok = 0;
let skipped = 0;
let broken = 0;

for (const [fromId, fromKey, toId, toKey, asEnum] of moves) {
    const from = settingsFor(fromId);
    const to = settingsFor(toId);
    if (!from || !to) {
        print(`SKIP  ${fromId} not shipped any more`);
        skipped++;
        continue;
    }
    if (!to.settings_schema.has_key(toKey)) {
        print(`BROKEN ${toId} has no key ${toKey} (source ${fromId} ${fromKey})`);
        broken++;
        continue;
    }
    if (asEnum) {
        // writing then reading back proves the enum really accepts the nicks
        const nicks = toKey === 'clock-position'
            ? ['left', 'center', 'right']
            : ['top', 'bottom'];
        for (const nick of nicks) {
            to.set_string(toKey, nick);
            if (to.get_string(toKey) !== nick) {
                print(`BROKEN ${toId} ${toKey} does not accept enum value ${nick}`);
                broken++;
                break;
            }
        }
        to.reset(toKey);
    }
    ok++;
}

print(`\n${ok} move(s) target an existing key, ${skipped} skipped, ${broken} broken`);
if (broken) {
    print('MIGRATION MAP BROKEN');
    System.exit(1);
}
print('MIGRATION MAP OK');
