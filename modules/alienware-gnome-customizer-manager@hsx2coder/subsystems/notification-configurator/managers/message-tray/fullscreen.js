import * as Main from "resource:///org/gnome/shell/ui/main.js";
export class FullscreenAdapter {
    settingsManager;
    listenerId;
    constructor(settingsManager) {
        this.settingsManager = settingsManager;
    }
    createHook() {
        const settingsManager = this.settingsManager;
        return (original) => {
            if (!settingsManager.fullscreenEnabled) {
                return;
            }
            const primaryMonitor = Main.layoutManager.primaryMonitor;
            if (!primaryMonitor) {
                original();
                return;
            }
            const monitorProto = Object.getPrototypeOf(primaryMonitor);
            // biome-ignore lint/style/noNonNullAssertion: it's present in supported shell versions
            const originalDescriptor = Object.getOwnPropertyDescriptor(monitorProto, "inFullscreen");
            if (!originalDescriptor) {
                original();
                return;
            }
            Object.defineProperty(monitorProto, "inFullscreen", {
                get: () => false,
                configurable: true,
            });
            try {
                original();
            }
            finally {
                Object.defineProperty(monitorProto, "inFullscreen", originalDescriptor);
            }
        };
    }
    register(manager) {
        this.listenerId = this.settingsManager.events.on("fullscreenEnabledChanged", () => { });
        manager.registerUpdateStateHook(this.createHook());
    }
    dispose() {
        if (this.listenerId !== undefined) {
            this.settingsManager.events.off(this.listenerId);
            this.listenerId = undefined;
        }
    }
}
