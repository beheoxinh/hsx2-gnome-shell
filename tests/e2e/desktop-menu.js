// E2E for the desktop context menu (app/fileItemMenu.js) with the real DING
// app modules, Gtk3, in-memory GSettings and fake wl-copy/editor.
// gjs desktop-menu.js <appDir>   (env: E2E_OUT, E2E_TREE, E2E_FAKEBIN)
imports.gi.versions.Gtk = '3.0';
imports.gi.versions.Gdk = '3.0';
const {Gtk, GLib, Gio} = imports.gi;

const appDir = ARGV[0];
const OUT = GLib.getenv('E2E_OUT');
const TREE = GLib.getenv('E2E_TREE');
const BIN = GLib.getenv('E2E_FAKEBIN');
imports.searchPath.unshift(appDir);
Gtk.init(null);

const Prefs = imports.preferences;
Prefs.init(appDir);
const DBusUtils = imports.dbusUtils;
DBusUtils.GnomeArchiveManager = {
    connect() {},
    isAvailable: true,
    proxy: {GetSupportedTypesRemote: (_what, cb) => cb([[]], null)},
};
DBusUtils.discreteGpuAvailable = false;
Gtk.Menu.prototype.popup_at_pointer = function () {};
Gtk.Menu.prototype.popup_at_widget = function () {};
const FileItemMenu = imports.fileItemMenu;

const results = [];
const rec = (name, ok, detail = '') => results.push({name, ok: !!ok, detail: JSON.stringify(detail)});
const S = Prefs.desktopSettings;
const T = p => GLib.build_filenamev([TREE, p]);

function item(rel) {
    const path = T(rel);
    const isDir = GLib.file_test(path, GLib.FileTest.IS_DIR);
    return {
        isStackMarker: false, isAllSelectable: true, isDirectory: isDir, isSpecial: false,
        file: Gio.File.new_for_path(path), path, uri: Gio.File.new_for_path(path).get_uri(),
        fileName: GLib.path_get_basename(path), canRename: true, attributeContentType: 'text/plain',
        isValidDesktopFile: false, isTrash: false, isDrive: false, attributeCanExecute: false,
    };
}

let selection = [];
const dm = {
    getNumberOfSelectedItems: () => selection.length,
    getCurrentSelection: () => selection,
    checkIfSpecialFilesAreSelected: () => false,
    unselectAll() {},
    autoAr: {fileIsCompressed: () => false},
    writableByOthers: false,
};
const menu = new FileItemMenu.FileItemMenu(dm);

function open(...rels) {
    selection = rels.map(item);
    menu.showMenu(selection[0], null);
    return menu._menu.get_children()
        .filter(c => !(c instanceof Gtk.SeparatorMenuItem))
        .map(c => [c.get_label(), c]);
}
const labels = (...rels) => open(...rels).map(([l]) => l);
const activate = (label, ...rels) => {
    const hit = open(...rels).find(([l]) => l === label);
    if (!hit)
        throw new Error(`no menu item "${label}"`);
    hit[1].activate();
};
const clips = () => {
    const names = [];
    const en = Gio.File.new_for_path(OUT).enumerate_children('standard::name', 0, null);
    let i;
    while ((i = en.next_file(null)))
        if (i.get_name().startsWith('clip-'))
            names.push(i.get_name());
    return names.sort();
};
const read = p => {
    try {
        return new TextDecoder().decode(GLib.file_get_contents(p)[1]);
    } catch {
        return null;
    }
};
const lastClip = () => {
    const c = clips();
    return c.length ? read(`${OUT}/${c[c.length - 1]}`) : null;
};
const exists = p => GLib.file_test(T(p), GLib.FileTest.EXISTS);

const steps = function* () {
    S.set_string('open-with-label', 'FakeIDE');
    S.set_string('open-with-command', `${BIN}/fake-editor --flag 'two words'`);

    let l = labels('a.txt');
    rec('file: all 4 shared entries', ['Copy file content', 'Copy file path', 'Duplicate file', 'Open with FakeIDE']
        .every(x => l.includes(x)), l);
    l = labels('dir');
    rec('folder: no content entry, folder path, duplicate folder',
        !l.includes('Copy file content') && l.includes('Copy folder path') && l.includes('Duplicate folder'), l);
    l = labels('a.txt', 'dir');
    rec('mixed 2: duplicate items + open 2 items, no single-item entries',
        l.includes('Duplicate 2 items') && l.includes('Open 2 items with FakeIDE') &&
        !l.includes('Copy file path') && !l.includes('Copy file content'), l);
    rec('2 files label', labels('a.txt', 'b.txt').includes('Duplicate 2 files'));
    rec('2 folders label', labels('dir', 'dir2').includes('Duplicate 2 folders'));

    for (const [key, label] of [['context-copy-content', 'Copy file content'], ['context-copy-path', 'Copy file path'],
        ['context-duplicate', 'Duplicate file'], ['open-with-enabled', 'Open with FakeIDE']]) {
        S.set_boolean(key, false);
        const off = labels('a.txt').includes(label);
        S.set_boolean(key, true);
        const on = labels('a.txt').includes(label);
        rec(`toggle ${key}`, !off && on, {off, on});
    }

    S.set_string('open-with-command', '  ');
    rec('open-with hidden with empty command', !labels('a.txt').some(x => x.startsWith('Open with')));
    S.set_string('open-with-command', "broken 'quote");
    rec('open-with hidden with unparsable command', !labels('a.txt').some(x => x.startsWith('Open with')));
    S.set_string('open-with-command', `${BIN}/fake-editor --flag 'two words'`);
    S.set_string('open-with-label', '');
    rec('empty label falls back to IDE', labels('a.txt').includes('Open with IDE'));
    S.set_string('open-with-label', 'FakeIDE');

    let n = clips().length;
    activate('Copy file content', 'a.txt');
    yield 800;
    rec('copy content -> clipboard bytes', clips().length === n + 1 && lastClip() === 'hello\nworld ✓\n', lastClip());
    n = clips().length;
    activate('Copy file content', 'big.bin');
    yield 800;
    rec('copy content skips > 50 MB', clips().length === n);
    activate('Copy file path', "we ird 'name\".txt");
    yield 800;
    rec('copy path odd name exact', lastClip() === T("we ird 'name\".txt"), lastClip());
    activate('Copy folder path', 'dir');
    yield 800;
    rec('copy folder path', lastClip() === T('dir'), lastClip());

    activate('Duplicate 2 items', 'arc.tar.gz', 'dir');
    yield 1000;
    rec('duplicate double extension + folder', exists('arc (Duplicate).tar.gz') && exists('dir (Duplicate)/inner.txt'));
    activate('Duplicate 2 files', 'arc.tar.gz', 'arc (Duplicate).tar.gz');
    yield 1000;
    rec('duplicate batch never reuses a name', exists('arc (Duplicate 2).tar.gz') && exists('arc (Duplicate 3).tar.gz'));

    activate('Open 2 items with FakeIDE', 'a.txt', 'dir');
    yield 1000;
    const calls = (read(`${OUT}/openwith.log`) ?? '').trim().split('\n').sort();
    const want = [`--flag|two words|${T('a.txt')}|cwd=${TREE}`, `--flag|two words|${T('dir')}|cwd=${TREE}`].sort();
    rec('open-with argv + cwd per item', JSON.stringify(calls) === JSON.stringify(want), calls);
};

const loop = GLib.MainLoop.new(null, false);
const gen = steps();
const tick = () => {
    try {
        const r = gen.next();
        if (r.done) {
            loop.quit();
            return GLib.SOURCE_REMOVE;
        }
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, r.value, tick);
    } catch (e) {
        rec('harness crashed', false, `${e}\n${e.stack}`);
        loop.quit();
    }
    return GLib.SOURCE_REMOVE;
};
GLib.idle_add(GLib.PRIORITY_DEFAULT, tick);
loop.run();
for (const r of results)
    print(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.ok ? '' : `  -> ${r.detail}`}`);
print(`${results.filter(r => r.ok).length}/${results.length} passed`);
