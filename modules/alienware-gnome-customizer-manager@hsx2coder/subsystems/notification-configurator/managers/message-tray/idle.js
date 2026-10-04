export class IdleAdapter {
    settingsManager;
    listenerId;
    constructor(settingsManager) {
        this.settingsManager = settingsManager;
    }
    createHook() {

        try {
        const settingsManager = this.settingsManager;
        return (original, { tray }) => {
            if (settingsManager.ignoreIdle) {
                tray._userActiveWhileNotificationShown = true;
            }
            original();
        };
            } catch (e) {
            logError(e, 'NC-IDLE');
        }
    }
    register(manager) {

        try {
        this.listenerId = this.settingsManager.events.on("ignoreIdleChanged", () => { });
        manager.registerUpdateStateHook(this.createHook());
            } catch (e) {
            logError(e, 'NC-IDLE');
        }
    }
    dispose() {

        try {
        if (this.listenerId !== undefined) {
            this.settingsManager.events.off(this.listenerId);
            this.listenerId = undefined;
        }
            } catch (e) {
            logError(e, 'NC-IDLE');
        }
    }
}
