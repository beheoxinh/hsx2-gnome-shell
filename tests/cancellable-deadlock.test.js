// Regression test for the screen-lock freeze.
//
// Run with:  gjs -m tests/cancellable-deadlock.test.js
//
// History: CancellablePromise disconnected its 'cancelled' handler from inside
// the handler itself. g_cancellable_cancel() emits that signal while holding
// the cancellable's internal mutex and g_cancellable_disconnect() locks the
// same non-recursive mutex, so the shell main loop deadlocked in futex_wait
// every time a pending CancellablePromise was alive while the AppIndicator
// watcher was destroyed -- which happens on every screen lock. Captured with
// gdb on a frozen shell: g_cancellable_cancel -> g_signal_emit ->
// g_cancellable_disconnect -> g_mutex_lock_slowpath.
//
// This test asserts cancel() RETURNS while a handler is attached (the old code
// never returned) and that the handler is disconnected afterwards.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';

const loop = new GLib.MainLoop(null, false);
let failures = 0;

function assert(condition, message) {
    if (!condition) {
        printerr(`FAIL: ${message}`);
        failures++;
    } else {
        print(`ok: ${message}`);
    }
}

const cancellable = new Gio.Cancellable();
let handlerFired = false;
let handlerId = 0;

handlerId = cancellable.connect(() => {
    handlerFired = true;
    const id = handlerId;
    handlerId = 0;
    // The fix: never disconnect synchronously inside the emission.
    if (id) {
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            if (GObject.signal_handler_is_connected(cancellable, id)) {
                try {
                    cancellable.disconnect(id);
                } catch (_e) {}
            }
            return GLib.SOURCE_REMOVE;
        });
    }
});

// If this never returns, the deadlock is back and this process hangs until
// the outer timeout kills it (non-zero exit).
cancellable.cancel();
assert(handlerFired, 'cancelled handler ran');
assert(cancellable.is_cancelled(), 'cancellable is cancelled');

GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
    assert(!GObject.signal_handler_is_connected(cancellable, handlerId),
        'handler disconnected after emission');
    loop.quit();
    return GLib.SOURCE_REMOVE;
});

loop.run();

if (failures > 0) {
    printerr(`${failures} check(s) failed`);
    System.exit(1);
}
print('all checks passed');
