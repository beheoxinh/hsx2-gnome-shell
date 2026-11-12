/**
 * API Library
 *
 * @author     Javad Rahmatzadeh <j.rahmatzadeh@gmail.com>
 * @copyright  2020-2026
 * @license    GPL-3.0-only
 */

import {
    detachShellAttentionHandlers,
    restoreShellAttentionHandlers,
    setFocusOnDemand,
} from './attentionHandlers.js';

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

const SHELL_STATUS = {
    NONE: 0,
    OVERVIEW: 1,
};

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
     * whether St animations are inhibited by animationsDisable()
     *
     * @type {boolean}
     */
    #animationsInhibited = false;

    /**
     * Class Constructor
     *
     * @param {Object} dependencies
     *   'Main' reference to ui.main
     *   'OverviewControls' reference to ui.overviewControls
     *   'WorkspaceSwitcherPopup' reference to ui.workspaceSwitcherPopup
     *   'WorkspaceThumbnail' reference to ui.workspaceThumbnail
     *   'WorkspacesView' reference to ui.workspacesView
     *   'Workspace' reference to ui.workspace
     *   'OSDWindow' reference to ui.osdTray
     *   'WindowMenu' reference to ui.windowMenu
     *   'St' reference to St
     *   'Clutter' reference to Clutter
     *   'Util' reference to misc.util
     *   'Meta' reference to Meta
     *   'GObject' reference to GObject
     * @param {number} shellVersion - float in major.minor format
     */
    constructor(dependencies, shellVersion)
    {
        this._main = dependencies['Main'] || null;
        this._overviewControls = dependencies['OverviewControls'] || null;
        this._workspaceSwitcherPopup = dependencies['WorkspaceSwitcherPopup'] || null;
        this._workspaceThumbnail = dependencies['WorkspaceThumbnail'] || null;
        this._workspacesView = dependencies['WorkspacesView'] || null;
        this._workspace = dependencies['Workspace'] || null;
        this._osdWindow = dependencies['OSDWindow'] || null;
        this._windowMenu = dependencies['WindowMenu'] || null;
        this._st = dependencies['St'] || null;
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
    }

    /**
     * remove everything from GNOME Shell been added by this class
     *
     * WindowIcon (Alt+Tab) belongs to alienware-advanced-alt-tab and the quick
     * settings menu to subsystems/panel-menus: this used to reset both here,
     * so disabling only this module stripped the Alt+Tab icon sizes out from
     * under a module that was still running.
     *
     * @returns {void}
     */
    close()
    {
        this.UIStyleClassRemove(this.#getAPIClassname('shell-version'));
        this.windowMaximizedOnCreateDisable();
        this.windowDemandsAttentionFocusDisable();
        this.#computeWorkspacesBoxForStateSetDefault();
        this.animationsEnable();
        this.fullscreenUnredirectEnable();
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

    OSDEnable()
    {

        try {
        if (!this.#originals['osdWindowManagerShow']) {
            return;
        }

        this._main.osdWindowManager.show = this.#originals['osdWindowManagerShow'];
        this._main.osdWindowManager.showOne = this.#originals['osdWindowManagerShowOne'];
        this._main.osdWindowManager.showAll = this.#originals['osdWindowManagerShowAll'];
            } catch (e) {
            logError(e, 'GCM-API');
        }
    }

    /**
     * disable OSD
     *
     * @returns {void}
     */
    OSDDisable()
    {

        try {
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
            } catch (e) {
            logError(e, 'GCM-API');
        }
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

        try {
        let thumbnailsBox = this._main.overview._overview._controls._thumbnailsBox;
        let ThumbnailsBoxProto = this._workspaceThumbnail.ThumbnailsBox.prototype;

        if (!ThumbnailsBoxProto._initOld) {
            return;
        }

        ThumbnailsBoxProto._init = ThumbnailsBoxProto._initOld;
        delete(ThumbnailsBoxProto._initOld);

        thumbnailsBox._maxThumbnailScale = this._workspaceThumbnail.MAX_THUMBNAIL_SCALE;
            } catch (e) {
            logError(e, 'GCM-API');
        }
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

        try {
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
            } catch (e) {
            logError(e, 'GCM-API');
        }
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

    animationSpeedSetDefault()
    {

        try {
        if (this.#originals['StSlowDownFactor'] === undefined) {
            return;
        }

        this._st.Settings.get().slow_down_factor = this.#originals['StSlowDownFactor'];
            } catch (e) {
            logError(e, 'GCM-API');
        }
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

        try {
        if (this.#originals['StSlowDownFactor'] === undefined) {
            this.#originals['StSlowDownFactor']
            = this._st.Settings.get().slow_down_factor;
        }

        this._st.Settings.get().slow_down_factor = factor;
            } catch (e) {
            logError(e, 'GCM-API');
        }
    }

    /**
     * turn animations off for the session without touching the user's
     * org.gnome.desktop.interface enable-animations setting
     *
     * @returns {void}
     */
    animationsDisable()
    {
        try {
        if (this.#animationsInhibited) {
            return;
        }
        this._st.Settings.get().inhibit_animations();
        this.#animationsInhibited = true;
            } catch (e) {
            logError(e, 'GCM-API');
        }
    }

    /**
     * undo animationsDisable()
     *
     * @returns {void}
     */
    animationsEnable()
    {
        try {
        if (!this.#animationsInhibited) {
            return;
        }
        this._st.Settings.get().uninhibit_animations();
        this.#animationsInhibited = false;
            } catch (e) {
            logError(e, 'GCM-API');
        }
    }

    /**
     * stop mutter from unredirecting fullscreen windows; fixes flicker,
     * tearing and missing overlays (OSD, notifications) over fullscreen apps
     *
     * @returns {void}
     */
    fullscreenUnredirectDisable()
    {
        try {
        if (this._unredirectDisabled) {
            return;
        }
        if (global.compositor?.disable_unredirect) {
            global.compositor.disable_unredirect();
        } else {
            this._meta.disable_unredirect_for_display(global.display);
        }
        this._unredirectDisabled = true;
            } catch (e) {
            logError(e, 'GCM-API');
        }
    }

    /**
     * undo fullscreenUnredirectDisable()
     *
     * @returns {void}
     */
    fullscreenUnredirectEnable()
    {
        try {
        if (!this._unredirectDisabled) {
            return;
        }
        if (global.compositor?.enable_unredirect) {
            global.compositor.enable_unredirect();
        } else {
            this._meta.enable_unredirect_for_display(global.display);
        }
        this._unredirectDisabled = false;
            } catch (e) {
            logError(e, 'GCM-API');
        }
    }

    /**
     * enable focus when window demands attention happens
     *
     * @returns {void}
     */
    windowDemandsAttentionFocusEnable()
    {

        try {
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

        // The shell's notification handlers are detached through the shared
        // ref-counted helper. The old "first handler found" lookup removed
        // whichever handler was oldest (possibly another component's) and
        // logged "has no handler with id" when that one was already gone.
        this._shellAttentionDetached = detachShellAttentionHandlers();
        setFocusOnDemand(true);
            } catch (e) {
            logError(e, 'GCM-API');
        }
    }

    /**
     * disable focus when window demands attention happens
     *
     * @returns {void}
     */
    windowDemandsAttentionFocusDisable()
    {

        try {
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
        setFocusOnDemand(false);

        // Used to connect two more shell handlers on every disable, without
        // ever removing them (the second id even overwrote the first), so
        // each toggle/lock cycle stacked another notification per event.
        if (this._shellAttentionDetached) {
            this._shellAttentionDetached = false;
            restoreShellAttentionHandlers();
        }
            } catch (e) {
            logError(e, 'GCM-API');
        }
    }

    /**
     * enable maximizing windows on creation
     *
     * @returns {void}
     */
    windowMaximizedOnCreateEnable()
    {

        try {
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
            } catch (e) {
            logError(e, 'GCM-API');
        }
    }

    /**
     * disable maximizing windows on creation
     *
     * @returns {void}
     */
    windowMaximizedOnCreateDisable()
    {

        try {
        if (!this._displayWindowCreatedSignal) {
            return;
        }

        global.display.disconnect(this._displayWindowCreatedSignal);
        delete(this._displayWindowCreatedSignal);
            } catch (e) {
            logError(e, 'GCM-API');
        }
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

        try {
        let sessionMode = this._main.sessionMode;
        let layoutManager = this._main.layoutManager;

        // only meaningful while the shell is starting; "overview" is GNOME's
        // own behaviour, so it is left alone instead of being forced: forcing
        // it overrode Dash to Panel's "hide overview on startup", and the
        // hasOverview it captured was the value that module had just set,
        // so startup-complete restored false and the overview stayed off.
        if (!layoutManager._startingUp || status !== SHELL_STATUS.NONE) {
            return;
        }

        if (this._startupCompleteSignal) {
            return;
        }

        sessionMode.hasOverview = false;
        layoutManager.startInOverview = false;
        let ControlsState = this._overviewControls.ControlsState;
        this._main.overview._overview.controls._stateAdjustment.value = ControlsState.HIDDEN;

        this._startupCompleteSignal = layoutManager.connect('startup-complete', () => {
            // extensions only start in the user session, where the overview
            // exists; a captured value could be one another component set
            sessionMode.hasOverview = true;
            layoutManager.disconnect(this._startupCompleteSignal);
            delete(this._startupCompleteSignal);
        });
            } catch (e) {
            logError(e, 'GCM-API');
        }
    }

    /**
     * set startup status to default
     *
     * @returns {void}
     */
    startupStatusSetDefault()
    {

        try {
        if (!this._startupCompleteSignal) {
            return;
        }

        // disabled before startup finished: give the overview back now
        this._main.layoutManager.disconnect(this._startupCompleteSignal);
        delete(this._startupCompleteSignal);
        this._main.sessionMode.hasOverview = true;
            } catch (e) {
            logError(e, 'GCM-API');
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

        try {
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
            } catch (e) {
            logError(e, 'GCM-API');
        }
    }

    /**
     * enable workspace wraparound
     *
     * @returns {void}
     */
    workspaceWraparoundEnable()
    {

        try {
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
            } catch (e) {
            logError(e, 'GCM-API');
        }
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

        try {
        if (!this._overlayKeyOldSignalId) {
            return;
        }

        this._gobject.signal_handler_unblock(
            global.display,
            this._overlayKeyOldSignalId
        );

        delete(this._overlayKeyOldSignalId);
            } catch (e) {
            logError(e, 'GCM-API');
        }
    }

    /**
     * block overlay key
     *
     * @returns {void}
     */
    blockOverlayKey()
    {

        try {
        this._overlayKeyOldSignalId = this.#getSignalId(global.display, 'overlay-key');

        if (!this._overlayKeyOldSignalId) {
            return;
        }

        this._gobject.signal_handler_block(global.display, this._overlayKeyOldSignalId);
            } catch (e) {
            logError(e, 'GCM-API');
        }
    }

    /**
     * enable double super press to toggle app grid
     *
     * @returns {void}
     */
    doubleSuperToAppGridEnable()
    {

        try {
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
            } catch (e) {
            logError(e, 'GCM-API');
        }
    }

    /**
     * disable double super press to toggle app grid
     *
     * @returns {void}
     */
    doubleSuperToAppGridDisable()
    {

        try {
        if (this._isDoubleSuperToAppGrid === false) {
            return;
        }

        this.blockOverlayKey();

        this._overlayKeyNewSignalId = global.display.connect('overlay-key', () => {
            this._main.overview.toggle();
        });

        this._isDoubleSuperToAppGrid = false;
            } catch (e) {
            logError(e, 'GCM-API');
        }
    }

    osdPositionSetDefault()
    {

        try {
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
            } catch (e) {
            logError(e, 'GCM-API');
        }
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

        try {
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

        let aligns = this.#xyAlignGet(pos);
        if (!aligns) {
            return;
        }
        let [xAlign, yAlign] = aligns;

        // moving from one position to another left the old row's class on
        for (const row of ['top', 'bottom', 'center']) {
            this.UIStyleClassRemove(this.#getAPIClassname(`osd-position-${row}`));
        }

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
            } catch (e) {
            logError(e, 'GCM-API');
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

        try {
        let WindowMenuManagerProto = this._windowMenu.WindowMenuManager.prototype;

        if (!this.#originals['showWindowMenuForWindow']) {
            this.#originals['showWindowMenuForWindow'] = WindowMenuManagerProto.showWindowMenuForWindow;
        }

        WindowMenuManagerProto.showWindowMenuForWindow = (window, _type, _rect) => {
            window.focus(global.get_current_time());
            window.raise();
        };
            } catch (e) {
            logError(e, 'GCM-API');
        }
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
            const first = this.firstMenuItem;
            if (first) {
                first.hide();
            } else {
                const items = this._getMenuItems ? this._getMenuItems() : (this.menuItems ?? []);
                if (items.length > 0)
                    items[0].hide();
            }
        };
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
    /**
     * add class name to the UI group
     *
     * @param {string} classname class name
     *
     * @returns {void}
     */
    UIStyleClassAdd(classname)
    {

        try {
        this._main.layoutManager.uiGroup.add_style_class_name(classname);
            } catch (e) {
            logError(e, 'GCM-API');
        }
    }

    /**
     * remove class name from UI group
     *
     * @param {string} classname class name
     *
     * @returns {void}
     */
    UIStyleClassRemove(classname)
    {

        try {
        this._main.layoutManager.uiGroup.remove_style_class_name(classname);
            } catch (e) {
            logError(e, 'GCM-API');
        }
    }

    /**
     * check whether UI group has class name
     *
     * @param {string} classname class name
     *
     * @returns {boolean}
     */
    UIStyleClassContain(classname)
    {

        try {
        return this._main.layoutManager.uiGroup.has_style_class_name(classname);
            } catch (e) {
            logError(e, 'GCM-API');
        }
    }
}
