# @@HEADER@@
"""Git status emblems for Nautilus (Tortoise-style).

Shows overlay emblems on files/folders based on git status:
  clean/tracked -> emblem-checked
  modified      -> emblem-warning
  staged        -> emblem-added
  untracked     -> emblem-question
  conflict      -> emblem-error

Auto-refresh: Gio.FileMonitor (inotify) watches .git/ + the worktree root, so
emblems follow git without F5.

Nautilus only (the desktop has no emblems). On/off: key context-git-emblems;
turning it off clears the emblems already shown.
"""
# @@COMMON@@
import time  # noqa: E402

# Everything runs on Nautilus' main loop: no Python threads (nautilus-python
# does not let them run reliably, and a lock shared with the UI thread can
# freeze Nautilus). Background refreshes use Gio.Subprocess asynchronously.

# Git status cache TTL per repo (seconds)
STATUS_TTL = 1.0

# Debounce for file-monitor events (seconds)
MONITOR_DEBOUNCE = 1.0

EMBLEM_CLEAN = 'emblem-checked'
EMBLEM_MODIFIED = 'emblem-warning'
EMBLEM_STAGED = 'emblem-added'
EMBLEM_UNTRACKED = 'emblem-question'
EMBLEM_CONFLICT = 'emblem-error'

# Priority when a folder holds several states (high -> low)
PRIORITY = {
    EMBLEM_CONFLICT: 5,
    EMBLEM_MODIFIED: 4,
    EMBLEM_STAGED: 3,
    EMBLEM_UNTRACKED: 2,
    EMBLEM_CLEAN: 1,
}

SETTING_KEY = 'context-git-emblems'


def find_repo_root(path):
    """Nearest repo root above path. Returns (repo_root, rel_path) or (None, None)."""
    curr = os.path.abspath(path)
    if os.path.isfile(curr):
        curr = os.path.dirname(curr)
    while curr:
        git_dir = os.path.join(curr, '.git')
        if os.path.exists(git_dir):
            rel_full = os.path.relpath(os.path.abspath(path), curr)
            return curr, rel_full
        parent = os.path.dirname(curr)
        if parent == curr:
            break
        curr = parent
    return None, None


def is_inside_git_dir(repo_root, abs_path):
    try:
        rel = os.path.relpath(abs_path, repo_root)
    except ValueError:
        return False
    return rel == '.git' or rel.startswith('.git' + os.sep)


def parse_porcelain_z(output_bytes):
    result = {}
    entries = output_bytes.split(b'\x00')
    for entry in entries:
        if len(entry) < 4:
            continue
        try:
            x = chr(entry[0])
            y = chr(entry[1])
            path = entry[3:].decode('utf-8', errors='surrogateescape')
        except Exception:
            continue
        if ' -> ' in path:
            path = path.rsplit(' -> ', 1)[1]
        if path.startswith('"') and path.endswith('"'):
            path = path[1:-1]
        result[path] = (x, y)
    return result


def status_to_emblem(x, y):
    xy = x + y
    if xy in ('UU', 'AA', 'DD', 'UD', 'DU', 'AU', 'UA'):
        return EMBLEM_CONFLICT
    if xy == '??':
        return EMBLEM_UNTRACKED
    if xy == '!!':
        return None
    if y in ('M', 'D', 'T'):
        return EMBLEM_MODIFIED
    if x in ('M', 'A', 'R', 'C', 'D', 'T'):
        return EMBLEM_STAGED
    return None


GIT_STATUS = ['git', 'status', '--porcelain=v1', '-z', '-uall', '--ignored=no']


def _git_status(repo_root):
    return subprocess.run(
        GIT_STATUS,
        cwd=repo_root,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        timeout=10,
    ).stdout


class AlienwareGitStatusEmblems(GObject.GObject, Nautilus.InfoProvider):
    def __init__(self):
        super().__init__()
        # {repo_root: (timestamp, status_dict)}
        self._status_cache = {}
        # {dir_path: repo_root or False}
        self._repo_cache = {}
        # URIs shown with an emblem: {repo_root: set(uri)}
        self._repo_files = {}
        # Strong refs to Gio.FileMonitor: {repo_root: [monitors]}
        self._monitors = {}
        # Debounce timer per repo: {repo_root: source_id}
        self._debounce_ids = {}
        # Async git refresh in flight: {repo_root: rerun_needed}
        self._refreshing = {}
        self._real_files_seen = False
        if SETTINGS is not None and _SCHEMA.has_key(SETTING_KEY):
            SETTINGS.connect(f'changed::{SETTING_KEY}', self._on_setting_changed)

    # ---------- on/off ----------

    def _on_setting_changed(self, *_args):
        """Re-query every file seen so emblems appear/disappear at once."""
        uris = [u for s in self._repo_files.values() for u in s]
        if not enabled(SETTING_KEY):
            self._status_cache.clear()
            self._drop_monitors()
        self._invalidate_uris(uris)

    def _drop_monitors(self, repo_root=None):
        repos = [repo_root] if repo_root else list(self._monitors)
        for repo in repos:
            for m in self._monitors.pop(repo, []):
                try:
                    m.cancel()
                except Exception:
                    pass
            sid = self._debounce_ids.pop(repo, None)
            if sid:
                GLib.source_remove(sid)

    # ---------- repo / status ----------

    def _get_repo_root(self, abs_path):
        check = abs_path if os.path.isdir(abs_path) else os.path.dirname(abs_path)
        if check in self._repo_cache:
            cached = self._repo_cache[check]
            if cached is False:
                return None, None
            try:
                rel = os.path.relpath(abs_path, cached)
            except ValueError:
                return None, None
            return cached, rel
        repo, rel = find_repo_root(abs_path)
        self._repo_cache[check] = repo if repo else False
        if len(self._repo_cache) > 2000:
            self._repo_cache.clear()
        return repo, rel

    def _get_status(self, repo_root):
        now = time.monotonic()
        if repo_root in self._status_cache:
            ts, data = self._status_cache[repo_root]
            if now - ts < STATUS_TTL:
                return data
        try:
            data = parse_porcelain_z(_git_status(repo_root))
        except Exception:
            data = {}
        self._status_cache[repo_root] = (now, data)
        return data

    # ---------- file monitor (inotify) ----------

    def _ensure_monitor(self, repo_root):
        """One set of monitors per repo: .git/ plus the worktree root."""
        if repo_root in self._monitors:
            return
        monitors = []
        try:
            git_dir = Gio.File.new_for_path(os.path.join(repo_root, '.git'))
            # .git can be a file (worktree/submodule): follow gitdir:
            if os.path.isfile(os.path.join(repo_root, '.git')):
                try:
                    with open(os.path.join(repo_root, '.git')) as f:
                        content = f.read().strip()
                        if content.startswith('gitdir:'):
                            git_path = os.path.join(repo_root, content[7:].strip())
                            git_dir = Gio.File.new_for_path(git_path)
                except Exception:
                    pass
            m1 = git_dir.monitor_directory(Gio.FileMonitorFlags.NONE, None)
            m1.connect('changed', self._on_repo_changed, repo_root)
            monitors.append(m1)

            root = Gio.File.new_for_path(repo_root)
            m2 = root.monitor_directory(Gio.FileMonitorFlags.NONE, None)
            m2.connect('changed', self._on_repo_changed, repo_root)
            monitors.append(m2)
        except Exception:
            pass
        # Store even a partial/empty set so a failing repo is not retried on
        # every file Nautilus asks about.
        self._monitors[repo_root] = monitors

    def _on_repo_changed(self, monitor, file, other_file, event_type, repo_root):
        if event_type == Gio.FileMonitorEvent.CHANGES_DONE_HINT:
            return
        # git touches .git/index.lock on every `git status`: ignore our own runs.
        if file is not None and file.get_basename() == 'index.lock':
            return
        old_id = self._debounce_ids.get(repo_root)
        if old_id:
            GLib.source_remove(old_id)
        self._debounce_ids[repo_root] = GLib.timeout_add(
            int(MONITOR_DEBOUNCE * 1000), self._on_debounce_fire, repo_root)

    def _on_debounce_fire(self, repo_root):
        self._debounce_ids.pop(repo_root, None)
        self._refresh_repo(repo_root)
        return False

    def _refresh_repo(self, repo_root):
        """Run `git status` asynchronously; invalidate the repo's files when
        the result changed. One run per repo at a time."""
        if repo_root in self._refreshing:
            self._refreshing[repo_root] = True  # run again when this one ends
            return
        try:
            launcher = Gio.SubprocessLauncher.new(
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE)
            launcher.set_cwd(repo_root)
            proc = launcher.spawnv(GIT_STATUS)
        except Exception:
            return
        self._refreshing[repo_root] = False
        proc.communicate_async(None, None, self._on_refresh_done, repo_root)

    def _on_refresh_done(self, proc, res, repo_root):
        rerun = self._refreshing.pop(repo_root, False)
        try:
            _ok, stdout, _err = proc.communicate_finish(res)
            ok = proc.get_successful()
            raw = stdout.get_data() if stdout is not None else b''
        except Exception:
            ok, raw = False, b''
        if ok and enabled(SETTING_KEY):
            new_data = parse_porcelain_z(bytes(raw))
            old_entry = self._status_cache.get(repo_root)
            old_data = old_entry[1] if old_entry else None
            self._status_cache[repo_root] = (time.monotonic(), new_data)
            if new_data != old_data:
                self._invalidate_uris(list(self._repo_files.get(repo_root, ())))
        if rerun:
            self._refresh_repo(repo_root)

    def _invalidate_uris(self, uris):
        # lookup_for_uri jumps through a function pointer Nautilus sets only
        # once its NautilusFile class exists; calling it earlier segfaults.
        # Any real FileInfo handed to update_file_info proves it is set.
        if not self._real_files_seen:
            return False
        for uri in uris:
            try:
                f = Nautilus.FileInfo.lookup_for_uri(uri)
                if f is not None:
                    f.invalidate_extension_info()
            except Exception:
                pass
        return False

    def _track_file(self, repo_root, file, watch=True):
        try:
            uri = file.get_uri()
            if not uri:
                return
            s = self._repo_files.get(repo_root)
            if s is None:
                if len(self._repo_files) > 50:
                    # Drop the oldest repo (monitors + files)
                    oldest = next(iter(self._repo_files))
                    self._repo_files.pop(oldest, None)
                    self._drop_monitors(oldest)
                s = set()
                self._repo_files[repo_root] = s
            s.add(uri)
            if len(s) > 5000:
                s.clear()
        except Exception:
            pass
        if watch:
            self._ensure_monitor(repo_root)

    # ---------- emblem logic ----------

    def _emblem_for_file(self, repo_root, rel_path, status):
        if rel_path in status:
            x, y = status[rel_path]
            emb = status_to_emblem(x, y)
            if emb:
                return emb
            return EMBLEM_CLEAN
        return EMBLEM_CLEAN

    def _emblem_for_dir(self, repo_root, rel_path, status):
        if rel_path == '.':
            prefix = ''
            is_root = True
        else:
            prefix = rel_path + '/'
            is_root = False
        best = None
        best_prio = 0
        has_tracked = False
        for p, (x, y) in status.items():
            if is_root or p == rel_path or p.startswith(prefix):
                emb = status_to_emblem(x, y)
                if emb:
                    pr = PRIORITY.get(emb, 0)
                    if pr > best_prio:
                        best_prio = pr
                        best = emb
                else:
                    has_tracked = True
        if best:
            return best
        if is_root or has_tracked:
            return EMBLEM_CLEAN
        try:
            out = subprocess.run(
                ['git', 'ls-files', '--', rel_path if not is_root else '.'],
                cwd=repo_root,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                timeout=5,
            ).stdout
            if out.strip():
                return EMBLEM_CLEAN
        except Exception:
            pass
        return None

    def update_file_info(self, file):
        try:
            if not self._real_files_seen and isinstance(file, Nautilus.FileInfo):
                self._real_files_seen = True
            on = enabled(SETTING_KEY)
            location = file.get_location()
            if not location:
                return Nautilus.OperationResult.COMPLETE
            abs_path = location.get_path()
            if not abs_path:
                return Nautilus.OperationResult.COMPLETE
            repo_root, rel_path = self._get_repo_root(abs_path)
            if not repo_root:
                return Nautilus.OperationResult.COMPLETE
            if is_inside_git_dir(repo_root, abs_path):
                return Nautilus.OperationResult.COMPLETE
            if not on:
                # Remember the file (no git call, no monitor) so turning the
                # key back on can show its emblem without F5.
                self._track_file(repo_root, file, watch=False)
                return Nautilus.OperationResult.COMPLETE
            status = self._get_status(repo_root)
            self._track_file(repo_root, file)
            if os.path.abspath(abs_path) == os.path.abspath(repo_root):
                emb = self._emblem_for_dir(repo_root, '.', status)
            elif file.is_directory():
                emb = self._emblem_for_dir(repo_root, rel_path, status)
            else:
                emb = self._emblem_for_file(repo_root, rel_path, status)
            if emb:
                file.add_emblem(emb)
        except Exception:
            pass
        return Nautilus.OperationResult.COMPLETE

    def cancel_update(self, provider, handle):
        pass
