# @@HEADER@@
"""Open with <label>: opens the selected items with a configurable command.

Label and command come live from the same keys the desktop menu uses
(open-with-enabled, open-with-label, open-with-command)."""
# @@COMMON@@


def _open_all(argv, paths):
    for path in paths:
        spawn(argv + [path], cwd=os.path.dirname(path) or None)


class AlienwareOpenWith(GObject.GObject, Nautilus.MenuProvider):
    def get_file_items(self, *args):
        files = args[-1]
        if not enabled('open-with-enabled') or not files:
            return []
        command = get_string('open-with-command').strip()
        if not command:
            return []
        try:
            ok, argv = GLib.shell_parse_argv(command)
        except GLib.Error:
            return []
        if not ok or not argv:
            return []
        paths = [p for p in (local_path(f) for f in files) if p]
        if not paths:
            return []
        label = get_string('open-with-label', 'IDE')
        count = len(paths)
        text = f'Open with {label}' if count == 1 else f'Open {count} items with {label}'
        item = Nautilus.MenuItem(name='Alienware::OpenWith', label=text,
                                 tip=f'Open {count} selected item(s) with {label}')
        item.connect('activate', lambda _m: _open_all(list(argv), paths))
        return [item]
