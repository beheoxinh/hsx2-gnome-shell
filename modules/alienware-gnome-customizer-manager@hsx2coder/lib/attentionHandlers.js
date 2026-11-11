// Shared ownership of the shell's window-attention notification handlers.
//
// gnome-shell's WindowAttentionHandler connects
// `this._onWindowDemandsAttention.bind(this)` to global.display in its
// constructor, tracked under the handler object. Two parts of this module
// need those handlers out of the way while they are active:
//   - focus-on-demand (lib/API.js) activates the window instead of notifying;
//   - notification-configurator reconnects its own, hookable handlers.
// Each used to detach/restore on its own (one by "first handler found" id,
// one through the signal tracker), so one could restore handlers the other
// still needed removed, or disconnect ids that were already gone. A
// reference count keeps it consistent: detached while anyone holds a ref,
// restored exactly once when the last one lets go.

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const KEY = Symbol.for('alienware.attention.detachCount');
const FOCUS_KEY = Symbol.for('alienware.attention.focusOnDemand');

// Focus-on-demand activates the window itself, which makes any notification
// for it pointless (the shell's own handler bails out on focused windows).
// Both components listen on the same display signal and GObject runs them
// in connection order, so toggling focus-on-demand at runtime could leave
// the notification handler first: a banner popped for a window that was
// focused a moment later. The flag makes that order irrelevant.
export function setFocusOnDemand(on) {
    const handler = Main.windowAttentionHandler;
    if (handler)
        handler[FOCUS_KEY] = !!on;
}

export function isFocusOnDemand() {
    return !!Main.windowAttentionHandler?.[FOCUS_KEY];
}

export function detachShellAttentionHandlers() {
    const handler = Main.windowAttentionHandler;
    if (!handler)
        return false;
    const count = handler[KEY] ?? 0;
    if (count === 0)
        global.display.disconnectObject(handler);
    handler[KEY] = count + 1;
    return true;
}

export function restoreShellAttentionHandlers() {
    const handler = Main.windowAttentionHandler;
    const count = handler?.[KEY] ?? 0;
    if (count === 0)
        return;
    handler[KEY] = count - 1;
    if (count > 1)
        return;
    // Callers release their prototype overrides before their ref, so this
    // binds the shell's original method again.
    global.display.connectObject(
        'window-demands-attention', handler._onWindowDemandsAttention.bind(handler),
        'window-marked-urgent', handler._onWindowDemandsAttention.bind(handler),
        handler);
}
