# @@HEADER@@
"""Copy file content: puts the bytes of one file on the clipboard.

Same entry as "Copy file content" in the desktop context menu (key
context-copy-content)."""
# @@COMMON@@

MAX_SIZE = 50 * 1024 * 1024  # 50 MB: avoid freezing on a huge file chosen by mistake


def _copy_file(path):
    try:
        if os.path.getsize(path) > MAX_SIZE:
            return
    except OSError:
        return
    copy_file_to_clipboard(path)


class AlienwareCopyContent(GObject.GObject, Nautilus.MenuProvider):
    def get_file_items(self, *args):
        files = args[-1]
        if not enabled('context-copy-content') or not files or len(files) != 1:
            return []
        path = local_path(files[0])
        if not path or not os.path.isfile(path):
            return []
        item = Nautilus.MenuItem(name='Alienware::CopyContent',
                                 label='Copy file content',
                                 tip='Copy the content of this file to the clipboard')
        item.connect('activate', lambda _m: _copy_file(path))
        return [item]
