/**
 * API Library
 *
 * @author     Javad Rahmatzadeh <j.rahmatzadeh@gmail.com>
 * @copyright  2020-2026
 * @license    GPL-3.0-only
 */

const XY_POSITION = {
    TOP_START: 0,
    TOP_CENTER: 1,
    TOP_END: 2,
    BOTTOM_START: 3,
    BOTTOM_CENTER: 4,
    BOTTOM_END: 5,
    CENTER_START: 6,
    CENTER_CENTER: 7,
    CENTER_END: 8,
};

const PANEL_POSITION = {
    TOP: 0,
    BOTTOM: 1,
};

const PANEL_BOX_POSITION = {
    CENTER: 0,
    RIGHT: 1,
    LEFT: 2,
};

const PANEL_HIDE_MODE = {
    ALL: 0,
    DESKTOP: 1,
};

const SHELL_STATUS = {
    NONE: 0,
    OVERVIEW: 1,
};

const DASH_ICON_SIZES = [16, 22, 24, 32, 40, 48, 56, 64];

/**
 * API to avoid calling GNOME Shell directly
 * and make all parts compatible with different GNOME Shell versions
 */
export class API
{
    /**
     * Current shell version
     *
     * @type {number|null}
     */
    #shellVersion = null;

    /**
     * Originals holder
     *
     * @type {object}
     */
    #originals = {};

    /**
     * Timeout ids
     *
     * @type {object}
     */
    #timeoutIds = {};

    /**
     * Class Constructor
     *
     * @param {Object} dependencies
     *   'Main' reference to ui.main
     *   'BackgroundMenu' reference to ui.backgroundMenu
     *   'OverviewControls' reference to ui.overviewControls
     *   'WorkspaceSwitcherPopup' reference to ui.workspaceSwitcherPopup
     *   'SwitcherPopup' reference to ui.switcherPopup
     *   'InterfaceSettings' reference to Gio.Settings for 'org.gnome.desktop.interface'
     *   'Search' reference to ui.search
     *   'SearchController' reference to ui.searchController
     *   'WorkspaceThumbnail' reference to ui.workspaceThumbnail
     *   'WorkspacesView' reference to ui.workspacesView
     *   'Panel' reference to ui.panel
     *   'PanelMenu' reference to ui.panelMenu
     *   'WindowPreview' reference to ui.windowPreview
     *   'Workspace' reference to ui.workspace
     *   'LookingGlass' reference to ui.lookingGlass
     *   'MessageTray' reference to ui.messageTray
     *   'OSDWindow' reference to ui.osdTray
     *   'WindowMenu' reference to ui.windowMenu
     *   'AltTab' reference to ui.altTab
     *   'St' reference to St
     *   'GLib' reference to GLib
     *   'Clutter' reference to Clutter
     *   'Util' reference to misc.util
     *   'Meta' reference to Meta
     *   'GObject' reference to GObject
     * @param {number} shellVersion - float in major.minor format
     */
    constructor(dependencies, shellVersion)
    {
        this._main = dependencies['Main'] || null;
        this._backgroundMenu = dependencies['BackgroundMenu'] || null;
        this._overviewControls = dependencies['OverviewControls'] || null;
        this._workspaceSwitcherPopup = dependencies['WorkspaceSwitcherPopup'] || null;
        this._switcherPopup = dependencies['SwitcherPopup'] || null;
        this._interfaceSettings = dependencies['InterfaceSettings'] || null;
        this._search = dependencies['Search'] || null;
        this._searchController = dependencies['SearchController'] || null;
        this._workspaceThumbnail = dependencies['WorkspaceThumbnail'] || null;
        this._workspacesView = dependencies['WorkspacesView'] || null;
        this._panel = dependencies['Panel'] || null;
        this._panelMenu = dependencies['PanelMenu'] || null;
        this._windowPreview = dependencies['WindowPreview'] || null;
        this._workspace = dependencies['Workspace'] || null;
        this._lookingGlass = dependencies['LookingGlass'] || null;
        this._messageTray = dependencies['MessageTray'] || null;
        this._osdWindow = dependencies['OSDWindow'] || null;
        this._windowMenu = dependencies['WindowMenu'] || null;
        this._altTab = dependencies['AltTab'] || null;
        this._st = dependencies['St'] || null;
        this._glib = dependencies['GLib'] || null;
        this._clutter = dependencies['Clutter'] || null;
        this._util = dependencies['Util'] || null;
        this._meta = dependencies['Meta'] || null;
        this._gobject = dependencies['GObject'] || null;

        this.#shellVersion = shellVersion;

        /**
         * whether search entry is visible
         *
         * @member {boolean}
         */
        this._searchEntryVisibility = true;
    }

    /**
     * prepare everything needed for API
     *
     * @returns {void}
     */
    open()
    {
        this.UIStyleClassAdd(this.#getAPIClassname('shell-version'));

        // Getting the looking glass instance before having primary monitor
        // can cause fatal error. So we wait for primary monitor
        // until it is available
        // Fixes #166
        this.#timeoutIds.registerLookingGlassSignals = this._glib.timeout_add(
            this._glib.PRIORITY_DEFAULT,
            1000,
            () => {
                let pMonitor = this._main.layoutManager.primaryMonitor;

                if (!pMonitor) {
                    return this._glib.SOURCE_CONTINUE;
                }

                this.#registerLookingGlassSignals();

                this.#timeoutIds.registerLookingGlassSignals = null;

                return this._glib.SOURCE_REMOVE;
            }
        );
    }

    /**
     * remove everything from GNOME Shell been added by this class
     *
     * @returns {void}
     */
    close()
    {
        for (let [name, id] of Object.entries(this.#timeoutIds)) {
            if (id) {
                this._glib.source_remove(id);
            }
            delete(this.#timeoutIds[name]);
        }

        this.UIStyleClassRemove(this.#getAPIClassname('shell-version'));
        this.#startSearchSignal(false);
        this.#computeWorkspacesBoxForStateSetDefault();
        this.#altTabSizesSetDefault();
        this.#unregisterLookingGlassSignals();
        this.#stopAllOnQuickSettingsPropertyCalls();
    }

    /**
     * get x and y align for position
     *
     * @param int pos position
     *   see XY_POSITION
     *
     * @returns {array}
     *  - 0 Clutter.ActorAlign
     *  - 1 Clutter.ActorAlign
     */
    #xyAlignGet(pos)
    {
        if (XY_POSITION.TOP_START === pos) {
            return [this._clutter.ActorAlign.START, this._clutter.ActorAlign.START];
        }

        if (XY_POSITION.TOP_CENTER === pos) {
            return [this._clutter.ActorAlign.CENTER, this._clutter.ActorAlign.START];
        }

        if (XY_POSITION.TOP_END === pos) {
            return [this._clutter.ActorAlign.END, this._clutter.ActorAlign.START];
        }

        if (XY_POSITION.CENTER_START === pos) {
            return [this._clutter.ActorAlign.START, this._clutter.ActorAlign.CENTER];
        }

        if (XY_POSITION.CENTER_CENTER === pos) {
            return [this._clutter.ActorAlign.CENTER, this._clutter.ActorAlign.CENTER];
        }

        if (XY_POSITION.CENTER_END === pos) {
            return [this._clutter.ActorAlign.END, this._clutter.ActorAlign.CENTER];
        }

        if (XY_POSITION.BOTTOM_START === pos) {
            return [this._clutter.ActorAlign.START, this._clutter.ActorAlign.END];
        }

        if (XY_POSITION.BOTTOM_CENTER === pos) {
            return [this._clutter.ActorAlign.CENTER, this._clutter.ActorAlign.END];
        }

        if (XY_POSITION.BOTTOM_END === pos) {
            return [this._clutter.ActorAlign.END, this._clutter.ActorAlign.END];
        }
    }

    #getSignalId(widget, signalName)
    {
        return this._gobject.signal_handler_find(widget, {signalId: signalName});
    }

    /**
     * get the css class name for API
     *
     * @param {string} type
     *
     * @returns {string}
     */
    #getAPIClassname(type)
    {
        let starter = 'just-perfection-api-';

        if (type === 'shell-version') {
            let shellVerMajor = Math.trunc(this.#shellVersion);
            return `${starter}gnome${shellVerMajor}`;
        }

        return `${starter}${type}`;
    }

    #startSearchSignal(add)
    {
        let controller
        = this._main.overview.viewSelector ||
          this._main.overview._overview.viewSelector ||
          this._main.overview._overview.controls._searchController;

        // remove
        if (!add) {
            if (this._searchActiveSignal) {
                controller.disconnect(this._searchActiveSignal);
                this._searchActiveSignal = null;
            }
            return;
        }

        // add
        if (this._searchActiveSignal) {
            return;
        }

        this._searchActiveSignal = controller.connect('notify::search-active', () => {
            if (this._searchEntryVisibility) {
                return;
            }

            let inSearch = controller.searchActive;

            if (inSearch) {
                this.UIStyleClassAdd(this.#getAPIClassname('type-to-search'));
                this.searchEntryShow(true);
            } else {
                this.UIStyleClassRemove(this.#getAPIClassname('type-to-search'));
                this.searchEntryHide(true);
            }
        });
    }

    OSDEnable()
    {
        if (!this.#originals['osdWindowManagerShow']) {
            return;
        }

        this._main.osdWindowManager.show = this.#originals['osdWindowManagerShow'];
        this._main.osdWindowManager.showOne = this.#originals['osdWindowManagerShowOne'];
        this._main.osdWindowManager.showAll = this.#originals['osdWindowManagerShowAll'];
    }

    /**
     * disable OSD
     *
     * @returns {void}
     */
    OSDDisable()
    {
        if (!this.#originals['osdWindowManagerShow']) {
            this.#originals['osdWindowManagerShow']
            = this._main.osdWindowManager.show;
        }

        if (this.#shellVersion >= 49 && !this.#originals['osdWindowManagerShowOne']) {
            this.#originals['osdWindowManagerShowOne']
            = this._main.osdWindowManager.showOne;
        }

        if (this.#shellVersion >= 49 && !this.#originals['osdWindowManagerShowAll']) {
            this.#originals['osdWindowManagerShowAll']
            = this._main.osdWindowManager.showAll;
        }

        this._main.osdWindowManager.show = () => {};
        this._main.osdWindowManager.showOne = () => {};
        this._main.osdWindowManager.showAll = () => {};
    }

    /**
     * enable workspace popup
     *
     * @returns {void}
     */
    workspacePopupEnable()
    {
        if (!this.#originals['workspaceSwitcherPopupDisplay']) {
            return;
        }

        this._workspaceSwitcherPopup.WorkspaceSwitcherPopup.prototype.display
        = this.#originals['workspaceSwitcherPopupDisplay']
    }

    /**
     * disable workspace popup
     *
     * @returns {void}
     */
    workspacePopupDisable()
    {
        if (!this.#originals['workspaceSwitcherPopupDisplay']) {
            this.#originals['workspaceSwitcherPopupDisplay']
            = this._workspaceSwitcherPopup.WorkspaceSwitcherPopup.prototype.display;
        }

        this._workspaceSwitcherPopup.WorkspaceSwitcherPopup.prototype.display = function (index) {
           this.destroy();
        };
    }

    /**
     * show workspace switcher
     *
     * @returns {void}
     */
    workspaceSwitcherShow()
    {
        this.UIStyleClassRemove(this.#getAPIClassname('no-workspace'));

        this.#workspaceSwitcherShouldShowSetToLast();
    }

    /**
     * hide workspace switcher
     *
     * @returns {void}
     */
    workspaceSwitcherHide()
    {
        this.workspaceSwitcherShouldShow(false, true);

        // should be after `this.workspaceSwitcherShouldShow()`
        // since it checks whether it's visible or not
        this.UIStyleClassAdd(this.#getAPIClassname('no-workspace'));
    }

    /**
     * check whether workspace switcher is visible
     *
     * @returns {boolean}
     */
    isWorkspaceSwitcherVisible()
    {
        return !this.UIStyleClassContain(this.#getAPIClassname('no-workspace'));
    }

    /**
     * set workspace switcher to its default size
     *
     * @returns {void}
     */
    workspaceSwitcherSetDefaultSize()
    {
        let thumbnailsBox = this._main.overview._overview._controls._thumbnailsBox;
        let ThumbnailsBoxProto = this._workspaceThumbnail.ThumbnailsBox.prototype;

        if (!ThumbnailsBoxProto._initOld) {
            return;
        }

        ThumbnailsBoxProto._init = ThumbnailsBoxProto._initOld;
        delete(ThumbnailsBoxProto._initOld);

        thumbnailsBox._maxThumbnailScale = this._workspaceThumbnail.MAX_THUMBNAIL_SCALE;
    }

    /**
     * set workspace switcher size
     *
     * @param {number} size in float
     *
     * @returns {void}
     */
    workspaceSwitcherSetSize(size)
    {
        let thumbnailsBox = this._main.overview._overview._controls._thumbnailsBox;
        let ThumbnailsBoxProto = this._workspaceThumbnail.ThumbnailsBox.prototype;

        thumbnailsBox._maxThumbnailScale = size;

        if (!ThumbnailsBoxProto._initOld) {
            ThumbnailsBoxProto._initOld = ThumbnailsBoxProto._init;
        }

        ThumbnailsBoxProto._init = function(...params) {
            this._maxThumbnailScale = size;
            this._initOld(...params);
        };
    }

    /**
     * use default behavior for the workspace thumbnail click
     *
     * @returns {void}
     */
    workspaceThumbnailClickToDefault()
    {
        if (this.#originals['WorkspaceThumbnailActivate'] === undefined) {
            return;
        }

        let WorkspaceThumbnailProto = this._workspaceThumbnail.WorkspaceThumbnail.prototype;

        WorkspaceThumbnailProto.activate = this.#originals['WorkspaceThumbnailActivate'];

        delete(this.#originals['WorkspaceThumbnailActivate']);
    }

    /**
     * workspace thumbnail click always goes to the main view
     * instead of just changing the workspace
     *
     * @returns {void}
     */
    workspaceThumbnailClickToMainView()
    {
        if (this.#originals['WorkspaceThumbnailActivate']) {
            return;
        }

        let WorkspaceThumbnailProto = this._workspaceThumbnail.WorkspaceThumbnail.prototype;

        this.#originals['WorkspaceThumbnailActivate'] = WorkspaceThumbnailProto.activate;

        const Main = this._main;
        const ThumbnailState = this._workspaceThumbnail.ThumbnailState;

        WorkspaceThumbnailProto.activate = function (time) {
            if (this.state > ThumbnailState.NORMAL) {
                return;
            }
            if (!this.metaWorkspace.active) {
                this.metaWorkspace.activate(time);
            }
            Main.overview.hide();
        };
    }

    /**
     * enable window picker icon
     *
     * @returns {void}
     */
    windowPickerIconEnable()
    {
        this.UIStyleClassRemove(this.#getAPIClassname('no-window-picker-icon'));
    }

    /**
     * disable window picker icon
     *
     * @returns {void}
     */
    windowPickerIconDisable()
    {
        this.UIStyleClassAdd(this.#getAPIClassname('no-window-picker-icon'));
    }

    monitorGetInfo()
    {
        let pMonitor = this._main.layoutManager.primaryMonitor;

        if (!pMonitor) {
            return false;
        }

        return {
            'x': pMonitor.x,
            'y': pMonitor.y,
            'width': pMonitor.width,
            'height': pMonitor.height,
            'geometryScale': pMonitor.geometry_scale,
        };
    }

    animationSpeedSetDefault()
    {
        if (this.#originals['StSlowDownFactor'] === undefined) {
            return;
        }

        this._st.Settings.get().slow_down_factor = this.#originals['StSlowDownFactor'];
    }

    /**
     * change animation speed
     *
     * @param {number} factor in float. bigger number means slower
     *
     * @returns {void}
     */
    animationSpeedSet(factor)
    {
        if (this.#originals['StSlowDownFactor'] === undefined) {
            this.#originals['StSlowDownFactor']
            = this._st.Settings.get().slow_down_factor;
        }

        this._st.Settings.get().slow_down_factor = factor;
    }

    /**
     * enable focus when window demands attention happens
     *
     * @returns {void}
     */
    windowDemandsAttentionFocusEnable()
    {
        if (
            this._displayWindowDemandsAttentionSignal ||
            this._displayWindowMarkedUrgentSignal
        ) {
            return;
        }

        let display = global.display;

        let demandFunction = (display, window) => {
            if (!window || window.has_focus() || window.is_skip_taskbar()) {
                return;
            }
            this._main.activateWindow(window);
        };

        this._displayWindowDemandsAttentionSignal
        = display.connect('window-demands-attention', demandFunction);
        this._displayWindowMarkedUrgentSignal
        = display.connect('window-marked-urgent', demandFunction);

        // since removing '_windowDemandsAttentionId' doesn't have any effect
        // we remove the original signal and re-connect it on disable
        let signalId = this.#getSignalId(global.display, 'window-demands-attention');
        let signalId2 = this.#getSignalId(global.display, 'window-marked-urgent');
        display.disconnect(signalId);
        display.disconnect(signalId2);
    }

    /**
     * disable focus when window demands attention happens
     *
     * @returns {void}
     */
    windowDemandsAttentionFocusDisable()
    {
        if (
            !this._displayWindowDemandsAttentionSignal ||
            !this._displayWindowMarkedUrgentSignal
        ) {
            return;
        }

        let display = global.display;

        display.disconnect(this._displayWindowDemandsAttentionSignal);
        display.disconnect(this._displayWindowMarkedUrgentSignal);
        this._displayWindowDemandsAttentionSignal = null;
        this._displayWindowMarkedUrgentSignal = null;

        let wah = this._main.windowAttentionHandler;
        wah._windowDemandsAttentionId = display.connect(
            'window-demands-attention',
            wah._onWindowDemandsAttention.bind(wah)
        );
        wah._windowDemandsAttentionId = display.connect(
            'window-marked-urgent',
            wah._onWindowDemandsAttention.bind(wah)
        );
    }

    /**
     * enable maximizing windows on creation
     *
     * @returns {void}
     */
    windowMaximizedOnCreateEnable()
    {
        if (this._displayWindowCreatedSignal) {
            return;
        }

        this._displayWindowCreatedSignal = global.display.connect(
            'window-created',
            (display, window) => {
                if (!window.can_maximize()) {
                    return;
                }
                if (this.#shellVersion >= 49) {
                    window.maximize();
                } else {
                    window.maximize(this._meta.MaximizeFlags.HORIZONTAL | this._meta.MaximizeFlags.VERTICAL);
                }
            }
        );
    }

    /**
     * disable maximizing windows on creation
     *
     * @returns {void}
     */
    windowMaximizedOnCreateDisable()
    {
        if (!this._displayWindowCreatedSignal) {
            return;
        }

        global.display.disconnect(this._displayWindowCreatedSignal);
        delete(this._displayWindowCreatedSignal);
    }

    /**
     * set startup status
     *
     * @param {number} status see SHELL_STATUS for available status
     *
     * @returns {void}
     */
    startupStatusSet(status)
    {
        let sessionMode = this._main.sessionMode;
        let layoutManager = this._main.layoutManager;

        if (!layoutManager._startingUp) {
            return;
        }

        if (this.#originals['sessionModeHasOverview'] === undefined) {
            this.#originals['sessionModeHasOverview'] = sessionMode.hasOverview;
        }

        let ControlsState = this._overviewControls.ControlsState;
        let Controls = this._main.overview._overview.controls;

        switch (status) {

            case SHELL_STATUS.NONE:
                sessionMode.hasOverview = false;
                layoutManager.startInOverview = false;
                Controls._stateAdjustment.value = ControlsState.HIDDEN;
                break;

            case SHELL_STATUS.OVERVIEW:
            default:
                sessionMode.hasOverview = true;
                layoutManager.startInOverview = true;
                break;
        }

        if (!this._startupCompleteSignal) {
            this._startupCompleteSignal
            = layoutManager.connect('startup-complete', () => {
                sessionMode.hasOverview = this.#originals['sessionModeHasOverview'];
            });
        }
    }

    /**
     * set startup status to default
     *
     * @returns {void}
     */
    startupStatusSetDefault()
    {
        if (this.#originals['sessionModeHasOverview'] === undefined) {
            return;
        }

        if (this._startupCompleteSignal) {
            this._main.layoutManager.disconnect(this._startupCompleteSignal);
        }
    }

    #computeWorkspacesBoxForStateChanged()
    {
        let controlsLayout = this._main.overview._overview._controls.layout_manager;

        if (!this.#originals['computeWorkspacesBoxForState']) {
            this.#originals['computeWorkspacesBoxForState']
            = controlsLayout._computeWorkspacesBoxForState;
        }

        controlsLayout._computeWorkspacesBoxForState = (state, box, searchHeight, ...args) => {

            let inAppGrid = state === this._overviewControls.ControlsState.APP_GRID;

            if (inAppGrid && !this._searchEntryVisibility) {
                // We need some spacing on top of workspace box in app grid
                // when the search entry is not visible.
                searchHeight = 40;
            }

            box = this.#originals['computeWorkspacesBoxForState'].call(
                controlsLayout, state, box, searchHeight, ...args);

            if (inAppGrid && this._workspacesInAppGridHeight !== undefined) {
                box.set_size(
                    box.get_width(),
                    this._workspacesInAppGridHeight
                );
            }

            return box;
        };

        // Since workspace background has shadow around it, it can cause
        // unwanted shadows in app grid when the workspace height is 0.
        // so we are removing the shadow when we are in app grid
        // but first, we need to remove the already connected signals
        // since this function can be called in different situations
        // (ie. workspace app grid, search visibility)
        let showAppsButton = this._main.overview.dash.showAppsButton;
        let classname = this.#getAPIClassname('no-workspaces-in-app-grid');
        if (this._appButtonForComputeWorkspacesSignal) {
            showAppsButton.disconnect(this._appButtonForComputeWorkspacesSignal);
            this.UIStyleClassRemove(classname);
        }

        if (!this.#isWorkspacesInAppGridEnabled()) {
            this._appButtonForComputeWorkspacesSignal =
            showAppsButton.connect(
                'notify::checked',
                () => {
                    if (showAppsButton.checked) {
                        this.UIStyleClassAdd(classname);
                    } else {
                        this.UIStyleClassRemove(classname);
                    }
                }
            );
        }
    }

    /**
     * change ControlsManagerLayout._computeWorkspacesBoxForState to its default
     *
     * @returns {void}
     */
    #computeWorkspacesBoxForStateSetDefault()
    {
        if (!this.#originals['computeWorkspacesBoxForState']) {
            return;
        }

        let controlsLayout = this._main.overview._overview._controls.layout_manager;

        controlsLayout._computeWorkspacesBoxForState
        = this.#originals['computeWorkspacesBoxForState'];

        if (this._appButtonForComputeWorkspacesSignal) {
            let showAppsButton = this._main.overview.dash.showAppsButton;
            showAppsButton.disconnect(this._appButtonForComputeWorkspacesSignal);
            delete(this._appButtonForComputeWorkspacesSignal);
            this.UIStyleClassRemove(this.#getAPIClassname('no-workspaces-in-app-grid'));
        }
    }

    /**
     * disable workspaces in app grid
     *
     * @returns {void}
     */
    workspacesInAppGridDisable()
    {
        this._workspacesInAppGridHeight = 0;

        this._workspacesInAppGrid = false;

        this.#computeWorkspacesBoxForStateChanged();
    }

    /**
     * enable workspaces in app grid
     *
     * @returns {void}
     */
    workspacesInAppGridEnable()
    {
        if (this._workspacesInAppGridHeight === undefined) {
            return;
        }

        this._workspacesInAppGrid = true;

        delete(this._workspacesInAppGridHeight);
        this.#computeWorkspacesBoxForStateChanged();
    }

    /**
     * check whether the workspaces in app grid is enabled
     *
     * @returns {boolean}
     */
    #isWorkspacesInAppGridEnabled()
    {
        return this._workspacesInAppGrid === undefined || this._workspacesInAppGrid;
    }
    /**
     * set the workspace switcher to always/never show
     *
     * @param {boolean} show true for always show, false for never show
     * @param {boolean} fake true means set the current should show status
     *
     * @returns {void}
     */
    workspaceSwitcherShouldShow(shouldShow = true, fake = false)
    {
        if (!fake) {
            this._shouldShow = shouldShow;
        }

        if (!this.isWorkspaceSwitcherVisible()) {
            return;
        }

        let ThumbnailsBoxProto = this._workspaceThumbnail.ThumbnailsBox.prototype;

        if (!this.#originals['updateShouldShow']) {
            this.#originals['updateShouldShow'] = ThumbnailsBoxProto._updateShouldShow;
        }

        ThumbnailsBoxProto._updateShouldShow = function () {
            if (this._shouldShow === shouldShow) {
                return;
            }
            this._shouldShow = shouldShow;
            this.notify('should-show');
        };
    }

    /**
     * set the always show workspace switcher status to last real status
     *
     * @returns {void}
     */
    #workspaceSwitcherShouldShowSetToLast()
    {
        if (this._shouldShow === undefined) {
            this.workspaceSwitcherShouldShowSetDefault();
            return;
        }

        this.workspaceSwitcherShouldShow(this._shouldShow);
    }

    /**
     * set the always show workspace switcher status to default
     *
     * @returns {void}
     */
    workspaceSwitcherShouldShowSetDefault()
    {
        if (!this.#originals['updateShouldShow'] || !this.isWorkspaceSwitcherVisible()) {
            return;
        }

        let ThumbnailsBoxProto = this._workspaceThumbnail.ThumbnailsBox.prototype;
        ThumbnailsBoxProto._updateShouldShow = this.#originals['updateShouldShow'];
        delete(this.#originals['updateShouldShow']);
        delete(this._shouldShow);
    }

    workspaceBackgroundRadiusSetDefault()
    {
        if (this._workspaceBackgroundRadiusSize === undefined) {
            return;
        }

        let workspaceBackgroundProto = this._workspace.WorkspaceBackground.prototype;

        workspaceBackgroundProto._updateBorderRadius
        = this.#originals['workspaceBackgroundUpdateBorderRadius'];

        let classnameStarter = this.#getAPIClassname('workspace-background-radius-size');
        this.UIStyleClassRemove(classnameStarter + this._workspaceBackgroundRadiusSize);

        delete this._workspaceBackgroundRadiusSize;
    }

    /**
     * set workspace background border radius size
     *
     * @param {number} size in pixels (0 - 60)
     *
     * @returns {void}
     */
    workspaceBackgroundRadiusSet(size)
    {
        if (size < 0 || size > 60) {
            return;
        }

        this.workspaceBackgroundRadiusSetDefault();

        let workspaceBackgroundProto = this._workspace.WorkspaceBackground.prototype;

        if (!this.#originals['workspaceBackgroundUpdateBorderRadius']) {
            this.#originals['workspaceBackgroundUpdateBorderRadius']
            = workspaceBackgroundProto._updateBorderRadius;
        }

        const Util = this._util;
        const St = this._st;

        workspaceBackgroundProto._updateBorderRadius = function () {
            const {scaleFactor} = St.ThemeContext.get_for_stage(global.stage);
            const cornerRadius = scaleFactor * size;

            const backgroundContent = this._bgManager.backgroundActor.content;
            backgroundContent.rounded_clip_radius =
                Util.lerp(0, cornerRadius, this._stateAdjustment.value);
        }

        this._workspaceBackgroundRadiusSize = size;

        let classnameStarter = this.#getAPIClassname('workspace-background-radius-size');
        this.UIStyleClassAdd(classnameStarter + size);
    }

    /**
     * enable workspace wraparound
     *
     * @returns {void}
     */
    workspaceWraparoundEnable()
    {
        let metaWorkspaceProto = this._meta.Workspace.prototype;

        if (!this.#originals['metaWorkspaceGetNeighbor']) {
            this.#originals['metaWorkspaceGetNeighbor']
            = metaWorkspaceProto.get_neighbor;
        }

        const Meta = this._meta;

        metaWorkspaceProto.get_neighbor = function (dir) {

            let index = this.index();
            let lastIndex = global.workspace_manager.n_workspaces - 1;
            let neighborIndex;

            if (dir === Meta.MotionDirection.UP || dir === Meta.MotionDirection.LEFT) {
                // prev
                neighborIndex = (index > 0) ? index - 1 : lastIndex;
            } else {
                // next
                neighborIndex = (index < lastIndex) ? index + 1 : 0;
            }

            return global.workspace_manager.get_workspace_by_index(neighborIndex);
        };
    }

    /**
     * disable workspace wraparound
     *
     * @returns {void}
     */
    workspaceWraparoundDisable()
    {
        if (!this.#originals['metaWorkspaceGetNeighbor']) {
            return;
        }

        let metaWorkspaceProto = this._meta.Workspace.prototype;
        metaWorkspaceProto.get_neighbor = this.#originals['metaWorkspaceGetNeighbor'];
    }

    rippleBoxEnable()
    {
        this.UIStyleClassRemove(this.#getAPIClassname('no-ripple-box'));
    }

    /**
     * disable ripple box
     *
     * @returns {void}
     */
    rippleBoxDisable()
    {
        this.UIStyleClassAdd(this.#getAPIClassname('no-ripple-box'));
    }

    /**
     * unblock overlay key
     *
     * @returns {void}
     */
    unblockOverlayKey()
    {
        if (!this._overlayKeyOldSignalId) {
            return;
        }

        this._gobject.signal_handler_unblock(
            global.display,
            this._overlayKeyOldSignalId
        );

        delete(this._overlayKeyOldSignalId);
    }

    /**
     * block overlay key
     *
     * @returns {void}
     */
    blockOverlayKey()
    {
        this._overlayKeyOldSignalId = this.#getSignalId(global.display, 'overlay-key');

        if (!this._overlayKeyOldSignalId) {
            return;
        }

        this._gobject.signal_handler_block(global.display, this._overlayKeyOldSignalId);
    }

    /**
     * enable double super press to toggle app grid
     *
     * @returns {void}
     */
    doubleSuperToAppGridEnable()
    {
        if (this._isDoubleSuperToAppGrid === true) {
            return;
        }

        if (!this._overlayKeyNewSignalId) {
            return;
        }

        global.display.disconnect(this._overlayKeyNewSignalId);
        delete(this._overlayKeyNewSignalId);
        this.unblockOverlayKey();

        this._isDoubleSuperToAppGrid = true;
    }

    /**
     * disable double super press to toggle app grid
     *
     * @returns {void}
     */
    doubleSuperToAppGridDisable()
    {
        if (this._isDoubleSuperToAppGrid === false) {
            return;
        }

        this.blockOverlayKey();

        this._overlayKeyNewSignalId = global.display.connect('overlay-key', () => {
            this._main.overview.toggle();
        });

        this._isDoubleSuperToAppGrid = false;
    }

    osdPositionSetDefault()
    {
        if (!this.#originals['osdWindowShow']) {
            return;
        }

        let osdWindowProto = this._osdWindow.OsdWindow.prototype;

        osdWindowProto.show = this.#originals['osdWindowShow'];

        delete(osdWindowProto._oldShow);
        delete(this.#originals['osdWindowShow']);

        if (
            this.#originals['osdWindowXAlign'] !== undefined &&
            this.#originals['osdWindowYAlign'] !== undefined
        ) {
            let osdWindows = this._main.osdWindowManager._osdWindows;
            osdWindows.forEach(osdWindow => {
                osdWindow.x_align = this.#originals['osdWindowXAlign'];
                osdWindow.y_align = this.#originals['osdWindowYAlign'];
            });
            delete(this.#originals['osdWindowXAlign']);
            delete(this.#originals['osdWindowYAlign']);
        }

        this.UIStyleClassRemove(this.#getAPIClassname('osd-position-top'));
        this.UIStyleClassRemove(this.#getAPIClassname('osd-position-bottom'));
        this.UIStyleClassRemove(this.#getAPIClassname('osd-position-center'));
    }

    /**
     * set OSD position
     *
     * @param int pos position XY_POSITION
     *
     * @returns {void}
     */
    osdPositionSet(pos)
    {
        let osdWindowProto = this._osdWindow.OsdWindow.prototype;

        if (!this.#originals['osdWindowShow']) {
            this.#originals['osdWindowShow'] = osdWindowProto.show;
        }

        if (
            this.#originals['osdWindowXAlign'] === undefined ||
            this.#originals['osdWindowYAlign'] === undefined
        ) {
            let osdWindows = this._main.osdWindowManager._osdWindows;
            this.#originals['osdWindowXAlign'] = osdWindows[0].x_align;
            this.#originals['osdWindowYAlign'] = osdWindows[0].y_align;
        }

        if (osdWindowProto._oldShow === undefined) {
            osdWindowProto._oldShow = this.#originals['osdWindowShow'];
        }

        let [xAlign, yAlign] = this.#xyAlignGet(pos);
        osdWindowProto.show = function () {
            this.x_align = xAlign;
            this.y_align = yAlign;
            this._oldShow();
        };

        if (
            pos === XY_POSITION.TOP_START ||
            pos === XY_POSITION.TOP_CENTER ||
            pos === XY_POSITION.TOP_END
        ) {
            this.UIStyleClassAdd(this.#getAPIClassname('osd-position-top'));
        }

        if (
            pos === XY_POSITION.BOTTOM_START ||
            pos === XY_POSITION.BOTTOM_CENTER ||
            pos === XY_POSITION.BOTTOM_END
        ) {
            this.UIStyleClassAdd(this.#getAPIClassname('osd-position-bottom'));
        }

        if (
            pos === XY_POSITION.CENTER_START ||
            pos === XY_POSITION.CENTER_CENTER ||
            pos === XY_POSITION.CENTER_END
        ) {
            this.UIStyleClassAdd(this.#getAPIClassname('osd-position-center'));
        }
    }

    #lookingGlassGetSize()
    {
        let lookingGlass = this._main.createLookingGlass();

        return [lookingGlass.width, lookingGlass.height];
    }

    /**
     * set default looking glass size
     *
     * @returns {void}
     */
    lookingGlassSetDefaultSize()
    {
        this._lookingGlassWidth = null;
        this._lookingGlassHeight = null;
    }

    /**
     * set looking glass size
     *
     * @param {number} width in float
     * @param {number} height in float
     *
     * @returns {void}
     */
    lookingGlassSetSize(width, height)
    {
        this._lookingGlassWidth = width;
        this._lookingGlassHeight = height;
    }

    /**
     * unregister the looking glass signals
     *
     * @returns {void}
     */
    #unregisterLookingGlassSignals()
    {
        if (!this._lookingGlassShowSignal) {
            return;
        }

        this._main.lookingGlass.disconnect(this._lookingGlassShowSignal);
        this._main.layoutManager.disconnect(this._monitorsChangedSignal);

        delete(this._lookingGlassOriginalSize);
        delete(this._lookingGlassShowSignal);
        delete(this._monitorsChangedSignal);
    }

    /**
     * register the looking glass signals
     *
     * @returns {void}
     */
    #registerLookingGlassSignals()
    {
        let lookingGlass = this._main.createLookingGlass();

        if (!this._lookingGlassOriginalSize) {
            this._lookingGlassOriginalSize = this.#lookingGlassGetSize();
        }

        if (this._lookingGlassShowSignal) {
            lookingGlass.disconnect(this._lookingGlassShowSignal);
            delete(this._lookingGlassShowSignal);
        }

        this._lookingGlassShowSignal = lookingGlass.connect('show', () => {
            let [originalWidth, originalHeight] = this._lookingGlassOriginalSize;
            let monitorInfo = this.monitorGetInfo();

            let width = this._lookingGlassWidth ?? null;
            let height = this._lookingGlassHeight ?? null;

            let dialogWidth
            = (width !== null)
            ? monitorInfo.width * width
            : originalWidth;

            let x = monitorInfo.x + (monitorInfo.width - dialogWidth) / 2;
            lookingGlass.set_x(x);

            let keyboardHeight = this._main.layoutManager.keyboardBox.height;
            let availableHeight = monitorInfo.height - keyboardHeight;
            let dialogHeight
            = (height !== null)
            ? Math.min(monitorInfo.height * height, availableHeight * 0.9)
            : originalHeight;

            let panelBox = this._main.layoutManager.panelBox;
            let isPanelHorizontal = (panelBox.width > panelBox.height);
            let panelGap = (this.isPanelVisible() && isPanelHorizontal) ? panelBox.height : 0;

            lookingGlass._hiddenY = monitorInfo.y + panelGap - dialogHeight;
            lookingGlass._targetY = lookingGlass._hiddenY + dialogHeight;

            lookingGlass.set_size(dialogWidth, dialogHeight);
        });

        if (!this._monitorsChangedSignal) {
            this._monitorsChangedSignal = this._main.layoutManager.connect('monitors-changed',
            () => {
                this.#unregisterLookingGlassSignals()
                this.#registerLookingGlassSignals();
            });
        }
    }

    /**
     * show window menu
     *
     * @returns {void}
     */
    windowMenuShow()
    {
        let WindowMenuManagerProto = this._windowMenu.WindowMenuManager.prototype;

        if (!this.#originals['showWindowMenuForWindow']) {
            return;
        }

        WindowMenuManagerProto.showWindowMenuForWindow = this.#originals['showWindowMenuForWindow'];

        delete(this.#originals['showWindowMenuForWindow']);
    }

    /**
     * hide window menu
     *
     * @returns {void}
     */
    windowMenuHide()
    {
        let WindowMenuManagerProto = this._windowMenu.WindowMenuManager.prototype;

        if (!this.#originals['showWindowMenuForWindow']) {
            this.#originals['showWindowMenuForWindow'] = WindowMenuManagerProto.showWindowMenuForWindow;
        }

        WindowMenuManagerProto.showWindowMenuForWindow = (window, _type, _rect) => {
            window.focus(global.get_current_time());
            window.raise();
        };
    }

    /**
     * show screenshot in window menu
     *
     * @returns {void}
     */
    screenshotInWindowMenuShow()
    {
        let windowMenuProto = this._windowMenu.WindowMenu.prototype;

        if (windowMenuProto._oldBuildMenu === undefined) {
            return;
        }

        windowMenuProto._buildMenu = this.#originals['WindowMenubuildMenu'];

        delete(windowMenuProto._oldBuildMenu);
    }

    /**
     * hide screenshot in window menu
     *
     * @returns {void}
     */
    screenshotInWindowMenuHide()
    {
        let windowMenuProto = this._windowMenu.WindowMenu.prototype;

        if (!this.#originals['WindowMenubuildMenu']) {
            this.#originals['WindowMenubuildMenu'] = windowMenuProto._buildMenu;
        }

        if (windowMenuProto._oldBuildMenu === undefined) {
            windowMenuProto._oldBuildMenu = this.#originals['WindowMenubuildMenu'];
        }

        windowMenuProto._buildMenu = function (window) {
            this._oldBuildMenu(window);
            this.firstMenuItem.hide();
        };
    }

    /**
     * set all alt tab sizes to default
     *
     * @returns {void}
     */
    #altTabSizesSetDefault()
    {
        let WindowIconProto = this._altTab.WindowIcon.prototype;
        if (WindowIconProto._initOld) {
            WindowIconProto._init = WindowIconProto._initOld;
            delete(WindowIconProto._initOld);
        }

        delete(this._altTabAPP_ICON_SIZE);
        delete(this._altTabAPP_ICON_SIZE_SMALL);
        delete(this._altTabWINDOW_PREVIEW_SIZE);
    }

    controlsManagerSpacingSetDefault()
    {
        if (this._controlsManagerSpacingSize === undefined) {
            return;
        }

        let classnameStarter = this.#getAPIClassname('controls-manager-spacing-size');
        this.UIStyleClassRemove(classnameStarter + this._controlsManagerSpacingSize);

        delete this._controlsManagerSpacingSize;
    }

    /**
     * set controls manager spacing size
     *
     * @param {number} size in pixels (0 - 150)
     *
     * @returns {void}
     */
    controlsManagerSpacingSizeSet(size)
    {
        this.controlsManagerSpacingSetDefault();

        if (size < 0 || size > 150) {
            return;
        }

        this._controlsManagerSpacingSize = size;

        let classnameStarter = this.#getAPIClassname('controls-manager-spacing-size');
        this.UIStyleClassAdd(classnameStarter + size);
    }

    /**
     * set workspaces view spacing to default
     *
     * @returns {void}
     */
    workspacesViewSpacingSetDefault()
    {
        let wsvp = this._workspacesView.WorkspacesView.prototype;

        if (wsvp._getSpacingOld === undefined) {
            return;
        }

        wsvp._getSpacing = wsvp._getSpacingOld;
        delete wsvp._getSpacingOld;
    }

    /**
     * set workspaces view spacing size
     *
     * @param {number} size in pixels (0 - 500)
     *
     * @returns {void}
     */
    workspacesViewSpacingSizeSet(size)
    {
        if (size < 0 || size > 500) {
            return;
        }

        let wsvp = this._workspacesView.WorkspacesView.prototype;

        if (wsvp._getSpacingOld === undefined) {
            wsvp._getSpacingOld = wsvp._getSpacing;
        }

        wsvp._getSpacing = function (box, fitMode, vertical) {
            if (fitMode === 0) {
                return size;
            }
            return this._getSpacingOld(box, fitMode, vertical);
        };
    }
    #stopAllOnQuickSettingsPropertyCalls()
    {
        if (!this._quickSettingsCallSignals) {
            return;
        }

        const indicators = this._main.panel.statusArea.quickSettings._indicators;

        for (let [_name, id] of Object.entries(this._quickSettingsCallSignals)) {
            if (id) {
                indicators.disconnect(id);
            }
        }

        delete(this._quickSettingsCallSignals);
    }
}
