import { InjectionManager } from "resource:///org/gnome/shell/extensions/extension.js";
import GObject from "gi://GObject";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
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
        const callback = (currentDisplay, window) => attentionHandler._onWindowDemandsAttention(currentDisplay, window);

        this._disconnectSignals();

        // Plain connect()/disconnect() with our own ids: connectObject() tracks
        // handlers on a shared SignalTracker keyed by the tracker object, so
        // disconnecting through the shell's windowAttentionHandler also tore down
        // handlers the shell owns and left ids the tracker could no longer find.
        attentionHandler._windowDemandsAttentionId = display.connect("window-demands-attention", callback);
        attentionHandler._windowMarkedUrgentId = display.connect("window-marked-urgent", callback);
    }
    dispose() {
        this.disable();
        this.hooks = [];
    }
}
