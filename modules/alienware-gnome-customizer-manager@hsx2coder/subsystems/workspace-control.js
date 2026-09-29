/**
 * Workspace Control, folded into alienware-gnome-customizer-manager.
 *
 * This was a standalone module whose only job was a settings front-end: every
 * handler reached into the customizer's shell-tweak API across a module
 * boundary. Both halves now live in the same module and the API is handed to
 * it directly, so the keys sit in one schema instead of two.
 */

export class WorkspaceControl {
    #settings = null;
    #api = null;
    #signalIds = [];
    #jpApi = null;

    constructor(settings, api) {
        this.#settings = settings;
        this.#api = api;
    }

    start() {
        console.log('[workspace-control] start()');
        this.#jpApi = this.#api;
        this.#registerSignals();
        this.#applyAll();
    }

    stop() {
        this.#disconnectSignals();
        this.#revertAll();
        this.#jpApi = null;
    }

    #registerSignals() {
        this.#settings.connectObject(
            'changed::workspace',
            () => this.#applyWorkspace(false),
            this
        );
        this.#settings.connectObject(
            'changed::workspace-popup',
            () => this.#applyWorkspacePopup(false),
            this
        );
        this.#settings.connectObject(
            'changed::workspace-switcher-size',
            () => this.#applyWorkspaceSwitcherSize(false),
            this
        );
        this.#settings.connectObject(
            'changed::workspace-switcher-should-show',
            () => this.#applyWorkspaceSwitcherShouldShow(false),
            this
        );
        this.#settings.connectObject(
            'changed::workspace-wrap-around',
            () => this.#applyWorkspaceWrapAround(false),
            this
        );
        this.#settings.connectObject(
            'changed::workspace-peek',
            () => this.#applyWorkspacePeek(false),
            this
        );
        this.#settings.connectObject(
            'changed::workspaces-in-app-grid',
            () => this.#applyWorkspacesInAppGrid(false),
            this
        );
        this.#settings.connectObject(
            'changed::workspace-background-corner-size',
            () => this.#applyWorkspaceBackgroundCornerSize(false),
            this
        );
        this.#settings.connectObject(
            'changed::workspace-thumbnail-to-main-view',
            () => this.#applyWorkspaceThumbnailToMainView(false),
            this
        );
        this.#settings.connectObject(
            'changed::overlay-key',
            () => this.#applyOverlayKey(false),
            this
        );
        this.#settings.connectObject(
            'changed::ripple-box',
            () => this.#applyRippleBox(false),
            this
        );
        this.#settings.connectObject(
            'changed::startup-status',
            () => this.#applyStartupStatus(false),
            this
        );
        this.#settings.connectObject(
            'changed::controls-manager-spacing-size',
            () => this.#applyControlsManagerSpacingSize(false),
            this
        );
        this.#signalIds = [];
    }

    #disconnectSignals() {
        this.#settings.disconnectObject(this);
    }

    #applyAll() {
        console.log('[workspace-control] applyAll');
        this.#applyWorkspace(false);
        this.#applyWorkspacePopup(false);
        this.#applyWorkspaceSwitcherSize(false);
        this.#applyWorkspaceSwitcherShouldShow(false);
        this.#applyWorkspaceWrapAround(false);
        this.#applyWorkspacePeek(false);
        this.#applyWorkspacesInAppGrid(false);
        this.#applyWorkspaceBackgroundCornerSize(false);
        this.#applyWorkspaceThumbnailToMainView(false);
        this.#applyOverlayKey(false);
        this.#applyRippleBox(false);
        this.#applyStartupStatus(false);
        this.#applyControlsManagerSpacingSize(false);
    }

    #revertAll() {
        this.#applyWorkspace(true);
        this.#applyWorkspacePopup(true);
        this.#applyWorkspaceSwitcherSize(true);
        this.#applyWorkspaceSwitcherShouldShow(true);
        this.#applyWorkspaceWrapAround(true);
        this.#applyWorkspacePeek(true);
        this.#applyWorkspacesInAppGrid(true);
        this.#applyWorkspaceBackgroundCornerSize(true);
        this.#applyWorkspaceThumbnailToMainView(true);
        this.#applyOverlayKey(true);
        this.#applyRippleBox(true);
        this.#applyStartupStatus(true);
        this.#applyControlsManagerSpacingSize(true);
    }

    #api() {
        return this.#jpApi;
    }

    #applyWorkspace(forceOriginal) {
        const api = this.#api();
        if (!api) return;
        if (forceOriginal || this.#settings.get_boolean('workspace'))
            api.workspaceSwitcherShow();
        else
            api.workspaceSwitcherHide();
    }

    #applyWorkspacePopup(forceOriginal) {
        const api = this.#api();
        if (!api) return;
        if (forceOriginal || this.#settings.get_boolean('workspace-popup'))
            api.workspacePopupEnable();
        else
            api.workspacePopupDisable();
    }

    #applyWorkspaceSwitcherSize(forceOriginal) {
        const api = this.#api();
        if (!api) return;
        let size = this.#settings.get_int('workspace-switcher-size');
        if (forceOriginal || size === 0)
            api.workspaceSwitcherSetDefaultSize();
        else
            api.workspaceSwitcherSetSize(size / 100);
    }

    #applyWorkspaceSwitcherShouldShow(forceOriginal) {
        const api = this.#api();
        if (!api) return;
        let shouldShow = this.#settings.get_boolean('workspace-switcher-should-show');
        if (forceOriginal || !shouldShow)
            api.workspaceSwitcherShouldShowSetDefault();
        else
            api.workspaceSwitcherShouldShow(true);
    }

    #applyWorkspaceWrapAround(forceOriginal) {
        const api = this.#api();
        if (!api) return;
        let status = this.#settings.get_boolean('workspace-wrap-around');
        if (forceOriginal || !status)
            api.workspaceWraparoundDisable();
        else
            api.workspaceWraparoundEnable();
    }

    #applyWorkspacePeek(forceOriginal) {
        const api = this.#api();
        if (!api) return;
        if (forceOriginal || this.#settings.get_boolean('workspace-peek'))
            api.workspacesViewSpacingSetDefault();
        else
            api.workspacesViewSpacingSizeSet(400);
    }

    #applyWorkspacesInAppGrid(forceOriginal) {
        const api = this.#api();
        if (!api) return;
        let status = this.#settings.get_boolean('workspaces-in-app-grid');
        if (forceOriginal || status)
            api.workspacesInAppGridEnable();
        else
            api.workspacesInAppGridDisable();
    }

    #applyWorkspaceBackgroundCornerSize(forceOriginal) {
        const api = this.#api();
        if (!api) return;
        let size = this.#settings.get_int('workspace-background-corner-size');
        if (forceOriginal || size === 0)
            api.workspaceBackgroundRadiusSetDefault();
        else
            api.workspaceBackgroundRadiusSet(size - 1);
    }

    #applyWorkspaceThumbnailToMainView(forceOriginal) {
        const api = this.#api();
        if (!api) return;
        if (forceOriginal || !this.#settings.get_boolean('workspace-thumbnail-to-main-view'))
            api.workspaceThumbnailClickToDefault();
        else
            api.workspaceThumbnailClickToMainView();
    }

    #applyOverlayKey(forceOriginal) {
        const api = this.#api();
        if (!api) return;
        let overlayKey = this.#settings.get_boolean('overlay-key');
        let doubleSuper = this.#settings.get_boolean('double-super-to-appgrid');
        if (forceOriginal) {
            api.doubleSuperToAppGridEnable();
            api.unblockOverlayKey();
        } else if (!overlayKey) {
            api.doubleSuperToAppGridEnable();
            api.blockOverlayKey();
        } else {
            api.unblockOverlayKey();
            if (doubleSuper)
                api.doubleSuperToAppGridEnable();
            else
                api.doubleSuperToAppGridDisable();
        }
    }

    #applyRippleBox(forceOriginal) {
        const api = this.#api();
        if (!api) return;
        let status = this.#settings.get_boolean('ripple-box');
        if (forceOriginal || status)
            api.rippleBoxEnable();
        else
            api.rippleBoxDisable();
    }

    #applyStartupStatus(forceOriginal) {
        const api = this.#api();
        if (!api) return;
        let status = this.#settings.get_int('startup-status');
        if (forceOriginal)
            api.startupStatusSetDefault();
        else
            api.startupStatusSet(status);
    }

    #applyControlsManagerSpacingSize(forceOriginal) {
        const api = this.#api();
        if (!api) return;
        let size = this.#settings.get_int('controls-manager-spacing-size');
        if (forceOriginal || size === 0)
            api.controlsManagerSpacingSetDefault();
        else
            api.controlsManagerSpacingSizeSet(size);
    }
}
