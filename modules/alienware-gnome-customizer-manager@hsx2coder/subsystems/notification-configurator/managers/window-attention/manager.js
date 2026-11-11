import { InjectionManager } from "resource:///org/gnome/shell/extensions/extension.js";
import GObject from "gi://GObject";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { detachShellAttentionHandlers, restoreShellAttentionHandlers, isFocusOnDemand } from "../../../../lib/attentionHandlers.js";
export class WindowAttentionManager {
    injectionManager = new InjectionManager();
    hooks = [];
    registerHook(hook) {
        this.hooks.push(hook);
    }
    enable() {
        this.patchHandler();
        this.reconnectSignals();
    }
    disable() {
        this.injectionManager.clear();
        this._disconnectSignals();
        this._restoreShellHandlers();
    }
    // The shell connects `this._onWindowDemandsAttention.bind(this)` in its
    // constructor, i.e. the ORIGINAL function, tracked under the handler
    // object. Overriding the prototype does not reach that bound copy, so
    // leaving it connected next to ours showed every notification twice.
    _removeShellHandlers() {
        if (this._shellHandlersRemoved)
            return;
        try {
            this._shellHandlersRemoved = detachShellAttentionHandlers();
        }
        catch (error) {
            console.error("[WindowAttentionManager] could not detach shell handlers", error);
        }
    }
    _restoreShellHandlers() {
        if (!this._shellHandlersRemoved)
            return;
        this._shellHandlersRemoved = false;
        try {
            // prototype is unpatched again here (injectionManager.clear ran first)
            restoreShellAttentionHandlers();
        }
        catch (error) {
            console.error("[WindowAttentionManager] could not restore shell handlers", error);
        }
    }
    _disconnectSignals() {
        const display = global.display;
        const attentionHandler = Main.windowAttentionHandler;
        for (const key of ["_windowDemandsAttentionId", "_windowMarkedUrgentId"]) {
            const id = attentionHandler[key];
            if (typeof id !== "number")
                continue;
            if (GObject.signal_handler_is_connected(display, id))
                display.disconnect(id);
            attentionHandler[key] = undefined;
        }
    }
    patchHandler() {
        const proto = Object.getPrototypeOf(Main.windowAttentionHandler);
        const hooks = this.hooks;
        this.injectionManager.overrideMethod(proto, "_onWindowDemandsAttention", (original) => function (display, window) {
            let originalCalled = false;
            const runOriginal = () => {
                if (originalCalled) {
                    return;
                }
                originalCalled = true;
                original.call(this, display, window);
            };
            for (const hook of hooks) {
                let handled = false;
                try {
                    handled = hook(runOriginal, window);
                }
                catch (error) {
                    console.error("[WindowAttentionManager] hook failed", error);
                }
                if (handled || originalCalled) {
                    return;
                }
            }
            runOriginal();
        });
    }
    reconnectSignals() {
        const attentionHandler = Main.windowAttentionHandler;
        const display = global.display;
        const callback = (currentDisplay, window) => {
            // focus-on-demand owns these events: it focuses the window, so a
            // notification would only flash up (see attentionHandlers.js)
            if (isFocusOnDemand())
                return;
            attentionHandler._onWindowDemandsAttention(currentDisplay, window);
        };

        this._disconnectSignals();
        this._removeShellHandlers();

        // Plain connect()/disconnect() with our own ids, so our handlers are
        // never mixed into the shell's SignalTracker entry for the handler
        // object (which _removeShellHandlers/_restoreShellHandlers manage).
        attentionHandler._windowDemandsAttentionId = display.connect("window-demands-attention", callback);
        attentionHandler._windowMarkedUrgentId = display.connect("window-marked-urgent", callback);
    }
    dispose() {
        this.disable();
        this.hooks = [];
    }
}
