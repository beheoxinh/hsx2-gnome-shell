# ---- Alienware Nautilus Context: shared runtime (injected by nautilusSync.js) ----
# Every installed plugin is self-contained: this block is copied into each
# file at install time, with the schema directory filled in.
#
# Each menu entry reads its on/off state live from the same GSettings key the
# desktop context menu uses, so toggling it in the extension preferences
# applies to the desktop and to Nautilus at once, without restarting Nautilus.
import os
import subprocess

import gi

for _ver in ('4.1', '4.0', '3.0'):
    try:
        gi.require_version('Nautilus', _ver)
        break
    except ValueError:
        continue

from gi.repository import Nautilus, GObject, Gio, GLib  # noqa: E402

_SCHEMA_DIR = @@SCHEMA_DIR@@
_SCHEMA_ID = 'org.gnome.shell.extensions.ding'


def _load_settings():
    """Load the extension's schema from its own directory.

    Returns (settings, schema) or (None, None) when the extension is gone or
    its schema cannot be read; every entry then stays hidden.
    """
    try:
        if not os.path.isdir(_SCHEMA_DIR):
            return None, None
        source = Gio.SettingsSchemaSource.new_from_directory(
            _SCHEMA_DIR, Gio.SettingsSchemaSource.get_default(), False)
        schema = source.lookup(_SCHEMA_ID, False)
        if schema is None:
            return None, None
        return Gio.Settings.new_full(schema, None, None), schema
    except Exception:
        return None, None


SETTINGS, _SCHEMA = _load_settings()


def enabled(key):
    """True only when the key exists and is on (a missing key would abort)."""
    if SETTINGS is None or not _SCHEMA.has_key(key):
        return False
    try:
        return SETTINGS.get_boolean(key)
    except Exception:
        return False


def get_string(key, default=''):
    if SETTINGS is None or not _SCHEMA.has_key(key):
        return default
    try:
        return SETTINGS.get_string(key) or default
    except Exception:
        return default


def local_path(file_info):
    location = file_info.get_location()
    return location.get_path() if location else None


def spawn(argv, cwd=None):
    """Start a detached process; never blocks Nautilus."""
    try:
        subprocess.Popen(argv, cwd=cwd, start_new_session=True,
                         stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                         stderr=subprocess.DEVNULL)
        return True
    except OSError:
        return False


def _clipboard_cmd():
    if os.environ.get('XDG_SESSION_TYPE') == 'wayland' or os.environ.get('WAYLAND_DISPLAY'):
        return ['wl-copy']
    return ['xclip', '-selection', 'clipboard']


# Python cannot own the Wayland/X11 clipboard, so the bytes go to wl-copy/xclip
# through stdin (no shell: odd file names are safe). Nothing here waits for the
# helper and no Python thread is used, so Nautilus' UI never blocks.

def copy_to_clipboard(data):
    """Copy a small in-memory value (fits the pipe buffer, e.g. a path)."""
    try:
        proc = subprocess.Popen(_clipboard_cmd(), stdin=subprocess.PIPE,
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                start_new_session=True)
        proc.stdin.write(data)
        proc.stdin.close()
        return True
    except OSError:
        return False


def copy_file_to_clipboard(path):
    """Copy a file's bytes: the helper reads the file itself as its stdin."""
    try:
        with open(path, 'rb') as f:
            subprocess.Popen(_clipboard_cmd(), stdin=f,
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                             start_new_session=True)
        return True
    except OSError:
        return False
# ---- end shared runtime ----
