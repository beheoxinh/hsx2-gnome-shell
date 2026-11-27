// E2E for the "Nautilus Context" prefs tab: real DingPrefs + libadwaita,
// in-memory GSettings, temp XDG_DATA_HOME (env set by the caller).
// gjs -m prefs-e2e.js <moduleDir> <mode: full|missing>
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

const [modDir, mode] = ARGV;
const {default: DingPrefs} = await import(`file://${modDir}/prefs.js`);
const Sync = await import(`file://${modDir}/nautilusSync.js`);
const results = [];
const rec = (name, ok, detail = '') => results.push({name, ok: !!ok, detail: String(detail)});
const ext = f => `${Sync.targetDir().get_path()}/${f}`;
const exists = p => GLib.file_test(p, GLib.FileTest.EXISTS);
const write = (p, s) => {
    GLib.mkdir_with_parents(GLib.path_get_dirname(p), 0o755);
    GLib.file_set_contents(p, s);
};
const status = s => GLib.markup_escape_text('', -1) + s.nautilusStatus.subtitle;
const walk = (w, pred, out = []) => {
    for (let c = w.get_first_child(); c; c = c.get_next_sibling()) {
        if (pred(c))
            out.push(c);
        walk(c, pred, out);
    }
    return out;
};

function* full(win, s) {
    const S = s.schema;
    rec('isolated target dir', Sync.targetDir().get_path().startsWith(GLib.getenv('XDG_DATA_HOME')));
    rec('no warning when nautilus-python is installed',
        walk(s.nautilusGroup, c => c instanceof Adw.ActionRow && c.title === 'nautilus-python is not installed').length === 0);
    rec('initial: off, nothing installed', !s.nautilusInstall.active && /Not installed in Nautilus/.test(status(s)) &&
        !s.syncButton.sensitive && !s.restartButton.visible, status(s));
    rec('status warns about the user plugins that will be backed up',
        /duplicate\.py, open_with_antigravity\.py will be moved/.test(status(s)), status(s));

    s.nautilusInstall.active = true;
    yield 300;
    const all = Sync.PLUGINS.every(p => exists(ext(p.file)));
    rec('switch on -> key on + 5 plugins installed', S.get_boolean('nautilus-integration') && all);
    rec('switch on -> backups made, legacy gone',
        !exists(ext('open_with_antigravity.py')) && exists(`${Sync.backupDir().get_path()}`), status(s));
    rec('status after install', /All 5 plugins installed and up to date\./.test(status(s)) &&
        /Installed 5 plugin\(s\)\./.test(status(s)) && /Moved your previous plugin/.test(status(s)), status(s));
    rec('restart button shown, sync disabled', s.restartButton.visible && !s.syncButton.sensitive);

    write(ext('copy_path.py'), `${new TextDecoder().decode(GLib.file_get_contents(ext('copy_path.py'))[1])}\n#x\n`);
    s.nautilusInstall.active = false;
    s.nautilusInstall.active = true; // re-apply also refreshes outdated files
    yield 300;
    rec('outdated file rewritten on re-apply',
        Sync.inspect(Gio.File.new_for_path(modDir)).every(x => x.state === Sync.State.CURRENT), status(s));
    write(ext('copy_path.py'), '# alienware-nautilus-context edited\n');
    s.syncButton.emit('clicked'); // sync with the switch on
    yield 300;
    rec('Sync button repairs an edited plugin',
        Sync.inspect(Gio.File.new_for_path(modDir)).every(x => x.state === Sync.State.CURRENT), status(s));

    s.nautilusInstall.active = false;
    yield 300;
    rec('switch off -> plugins removed', Sync.PLUGINS.every(p => !exists(ext(p.file))) &&
        /Removed 5 plugin\(s\)\./.test(status(s)), status(s));
    rec('backups kept after uninstall', exists(Sync.backupDir().get_path()));

    // entry switches are bound both ways to the shared keys
    s.copyContentRow.active = false;
    const k1 = S.get_boolean('context-copy-content');
    S.set_boolean('context-copy-content', true);
    rec('entry row <-> key both ways', k1 === false && s.copyContentRow.active === true);
    s.openWithRow.enable_expansion = false;
    const k2 = S.get_boolean('open-with-enabled');
    S.set_boolean('open-with-enabled', true);
    rec('open-with expander <-> key both ways', k2 === false && s.openWithRow.enable_expansion === true);
    s.customMenuCommand.text = 'code --new-window';
    rec('open-with command entry writes the key', S.get_string('open-with-command') === 'code --new-window');
    s.gitEmblemsRow.active = false;
    rec('git emblems row writes the key', S.get_boolean('context-git-emblems') === false);
    s.gitEmblemsRow.active = true;

    // closing the window drops the GSettings handlers
    const nHandlers = s._handlerIds.length;
    win.close();
    yield 200;
    const other = new Gio.Settings({settings_schema: S.settings_schema});
    other.set_boolean('nautilus-integration', true);
    yield 300;
    rec('window close disconnects handlers (no install after close)',
        nHandlers > 0 && s._handlerIds.length === 0 && !exists(ext('copy_path.py')), nHandlers);
}

function* missing(win, s) {
    const rows = walk(s.nautilusGroup, c => c instanceof Adw.ActionRow && c.title === 'nautilus-python is not installed');
    rec('warning row shown when nautilus-python is missing', rows.length === 1);
    rec('warning carries the distro install command',
        rows.length && /sudo dnf install nautilus-python/.test(rows[0].subtitle), rows[0]?.subtitle);
    const btn = rows.length ? walk(rows[0], c => c instanceof Gtk.Button && c.tooltip_text === 'Copy install command') : [];
    rec('copy-command button present', btn.length === 1);
    rec('install switch still usable', s.nautilusInstall.sensitive);
    win.close();
}

const app = new Adw.Application({application_id: 'dev.hsx2.DingPrefsE2E', flags: Gio.ApplicationFlags.NON_UNIQUE});
app.connect('activate', () => {
    app.hold();
    const parent = new Adw.ApplicationWindow({application: app});
    new DingPrefs({dir: Gio.File.new_for_path(modDir)}).openPreferences(parent);
    const win = Gtk.Window.list_toplevels().find(w => w._settingsRef);
    const gen = (mode === 'missing' ? missing : full)(win, win._settingsRef);
    const tick = () => {
        try {
            const r = gen.next();
            if (r.done) {
                app.quit();
                return false;
            }
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, r.value, tick);
        } catch (e) {
            rec('harness crashed', false, `${e}\n${e.stack}`);
            app.quit();
        }
        return false;
    };
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, tick);
});
app.run([]);
for (const r of results)
    print(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.ok ? '' : `  -> ${r.detail}`}`);
print(`${results.filter(r => r.ok).length}/${results.length} passed`);
