// Nautilus Context: syncs the bundled nautilus-python snapshot (./nautilus/)
// into ~/.local/share/nautilus-python/extensions.
//
// Shared by prefs.js (install/remove when the user flips the switch) and
// extension.js (re-sync at enable, so an updated snapshot reaches Nautilus).
// Gio/GLib only: no Gtk/St, safe in both processes.
//
// Rules:
//  - Only files carrying MARKER are ours. We update and remove only those.
//  - A user file in the way (same name, or a legacy name we replace) is moved
//    to extensions-backup/ outside the load dir, never deleted.
//  - Writes are atomic (replace_contents), so two processes syncing at once
//    cannot leave a half-written plugin.
//  - Enabling/disabling one entry does NOT touch files: every plugin reads its
//    GSettings key live, the same key the desktop menu reads.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export const MARKER = 'alienware-nautilus-context';
// Bump when the snapshot changes, so installed copies show as outdated.
export const SNAPSHOT_VERSION = 1;

export const INTEGRATION_KEY = 'nautilus-integration';

/**
 * file: name inside ./nautilus/ and in the Nautilus extensions dir.
 * key: GSettings key shared with the desktop menu.
 * replaces: older user-made plugins doing the same job (backed up on install).
 */
export const PLUGINS = [
    {id: 'copy-content', file: 'copy_content.py', key: 'context-copy-content', replaces: []},
    {id: 'copy-path', file: 'copy_path.py', key: 'context-copy-path', replaces: []},
    {id: 'duplicate', file: 'duplicate.py', key: 'context-duplicate', replaces: []},
    {id: 'open-with', file: 'open_with.py', key: 'open-with-enabled', replaces: ['open_with_antigravity.py']},
    {id: 'git-emblems', file: 'git_status_emblems.py', key: 'context-git-emblems', replaces: []},
];

export const State = Object.freeze({
    MISSING: 'missing',
    CURRENT: 'current',
    OUTDATED: 'outdated',
    FOREIGN: 'foreign', // a non-managed file with our name: install will back it up
});

const decoder = new TextDecoder();
const encoder = new TextEncoder();

export function targetDir() {
    return Gio.File.new_for_path(GLib.build_filenamev(
        [GLib.get_user_data_dir(), 'nautilus-python', 'extensions']));
}

export function backupDir() {
    return Gio.File.new_for_path(GLib.build_filenamev(
        [GLib.get_user_data_dir(), 'nautilus-python', 'extensions-backup']));
}

/** Path of libnautilus-python.so, or null when nautilus-python is not installed. */
export function findNautilusPython(roots = ['/usr/lib64', '/usr/lib', '/usr/local/lib64', '/usr/local/lib']) {
    const bases = [...roots];
    // Debian/Ubuntu multiarch: /usr/lib/<triplet>/nautilus
    const multiarch = roots.find(r => r.endsWith('/usr/lib')) ?? null;
    try {
        if (multiarch === null)
            throw new Error('no multiarch root');
        const en = Gio.File.new_for_path(multiarch).enumerate_children(
            'standard::name,standard::type', Gio.FileQueryInfoFlags.NONE, null);
        let info;
        while ((info = en.next_file(null))) {
            if (info.get_file_type() === Gio.FileType.DIRECTORY && info.get_name().includes('-linux-'))
                bases.push(`${multiarch}/${info.get_name()}`);
        }
        en.close(null);
    } catch {}
    for (const base of bases) {
        for (const ver of ['extensions-4', 'extensions-3.0']) {
            const path = GLib.build_filenamev([base, 'nautilus', ver, 'libnautilus-python.so']);
            if (GLib.file_test(path, GLib.FileTest.EXISTS))
                return path;
        }
    }
    return null;
}

export function isNautilusInstalled() {
    return GLib.find_program_in_path('nautilus') !== null;
}

function readText(file) {
    try {
        const [, bytes] = file.load_contents(null);
        return decoder.decode(bytes);
    } catch {
        return null;
    }
}

function isManaged(text) {
    return text !== null && text.slice(0, 400).includes(MARKER);
}

/** Final text of one plugin: header + shared runtime + plugin body. */
export function renderPlugin(moduleDir, plugin) {
    const srcDir = moduleDir.get_child('nautilus');
    const common = readText(srcDir.get_child('_common.py'));
    const body = readText(srcDir.get_child(plugin.file));
    if (common === null || body === null)
        throw new Error(`snapshot file missing: ${plugin.file}`);
    const schemaDir = moduleDir.get_child('schemas').get_path();
    const header = [
        `# ${MARKER}: managed by the Alienware GNOME extension (snapshot v${SNAPSHOT_VERSION}).`,
        '# Do not edit: this file is overwritten on sync. Toggle the entry in',
        '# Desktop, Context Menu > Nautilus Context; the switch also drives the desktop menu.',
    ].join('\n');
    // JSON string literals are valid Python string literals for paths.
    const runtime = common.replace('@@SCHEMA_DIR@@', JSON.stringify(schemaDir));
    return body
        .replace('# @@HEADER@@', header)
        .replace('# @@COMMON@@', runtime.trimEnd());
}

/** [{plugin, state}] for every snapshot plugin. */
export function inspect(moduleDir) {
    const dir = targetDir();
    return PLUGINS.map(plugin => {
        const text = readText(dir.get_child(plugin.file));
        let state;
        if (text === null)
            state = State.MISSING;
        else if (!isManaged(text))
            state = State.FOREIGN;
        else
            state = text === renderPlugin(moduleDir, plugin) ? State.CURRENT : State.OUTDATED;
        return {plugin, state};
    });
}

/** User plugins we would replace (legacy names), still present and not ours. */
export function legacyFiles() {
    const dir = targetDir();
    const found = [];
    for (const plugin of PLUGINS) {
        for (const name of plugin.replaces) {
            const text = readText(dir.get_child(name));
            if (text !== null && !isManaged(text))
                found.push(name);
        }
    }
    return found;
}

function stamp() {
    return GLib.DateTime.new_now_local().format('%Y%m%d-%H%M%S');
}

function backup(file) {
    const dest = backupDir();
    try {
        dest.make_directory_with_parents(null);
    } catch (e) {
        if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS))
            throw e;
    }
    // Never overwrite an older backup (two syncs within the same second).
    const base = `${file.get_basename()}.${stamp()}`;
    let target = dest.get_child(base);
    for (let n = 1; target.query_exists(null); n++)
        target = dest.get_child(`${base}-${n}`);
    file.move(target, Gio.FileCopyFlags.NONE, null, null);
    return target.get_path();
}

/**
 * Install or refresh every plugin.
 * @returns {{changed: boolean, written: string[], backedUp: string[], errors: string[]}}
 */
export function install(moduleDir) {
    const result = {changed: false, written: [], backedUp: [], errors: []};
    const dir = targetDir();
    try {
        dir.make_directory_with_parents(null);
    } catch (e) {
        if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS)) {
            result.errors.push(`${dir.get_path()}: ${e.message}`);
            return result;
        }
    }

    for (const plugin of PLUGINS) {
        try {
            // Legacy user plugins doing the same job would show a second entry.
            for (const name of plugin.replaces) {
                const old = dir.get_child(name);
                const text = readText(old);
                if (text === null)
                    continue;
                if (isManaged(text))
                    old.delete(null);
                else
                    result.backedUp.push(backup(old));
                result.changed = true;
            }

            const dest = dir.get_child(plugin.file);
            const wanted = renderPlugin(moduleDir, plugin);
            const current = readText(dest);
            if (current === wanted)
                continue;
            if (current !== null && !isManaged(current))
                result.backedUp.push(backup(dest));
            dest.replace_contents(encoder.encode(wanted), null, false,
                Gio.FileCreateFlags.REPLACE_DESTINATION, null);
            result.written.push(plugin.file);
            result.changed = true;
        } catch (e) {
            result.errors.push(`${plugin.file}: ${e.message}`);
        }
    }
    return result;
}

/**
 * Remove our plugins (marker present). User files are left alone.
 * @returns {{changed: boolean, removed: string[], errors: string[]}}
 */
export function uninstall() {
    const result = {changed: false, removed: [], errors: []};
    const dir = targetDir();
    for (const plugin of PLUGINS) {
        const file = dir.get_child(plugin.file);
        if (!isManaged(readText(file)))
            continue;
        try {
            file.delete(null);
            result.removed.push(plugin.file);
            result.changed = true;
        } catch (e) {
            result.errors.push(`${plugin.file}: ${e.message}`);
        }
    }
    return result;
}

export const SCHEMA_ID = 'org.gnome.shell.extensions.ding';

/** The module's own settings (schema read from <moduleDir>/schemas), or null. */
export function loadSettings(moduleDir) {
    const source = Gio.SettingsSchemaSource.new_from_directory(
        moduleDir.get_child('schemas').get_path(),
        Gio.SettingsSchemaSource.get_default(), false);
    const schema = source.lookup(SCHEMA_ID, false);
    if (!schema || !schema.has_key(INTEGRATION_KEY))
        return null;
    return new Gio.Settings({settings_schema: schema});
}

/**
 * Called by extension.js at enable: refresh the installed snapshot when the
 * integration is on. Never installs when it is off and never uninstalls.
 * @returns {object|null} install() result, or null when nothing was done.
 */
export function syncIfEnabled(moduleDir, settings = loadSettings(moduleDir)) {
    if (!settings || !settings.get_boolean(INTEGRATION_KEY))
        return null;
    return install(moduleDir);
}

/** Bring Nautilus in line with the integration switch. */
export function reconcile(moduleDir, settings) {
    return settings.get_boolean(INTEGRATION_KEY) ? install(moduleDir) : uninstall();
}

/** Nautilus loads plugins only at startup: quit it so the next launch picks them up. */
export function restartNautilus() {
    try {
        const proc = Gio.Subprocess.new(['nautilus', '-q'], Gio.SubprocessFlags.NONE);
        proc.wait_async(null, () => {});
        return true;
    } catch {
        return false;
    }
}
