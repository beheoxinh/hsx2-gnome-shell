// Nautilus Context: snapshot sync (install/update/backup/uninstall) against a
// throwaway XDG data dir, plus the invariant that every entry's on/off key is
// shared by the desktop menu, the Nautilus plugin and the schema.
// Run: gjs -m tests/run.js tests/test-nautilus-context.js
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const MOD = 'modules/alienware-desktop-enable-gnome@hsx2coder';
const moduleDir = Gio.File.new_for_path(MOD);

// Redirect GLib.get_user_data_dir() before nautilusSync.js is evaluated.
const tmpRoot = GLib.dir_make_tmp('nautilus-ctx-XXXXXX');
GLib.setenv('XDG_DATA_HOME', tmpRoot, true);
GLib.reload_user_special_dirs_cache?.();
const Sync = await import(`file://${GLib.get_current_dir()}/${MOD}/nautilusSync.js`);

const text = f => new TextDecoder().decode(Gio.File.new_for_path(f).load_contents(null)[1]);
const extDir = () => Sync.targetDir().get_path();
const write = (path, s) => Gio.File.new_for_path(path).replace_contents(
    new TextEncoder().encode(s), null, false, Gio.FileCreateFlags.NONE, null);
const exists = p => GLib.file_test(p, GLib.FileTest.EXISTS);
// Never touch the real ~/.local/share/nautilus-python: GLib caches the data
// dir, so if another test read it first we must refuse to run.
const guard = () => {
    if (!extDir().startsWith(tmpRoot))
        throw new Error(`refusing to run: target dir not isolated (${extDir()})`);
};

export default [
    ['target dir follows XDG_DATA_HOME (test isolation)', () => guard()],
    ['every plugin key exists in the schema and in the desktop menu', () => {
        const schema = text(`${MOD}/schemas/org.gnome.shell.extensions.ding.gschema.xml`);
        const menu = text(`${MOD}/app/fileItemMenu.js`);
        for (const p of Sync.PLUGINS) {
            if (!schema.includes(`name="${p.key}"`))
                throw new Error(`schema lacks ${p.key}`);
            const py = text(`${MOD}/nautilus/${p.file}`);
            if (!py.includes(`'${p.key}'`))
                throw new Error(`${p.file} does not read ${p.key}`);
            if (p.id !== 'git-emblems' && !menu.includes(`'${p.key}'`))
                throw new Error(`desktop menu does not read ${p.key}`);
        }
        if (!schema.includes(`name="${Sync.INTEGRATION_KEY}"`))
            throw new Error('schema lacks nautilus-integration');
    }],
    ['rendered plugins are marked, self-contained and valid Python', () => {
        for (const p of Sync.PLUGINS) {
            const src = Sync.renderPlugin(moduleDir, p);
            if (!src.slice(0, 200).includes(Sync.MARKER))
                throw new Error(`${p.file}: marker not in header`);
            if (src.includes('@@'))
                throw new Error(`${p.file}: unrendered placeholder`);
            if (src.includes('~/Scripts'))
                throw new Error(`${p.file}: depends on external helper scripts`);
            const out = `${tmpRoot}/check_${p.file}`;
            write(out, src);
            const [, , err, status] = GLib.spawn_command_line_sync(`python3 -I -m py_compile ${out}`);
            if (status !== 0)
                throw new Error(`${p.file}: ${new TextDecoder().decode(err)}`);
        }
    }],
    ['install writes all plugins, backs up a user file with the same name', () => {
        guard();
        GLib.mkdir_with_parents(extDir(), 0o755);
        write(`${extDir()}/duplicate.py`, '# my own duplicate plugin\n');
        write(`${extDir()}/open_with_antigravity.py`, '# legacy open-with\n');
        write(`${extDir()}/unrelated.py`, '# not ours, not replaced\n');
        const res = Sync.install(moduleDir);
        if (res.errors.length)
            throw new Error(res.errors.join('; '));
        if (res.written.length !== Sync.PLUGINS.length)
            throw new Error(`written ${res.written.length}`);
        if (res.backedUp.length !== 2)
            throw new Error(`backedUp ${JSON.stringify(res.backedUp)}`);
        if (exists(`${extDir()}/open_with_antigravity.py`))
            throw new Error('legacy plugin still in load dir');
        if (!exists(`${extDir()}/unrelated.py`))
            throw new Error('unrelated user plugin touched');
        for (const s of Sync.inspect(moduleDir)) {
            if (s.state !== Sync.State.CURRENT)
                throw new Error(`${s.plugin.file} is ${s.state}`);
        }
    }],
    ['second install is a no-op; edited managed file shows as outdated', () => {
        guard();
        const again = Sync.install(moduleDir);
        if (again.changed)
            throw new Error('idempotent install changed files');
        const f = `${extDir()}/copy_path.py`;
        write(f, `${text(f)}\n# local edit\n`);
        const st = Sync.inspect(moduleDir).find(s => s.plugin.file === 'copy_path.py').state;
        if (st !== Sync.State.OUTDATED)
            throw new Error(`expected outdated, got ${st}`);
        Sync.install(moduleDir);
    }],
    ['uninstall removes only managed files', () => {
        guard();
        const res = Sync.uninstall();
        if (res.removed.length !== Sync.PLUGINS.length)
            throw new Error(`removed ${res.removed.length}`);
        if (!exists(`${extDir()}/unrelated.py`))
            throw new Error('uninstall removed a user file');
        const backups = Sync.backupDir().enumerate_children('standard::name', 0, null);
        let n = 0;
        while (backups.next_file(null))
            n++;
        if (n !== 2)
            throw new Error(`expected 2 backups, found ${n}`);
    }],
    ['backups made within the same second never overwrite each other', () => {
        guard();
        for (let i = 0; i < 2; i++) {
            write(`${extDir()}/duplicate.py`, `# user copy ${i}\n`);
            const res = Sync.install(moduleDir);
            if (res.errors.length || res.backedUp.length !== 1)
                throw new Error(`round ${i}: ${JSON.stringify(res)}`);
        }
        const en = Sync.backupDir().enumerate_children('standard::name', 0, null);
        const names = [];
        let info;
        while ((info = en.next_file(null)))
            names.push(info.get_name());
        const dups = names.filter(n => n.startsWith('duplicate.py.'));
        if (dups.length !== 3)
            throw new Error(`expected 3 duplicate.py backups, got ${names.join(', ')}`);
        Sync.uninstall();
    }],
    ['syncIfEnabled installs only when nautilus-integration is on, never removes', () => {
        guard();
        const src = Gio.SettingsSchemaSource.new_from_directory(`${MOD}/schemas`,
            Gio.SettingsSchemaSource.get_default(), false);
        const settings = Gio.Settings.new_full(src.lookup(Sync.SCHEMA_ID, false),
            Gio.memory_settings_backend_new(), null);
        if (Sync.loadSettings(moduleDir) === null)
            throw new Error('loadSettings found no schema');
        settings.set_boolean(Sync.INTEGRATION_KEY, false);
        if (Sync.syncIfEnabled(moduleDir, settings) !== null)
            throw new Error('synced while off');
        if (exists(`${extDir()}/copy_path.py`))
            throw new Error('installed while off');
        settings.set_boolean(Sync.INTEGRATION_KEY, true);
        const res = Sync.syncIfEnabled(moduleDir, settings);
        if (!res || res.written.length !== Sync.PLUGINS.length)
            throw new Error(`on: ${JSON.stringify(res)}`);
        settings.set_boolean(Sync.INTEGRATION_KEY, false);
        Sync.syncIfEnabled(moduleDir, settings);
        if (!exists(`${extDir()}/copy_path.py`))
            throw new Error('syncIfEnabled removed plugins');
        Sync.reconcile(moduleDir, settings);
        if (exists(`${extDir()}/copy_path.py`))
            throw new Error('reconcile(off) kept plugins');
    }],
    ['findNautilusPython: detects lib64, multiarch and absence', () => {
        const root = `${tmpRoot}/fs`;
        const mk = rel => {
            GLib.mkdir_with_parents(`${root}/${rel}`, 0o755);
            write(`${root}/${rel}/libnautilus-python.so`, '\x7fELF');
        };
        if (Sync.findNautilusPython([`${root}/usr/lib64`, `${root}/usr/lib`]) !== null)
            throw new Error('found a library in an empty tree');
        mk('usr/lib/x86_64-linux-gnu/nautilus/extensions-4');
        const multi = Sync.findNautilusPython([`${root}/usr/lib64`, `${root}/usr/lib`]);
        if (!multi?.endsWith('x86_64-linux-gnu/nautilus/extensions-4/libnautilus-python.so'))
            throw new Error(`multiarch: ${multi}`);
        mk('usr/lib64/nautilus/extensions-4');
        const lib64 = Sync.findNautilusPython([`${root}/usr/lib64`, `${root}/usr/lib`]);
        if (lib64 !== `${root}/usr/lib64/nautilus/extensions-4/libnautilus-python.so`)
            throw new Error(`lib64: ${lib64}`);
    }],
];
