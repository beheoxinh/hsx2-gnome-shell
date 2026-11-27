# @@HEADER@@
"""Copy file/folder path: puts the absolute path of one item on the clipboard.

Same entry as "Copy file path" / "Copy folder path" in the desktop context
menu (key context-copy-path)."""
# @@COMMON@@


class AlienwareCopyPath(GObject.GObject, Nautilus.MenuProvider):
    def get_file_items(self, *args):
        files = args[-1]
        if not enabled('context-copy-path') or not files or len(files) != 1:
            return []
        target = files[0]
        path = local_path(target)
        if not path:
            return []
        kind = 'folder' if target.is_directory() else 'file'
        item = Nautilus.MenuItem(name='Alienware::CopyPath',
                                 label=f'Copy {kind} path',
                                 tip=f'Copy the absolute path of this {kind}')
        data = os.path.abspath(path).encode('utf-8', 'surrogateescape')
        item.connect('activate', lambda _m: copy_to_clipboard(data))
        return [item]
