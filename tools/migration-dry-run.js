#!/usr/bin/env gjs
/**
 * Dry-run the dconf migration against a throwaway dconf database, so the map in
 * migrations.js is proven without touching the user's real settings.
 *
 *   GSETTINGS_BACKEND=memory tools/migration-dry-run.js     # values come from defaults
 *   tools/migration-dry-run.js                              # reads a temp XDG_DGIT
 *
 * Every migration table (KEY_MOVES, KEY_MOVES_V2) is exercised: it reports which source keys carry a
 * non-default value and whether the target key exists.
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import System from 'system';

const base = GLib.get_current_dir();

// live schemas the keys moved into (mirrors TARGET_DIRS in migrations.js)
const TARGET_DIRS = [
    'modules/alienware-topbar@hsx2coder/schemas',
    'modules/alienware-advanced-alt-tab@hsx2coder/schemas',
    'modules/alienware-gnome-customizer-manager@hsx2coder/schemas',
];
// each table and the frozen schema dir its source keys live in (mirrors STEPS)
const TABLES = [
    ['KEY_MOVES', 'migrations/schemas'],
    ['KEY_MOVES_V2', 'migrations/schemas-v2'],
];

function dirSource(dirs, chain) {
    let source = chain ? Gio.SettingsSchemaSource.get_default() : null;
    for (const rel of dirs) {
        const path = `${base}/${rel}`;
        if (!GLib.file_test(`${path}/gschemas.compiled`, GLib.FileTest.EXISTS))
            continue;
        source = Gio.SettingsSchemaSource.new_from_directory(path, source, false);
    }
    return source;
}

function lookup(source, recursive) {
    const cache = new Map();
    return id => {
        if (!cache.has(id)) {
            const schema = source?.lookup(id, recursive) ?? null;
            cache.set(id, schema ? new Gio.Settings({settings_schema: schema}) : null);
        }
        return cache.get(id);
    };
}

// pull the tables out of migrations.js without importing the shell-only module
const src = Gio.File.new_for_path(`${base}/migrations.js`).load_contents(null)[1];
const text = new TextDecoder('utf-8').decode(src);
function parseTable(name) {
    const start = text.indexOf(`const ${name} = [`);
    if (start < 0)
        return null;
    const table = text.slice(start, text.indexOf('\n];', start));
    const rows = [];
    const re = /\['([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)'(?:,\s*(true|false))?\]/g;
    let m;
    while ((m = re.exec(table)) !== null)
        rows.push([m[1], m[2], m[3], m[4], m[5] === 'true']);
    return rows;
}

const toFor = lookup(dirSource(TARGET_DIRS, true), true);

let ok = 0;
let skipped = 0;
let broken = 0;

for (const [name, legacyDir] of TABLES) {
    const moves = parseTable(name);
    if (!moves) {
        print(`BROKEN ${name} not found in migrations.js`);
        broken++;
        continue;
    }
    // frozen schemas may share an id with a live one: never chain them
    const fromFor = lookup(dirSource([legacyDir], false), false);

    for (const [fromId, fromKey, toId, toKey, asEnum] of moves) {
        const from = fromFor(fromId);
        const to = toFor(toId);
        if (!from || !to) {
            print(`SKIP  ${name} ${fromId} not shipped any more`);
            skipped++;
            continue;
        }
        if (!from.settings_schema.has_key(fromKey)) {
            print(`BROKEN ${name} ${legacyDir} ${fromId} has no key ${fromKey}`);
            broken++;
            continue;
        }
        if (!to.settings_schema.has_key(toKey)) {
            print(`BROKEN ${name} ${toId} has no key ${toKey} (source ${fromId} ${fromKey})`);
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
}

print(`\n${ok} move(s) target an existing key, ${skipped} skipped, ${broken} broken`);
if (broken) {
    print('MIGRATION MAP BROKEN');
    System.exit(1);
}
print('MIGRATION MAP OK');
