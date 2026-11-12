/**
 * Runtime feature detection for headless / remote sessions.
 *
 * GNOME Remote Desktop (system mode) runs the session on a Mutter virtual
 * monitor ("Meta-<n>") with no physical outputs and no backlight device.
 * Extensions that drive hardware-backed indicators must degrade gracefully
 * there instead of throwing on every property change.
 *
 * @license GPL-3.0-only
 */
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

let _headlessCache = null;
let _backlightCache = null;

function readSysfs(path) {
    try {
        const [ok, bytes] = GLib.file_get_contents(path);
        if (!ok)
            return null;
        return new TextDecoder().decode(bytes);
    } catch {
        return null;
    }
}

function listDir(path) {
    try {
        const file = Gio.File.new_for_path(path);
        const enumerator = file.enumerate_children(
            'standard::name', Gio.FileQueryInfoFlags.NONE, null);
        const names = [];
        let info;
        while ((info = enumerator.next_file(null)) !== null)
            names.push(info.get_name());
        return names;
    } catch {
        return [];
    }
}

/**
 * True when the machine exposes a panel backlight (laptop panel, some
 * external displays via ddcci). Desktops and headless sessions don't.
 *
 * @returns {boolean}
 */
export function hasBacklight() {
    if (_backlightCache === null)
        _backlightCache = listDir('/sys/class/backlight').length > 0;
    return _backlightCache;
}

/**
 * True when at least one DRM connector reports a real, plugged-in output.
 *
 * @returns {boolean}
 */
export function hasPhysicalOutput() {
    const connectors = listDir('/sys/class/drm')
        // Connector names can contain more than one dash: card0-HDMI-A-1,
        // card0-DP-1, card0-eDP-1. Only exclude the card/render/version
        // entries, which have no connector status file.
        .filter(name => /^card\d+-[A-Za-z0-9-]+$/.test(name));
    if (connectors.length === 0)
        return false;

    return connectors.some(name => {
        const status = readSysfs(`/sys/class/drm/${name}/status`);
        return status !== null && status.trim() === 'connected';
    });
}

/**
 * Detect a headless session (RDP remote login, virtual machine without an
 * output, monitor-less server).
 *
 * Layered so that a single missing API doesn't produce a false negative:
 *   1. Mutter exposes the virtual monitor as connector "Meta-<n>".
 *   2. Fall back to sysfs: no DRM connector is "connected".
 *   3. A machine without backlight and without outputs is headless too.
 *
 * @returns {boolean}
 */
export function isHeadlessSession() {
    if (_headlessCache !== null)
        return _headlessCache;

    // 1) Mutter virtual monitor
    try {
        const manager = global?.backend?.get_monitor_manager?.();
        const monitors = manager?.get_monitors?.() ?? [];
        if (monitors.length > 0) {
            const allVirtual = monitors.every(monitor => {
                const connector = monitor?.get_connector?.() ?? '';
                return connector.startsWith('Meta-');
            });
            if (allVirtual) {
                _headlessCache = true;
                return _headlessCache;
            }
        }
    } catch {
        // API not available in this shell build; fall through
    }

    // 2) sysfs fallback
    _headlessCache = !hasPhysicalOutput();
    return _headlessCache;
}

/**
 * Reset caches. No caller in the tree today; call it from a module's enable()
 * if the session can change at runtime (for example a remote login).
 *
 * @returns {void}
 */
export function resetHeadlessCache() {
    _headlessCache = null;
    _backlightCache = null;
}

/**
 * Wrap a callback so a single failing call can never break the caller or
 * flood the journal. The first failure per key is logged, later ones dropped.
 *
 * @param {object} store object used to remember already-logged keys
 * @param {string} key unique key for the guarded feature
 * @param {Function} func function to run
 * @param {...any} args arguments forwarded to func
 *
 * @returns {any} func's return value, or undefined when it threw
 */
export function guarded(store, key, func, ...args) {
    try {
        return func(...args);
    } catch (e) {
        if (!store[key]) {
            store[key] = true;
            const where = isHeadlessSession() ? 'headless session' : 'this session';
            console.warn(`[alienware-suite] "${key}" unavailable in ${where}: ${e?.message ?? e}`);
        }
        return undefined;
    }
}
