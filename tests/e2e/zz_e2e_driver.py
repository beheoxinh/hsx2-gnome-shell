# E2E driver: loaded by the real Nautilus next to the installed Alienware
# plugins; drives them and writes results.json, then exits Nautilus.
import json
import os
import subprocess
import sys
import time
import traceback

import gi
gi.require_version('Nautilus', '4.1')
from gi.repository import Nautilus, GObject, Gio, GLib  # noqa: E402

OUT = os.environ['E2E_OUT']
import faulthandler  # noqa: E402
_FAULT = open(os.path.join(OUT, 'fault.log'), 'w')
faulthandler.enable(file=_FAULT, all_threads=True)
faulthandler.dump_traceback_later(40, exit=False, file=_FAULT)
TREE = os.environ['E2E_TREE']
FAKEBIN = os.environ['E2E_FAKEBIN']
results = []


def rec(name, ok, detail=''):
    results.append({'name': name, 'ok': bool(ok), 'detail': str(detail)})
    with open(os.path.join(OUT, 'results.json'), 'w') as f:
        json.dump(results, f, indent=1)
    with open(os.path.join(OUT, 'progress.log'), 'a') as f:
        f.write(f"{time.strftime('%H:%M:%S')} {'ok ' if ok else 'BAD'} {name}\n")


class Proxy:
    """FileInfo stand-in with loaded info (a fresh NautilusFile has none yet)."""

    def __init__(self, path):
        self.path = path
        self.gfile = Gio.File.new_for_path(path)
        self.emblems = []

    def get_location(self):
        return self.gfile

    def get_uri(self):
        return self.gfile.get_uri()

    def is_directory(self):
        return os.path.isdir(self.path)

    def add_emblem(self, e):
        self.emblems.append(e)


def mod(cls_name):
    for m in list(sys.modules.values()):
        if m is not None and hasattr(m, cls_name) and hasattr(m, 'enabled'):
            return m
    return None


def labels(provider, paths):
    items = provider.get_file_items([Proxy(p) for p in paths])
    return [i.props.label for i in items], items


def clips():
    return sorted(f for f in os.listdir(OUT) if f.startswith('clip-'))


def last_clip():
    c = clips()
    if not c:
        return None
    with open(os.path.join(OUT, c[-1]), 'rb') as f:
        return f.read()


def T(p):
    return os.path.join(TREE, p)


def steps():
    names = ['AlienwareCopyContent', 'AlienwareCopyPath', 'AlienwareDuplicate',
             'AlienwareOpenWith', 'AlienwareGitStatusEmblems']
    mods = {n: mod(n) for n in names}
    rec('all 5 plugins loaded by Nautilus', all(mods.values()),
        {n: (m.__name__ if m else None) for n, m in mods.items()})
    if not all(mods.values()):
        return
    S = mods['AlienwareCopyPath'].SETTINGS
    rec('plugins read the extension schema', S is not None)
    cc = mods['AlienwareCopyContent'].AlienwareCopyContent()
    cp = mods['AlienwareCopyPath'].AlienwareCopyPath()
    du = mods['AlienwareDuplicate'].AlienwareDuplicate()
    ow = mods['AlienwareOpenWith'].AlienwareOpenWith()
    ge = mods['AlienwareGitStatusEmblems'].AlienwareGitStatusEmblems()

    # ---- defaults: every entry on ----
    rec('defaults on', all(S.get_boolean(k) for k in (
        'context-copy-content', 'context-copy-path', 'context-duplicate',
        'open-with-enabled', 'context-git-emblems')))

    # ---- Copy file content ----
    lb, items = labels(cc, [T('a.txt')])
    rec('copy-content label (1 file)', lb == ['Copy file content'], lb)
    rec('copy-content hidden for folder', labels(cc, [T('dir')])[0] == [])
    rec('copy-content hidden for 2 files', labels(cc, [T('a.txt'), T('b.txt')])[0] == [])
    n0 = len(clips())
    items[0].activate()
    yield 800
    rec('copy-content puts the bytes on the clipboard',
        len(clips()) == n0 + 1 and last_clip() == b'hello\nworld \xe2\x9c\x93\n', last_clip())
    n0 = len(clips())
    labels(cc, [T('big.bin')])[1][0].activate()
    yield 800
    rec('copy-content skips files over 50 MB', len(clips()) == n0, clips()[n0:])

    # ---- Copy path ----
    lb, items = labels(cp, [T('a.txt')])
    rec('copy-path label file', lb == ['Copy file path'], lb)
    lbd, itemsd = labels(cp, [T('dir')])
    rec('copy-path label folder', lbd == ['Copy folder path'], lbd)
    rec('copy-path hidden for 2 items', labels(cp, [T('a.txt'), T('dir')])[0] == [])
    items[0].activate()
    yield 800
    rec('copy-path copies the absolute path', last_clip() == T('a.txt').encode(), last_clip())
    lbs, itemss = labels(cp, [T("we ird 'name\".txt")])
    itemss[0].activate()
    yield 800
    rec('copy-path handles odd names', last_clip() == T("we ird 'name\".txt").encode(), last_clip())

    # ---- Duplicate ----
    rec('duplicate label file', labels(du, [T('arc.tar.gz')])[0] == ['Duplicate file'])
    rec('duplicate label folder', labels(du, [T('dir')])[0] == ['Duplicate folder'])
    rec('duplicate label mixed', labels(du, [T('a.txt'), T('dir')])[0] == ['Duplicate 2 items'])
    rec('duplicate label files', labels(du, [T('a.txt'), T('b.txt')])[0] == ['Duplicate 2 files'])
    labels(du, [T('arc.tar.gz'), T('dir')])[1][0].activate()
    yield 1000
    rec('duplicate double extension', os.path.isfile(T('arc (Duplicate).tar.gz')), os.listdir(TREE))
    rec('duplicate folder recursive', os.path.isfile(T('dir (Duplicate)/inner.txt')))
    # batch with a name clash: both want "arc (Duplicate 2).tar.gz"
    labels(du, [T('arc.tar.gz'), T('arc (Duplicate).tar.gz')])[1][0].activate()
    yield 1000
    rec('duplicate batch never reuses a name',
        os.path.isfile(T('arc (Duplicate 2).tar.gz')) and os.path.isfile(T('arc (Duplicate 3).tar.gz')),
        sorted(f for f in os.listdir(TREE) if f.startswith('arc')))

    # ---- Open with ----
    S.set_string('open-with-label', 'FakeIDE')
    S.set_string('open-with-command', f"{FAKEBIN}/fake-editor --flag 'two words'")
    lb, items = labels(ow, [T('a.txt')])
    rec('open-with label', lb == ['Open with FakeIDE'], lb)
    lb2, items2 = labels(ow, [T('a.txt'), T('dir')])
    rec('open-with label multi', lb2 == ['Open 2 items with FakeIDE'], lb2)
    items2[0].activate()
    yield 1000
    try:
        with open(os.path.join(OUT, 'openwith.log')) as f:
            calls = sorted(f.read().strip().split('\n'))
    except OSError as e:
        calls = [str(e)]
    want = sorted([f"--flag|two words|{T('a.txt')}", f"--flag|two words|{T('dir')}"])
    rec('open-with runs the parsed command once per item', calls == want, calls)
    S.set_string('open-with-command', '   ')
    rec('open-with hidden with empty command', labels(ow, [T('a.txt')])[0] == [])
    S.set_string('open-with-command', "broken 'quote")
    rec('open-with hidden with unparsable command', labels(ow, [T('a.txt')])[0] == [])
    S.set_string('open-with-command', f'{FAKEBIN}/fake-editor')

    # ---- toggles: off hides in Nautilus, on shows again (no restart) ----
    for key, prov, path in (('context-copy-content', cc, 'a.txt'), ('context-copy-path', cp, 'a.txt'),
                            ('context-duplicate', du, 'a.txt'), ('open-with-enabled', ow, 'a.txt')):
        S.set_boolean(key, False)
        off = labels(prov, [T(path)])[0]
        S.set_boolean(key, True)
        on = labels(prov, [T(path)])[0]
        rec(f'toggle {key}', off == [] and len(on) == 1, (off, on))

    # ---- Git emblems ----
    repo = T('repo')
    want = {'clean.txt': 'emblem-checked', 'mod.txt': 'emblem-warning',
            'staged.txt': 'emblem-added', 'new.txt': 'emblem-question', '.': 'emblem-warning',
            'sub': 'emblem-checked'}
    got = {}
    for rel in want:
        p = Proxy(os.path.join(repo, rel) if rel != '.' else repo)
        ge.update_file_info(p)
        got[rel] = p.emblems
    rec('git emblems per state', all(got[k] == [v] for k, v in want.items()), got)
    p = Proxy(os.path.join(repo, '.git', 'HEAD'))
    ge.update_file_info(p)
    rec('git emblems skip .git internals', p.emblems == [], p.emblems)
    p = Proxy(T('a.txt'))
    ge.update_file_info(p)
    rec('git emblems: none outside a repo', p.emblems == [], p.emblems)

    # monitor -> debounce -> worker thread -> idle invalidation
    invalidated = []
    orig = ge._invalidate_uris
    ge._invalidate_uris = lambda uris: (invalidated.append(list(uris)), orig(uris))[1]
    with open(os.path.join(repo, 'clean.txt'), 'a') as f:
        f.write('change\n')
    t0 = time.monotonic()
    yield 3500
    st = ge._status_cache.get(repo, (0, {}))[1]
    rec('file monitor + async git refresh status (no F5)',
        st.get('clean.txt') == (' ', 'M') and invalidated,
        {'status': st.get('clean.txt'), 'invalidations': len(invalidated),
         'after_s': round(time.monotonic() - t0, 1)})
    p = Proxy(os.path.join(repo, 'clean.txt'))
    ge.update_file_info(p)
    rec('emblem follows the change', p.emblems == ['emblem-warning'], p.emblems)

    # off: invalidates every tracked URI, emblems gone; file seen while off is remembered
    invalidated.clear()
    S.set_boolean('context-git-emblems', False)
    yield 200
    p = Proxy(os.path.join(repo, 'mod.txt'))
    ge.update_file_info(p)
    p2 = Proxy(os.path.join(repo, 'seen_while_off.txt'))
    ge.update_file_info(p2)
    tracked = ge._repo_files.get(repo, set())
    rec('emblems off: invalidated + no emblem',
        bool(invalidated) and p.emblems == [] and not ge._monitors, (len(invalidated), p.emblems))
    rec('file seen while off is tracked', p2.get_uri() in tracked)
    invalidated.clear()
    S.set_boolean('context-git-emblems', True)
    yield 200
    rec('emblems on again: re-query includes the file seen while off',
        any(p2.get_uri() in batch for batch in invalidated), len(invalidated))

    S.set_boolean('context-git-emblems', True)
    if os.environ.get('E2E_WINDOW') != '1':
        return

    # ---- Part B: real Nautilus window on the repo, real NautilusFile objects ----
    def last(name):
        p = os.path.join(repo, name)
        hits = [e for (path, e) in REAL_LOG if path == p]
        return (len(hits), hits[-1] if hits else None)

    for _ in range(20):
        if last('new.txt')[0]:
            break
        yield 500
    rec('[window] Nautilus calls the plugin for real files',
        all(last(n)[0] for n in ('new.txt', 'mod.txt', 'staged.txt')),
        {n: last(n) for n in ('new.txt', 'mod.txt', 'staged.txt', 'sub')})
    rec('[window] real emblems',
        last('new.txt')[1] == ['emblem-question'] and last('mod.txt')[1] == ['emblem-warning']
        and last('staged.txt')[1] == ['emblem-added'] and last('sub')[1] == ['emblem-checked'],
        {n: last(n)[1] for n in ('new.txt', 'mod.txt', 'staged.txt', 'sub')})
    uri = Gio.File.new_for_path(os.path.join(repo, 'new.txt')).get_uri()
    rec('[window] lookup_for_uri works on a real file', Nautilus.FileInfo.lookup_for_uri(uri) is not None)

    n_before = last('new.txt')[0]
    subprocess.run(['git', '-C', repo, 'add', 'new.txt'], check=True)
    for _ in range(12):
        yield 500
        if last('new.txt')[0] > n_before and last('new.txt')[1] == ['emblem-added']:
            break
    rec('[window] git add -> emblem updates by itself (no F5)',
        last('new.txt')[1] == ['emblem-added'], last('new.txt'))

    n_before = last('mod.txt')[0]
    S.set_boolean('context-git-emblems', False)
    yield 1500
    rec('[window] key off -> Nautilus re-queries, emblem removed',
        last('mod.txt')[0] > n_before and last('mod.txt')[1] == [], last('mod.txt'))
    n_before = last('mod.txt')[0]
    S.set_boolean('context-git-emblems', True)
    yield 1500
    rec('[window] key on -> emblem back without restart',
        last('mod.txt')[0] > n_before and last('mod.txt')[1] == ['emblem-warning'], last('mod.txt'))


def run():
    gen = steps()

    def tick():
        try:
            delay = next(gen)
            GLib.timeout_add(delay, tick)
        except StopIteration:
            finish()
        except Exception:
            rec('driver crashed', False, traceback.format_exc())
            finish()
        return False
    tick()


def finish():
    with open(os.path.join(OUT, 'results.json'), 'w') as f:
        json.dump(results, f, indent=1)
    sys.stdout.flush()
    os._exit(0)


REAL_LOG = []  # (path, emblems) for every real NautilusFile the plugin handled


class _Shim:
    def __init__(self, real):
        self._real = real
        self.emblems = []

    def add_emblem(self, e):
        self.emblems.append(e)
        self._real.add_emblem(e)

    def __getattr__(self, name):
        return getattr(self._real, name)


def _wrap_git_provider():
    m = mod('AlienwareGitStatusEmblems')
    if m is None:
        return
    cls = m.AlienwareGitStatusEmblems
    orig = cls.update_file_info

    def update_file_info(self, file):
        if isinstance(file, Nautilus.FileInfo):
            self._real_files_seen = True
            shim = _Shim(file)
            r = orig(self, shim)
            loc = file.get_location()
            REAL_LOG.append((loc.get_path() if loc else None, shim.emblems))
            return r
        return orig(self, file)
    cls.update_file_info = update_file_info


class AlienwareE2EDriver(GObject.GObject, Nautilus.MenuProvider):
    def __init__(self):
        super().__init__()
        global _STARTED
        if globals().get('_STARTED'):
            return
        _STARTED = True
        _wrap_git_provider()
        app = Gio.Application.get_default()
        if app is not None:
            app.hold()  # --gapplication-service would exit before we run
        else:
            rec('no default GApplication to hold', False)
        GLib.timeout_add(1500, lambda: (run(), False)[1])
