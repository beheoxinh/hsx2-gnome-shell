# @@HEADER@@
"""Duplicate: copies the selected files/folders next to the originals as
"name (Duplicate).ext", "name (Duplicate 2).ext", ...

Same entry and naming as "Duplicate ..." in the desktop context menu (key
context-duplicate). The copy runs in a separate `cp` process so a large
folder never freezes Nautilus."""
# @@COMMON@@
import re  # noqa: E402

_SUFFIX_RE = re.compile(r' \(Duplicate(?: \d+)?\)$')


_DOUBLE_EXTENSIONS = ('.gz', '.bz2', '.sit', '.Z', '.bz', '.xz')


def _split_name(path, is_dir):
    """(base, ext) exactly like DesktopIconsUtil.getFileExtensionOffset, so the
    desktop and Nautilus pick the same duplicate name."""
    name = os.path.basename(path)
    if is_dir:
        return name, ''
    ext = ''
    for item in _DOUBLE_EXTENSIONS:
        if name.endswith(item):
            ext = name[-len(item):]
            name = name[:-len(item)]
            break
    last_dot = name.rfind('.')
    if last_dot > 0:
        ext = name[last_dot:] + ext
        name = name[:last_dot]
    return name, ext


def next_free_name(path, is_dir, taken=()):
    """`taken`: names already promised to earlier copies of this batch (cp is
    asynchronous, so they may not exist on disk yet)."""
    parent = os.path.dirname(os.path.abspath(path))
    base, ext = _split_name(path, is_dir)
    base = _SUFFIX_RE.sub('', base)
    candidate = os.path.join(parent, f'{base} (Duplicate){ext}')
    n = 2
    while os.path.lexists(candidate) or candidate in taken:
        candidate = os.path.join(parent, f'{base} (Duplicate {n}){ext}')
        n += 1
    return candidate


def _duplicate(items):
    taken = set()
    for path, is_dir in items:
        dest = next_free_name(path, is_dir, taken)
        taken.add(dest)
        # -a keeps symlinks, modes and times; reflink is free on btrfs/xfs.
        spawn(['cp', '-a', '--reflink=auto', '--no-target-directory', '--', path, dest])


class AlienwareDuplicate(GObject.GObject, Nautilus.MenuProvider):
    def get_file_items(self, *args):
        files = args[-1]
        if not enabled('context-duplicate') or not files:
            return []
        items = []
        for f in files:
            path = local_path(f)
            if path:
                # Same rule as the desktop (target.isDirectory): a link to a
                # folder counts as a folder, so both pick the same name.
                items.append((path, bool(f.is_directory())))
        if not items:
            return []
        count = len(items)
        has_dir = any(d for _p, d in items)
        has_file = any(not d for _p, d in items)
        if count == 1:
            label = 'Duplicate folder' if has_dir else 'Duplicate file'
        elif has_dir and has_file:
            label = f'Duplicate {count} items'
        elif has_dir:
            label = f'Duplicate {count} folders'
        else:
            label = f'Duplicate {count} files'
        item = Nautilus.MenuItem(name='Alienware::Duplicate', label=label,
                                 tip=f'Create copies of {count} selected item(s)')
        item.connect('activate', lambda _m: _duplicate(items))
        return [item]
