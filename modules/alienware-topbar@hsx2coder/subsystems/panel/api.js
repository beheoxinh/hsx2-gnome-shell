/**
 * Panel API: top bar geometry, clock, panel items.
 *
 * Split out of alienware-gnome-customizer-manager@hsx2coder lib/API.js by
 * tools/split-api.py. Method bodies are verbatim copies: the only change is
 * that each domain now lives with the module that owns its GSettings keys.
 *
 * @license GPL-3.0-only
 */
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

export class PanelApi
{
    #shellVersion = null;

    #originals = {};

    #timeoutIds = {};

    _panelSize = undefined;
    _panelPosition = undefined;
    _panelVisibility = undefined;
    _panelHideMode = undefined;
    _panelIconSize = undefined;
    _panelButtonHpaddingSize = undefined;
    _panelIndicatorPaddingSize = undefined;
    _searchEntryVisibility = undefined;
    _isCalendarColumnInverted = undefined;
    _hidePanelHeightSignal = undefined;
    _hidePanelWorkareasChangedSignal = undefined;
    _workareasChangedSignal = undefined;
    _panelHeightSignal = undefined;
    _clockMenuPositionSignals = undefined;
    _clocksItemShowSignal = undefined;
    _backlightToggleShowSignal = undefined;
    _rfkillToggleShowSignal = undefined;
    _quickSettingsCallSignals = undefined;
    _searchActiveSignal = undefined;
    _setMenuOld = undefined;

    constructor(dependencies)
    {
        this._main = dependencies['Main'] || null;
        this._backgroundMenu = dependencies['BackgroundMenu'] || null;
        this._search = dependencies['Search'] || null;
        this._searchController = dependencies['SearchController'] || null;
        this._interfaceSettings = dependencies['InterfaceSettings'] || null;
        this._panel = dependencies['Panel'] || null;
        this._panelMenu = dependencies['PanelMenu'] || null;
        this._overviewControls = dependencies['OverviewControls'] || null;
        this._st = dependencies['St'] || null;
        this._glib = dependencies['GLib'] || null;
        this._clutter = dependencies['Clutter'] || null;
        this._meta = dependencies['Meta'] || null;
        this._gobject = dependencies['GObject'] || null;
        this._searchEntryVisibility = true;
        this._wsBoxPatch = null;
        this._wsBoxPatchOff = null;
    }

    open()
    {
        this.UIStyleClassAdd(this.#getAPIClassname('shell-version'));
    }

    close()
    {
        this.UIStyleClassRemove(this.#getAPIClassname('shell-version'));
        this.#startSearchSignal(false);
        this.#computeWorkspacesBoxForStateSetDefault();
        this.panelSetDefaultSize();
    }

    /**
     * change ControlsManagerLayout._computeWorkspacesBoxForState
     * base on the current state
     *
     * @returns {void}
     */
    #computeWorkspacesBoxForStateChanged()
    {
        if (!this._wsBoxPatch) {
            this._wsBoxPatch = {searchEntryVisible: this._searchEntryVisibility};
            this._wsBoxPatchOff = addWorkspacesBoxPatch(this._wsBoxPatch);
        }
        this._wsBoxPatch.searchEntryVisible = this._searchEntryVisibility;
    }

    #computeWorkspacesBoxForStateSetDefault()
    {
        this._wsBoxPatchOff?.();
        this._wsBoxPatchOff = null;
        this._wsBoxPatch = null;
    }

    /**
     * change ControlsManagerLayout._computeWorkspacesBoxForState to its default
     *
     * @returns {void}
     */
    /**
     * emit refresh styles
     * this is useful when changed style doesn't emit change because doesn't have
     * standard styles. for example, style with only `-natural-hpadding`
     * won't notify any change. so you need to call this function
     * to refresh that
     *
     * @returns {void}
     */
    #emitRefreshStyles()
    {
        let classname = this.#getAPIClassname('refresh-styles');

        this.UIStyleClassAdd(classname);
        this.UIStyleClassRemove(classname);
    }

    /**
     * show panel
     *
     * @returns {void}
     */
    /**
     * disconnect all clock menu position signals
     *
     * @returns {void}
     */
    #disconnectClockMenuPositionSignals()
    {
        let panelBoxes = [
            this._main.panel._centerBox,
            this._main.panel._rightBox,
            this._main.panel._leftBox,
        ];

        if (this._clockMenuPositionSignals) {
            for (let i = 0; i <= 2; i++) {
                panelBoxes[i].disconnect(this._clockMenuPositionSignals[i]);
            }
            delete(this._clockMenuPositionSignals);
        }
    }

    /**
     * set the clock menu position to default
     *
     * @returns {void}
     */
    /**
     * add to animation duration
     *
     * @param {number} duration in milliseconds
     *
     * @returns {number}
     */
    #addToAnimationDuration(duration)
    {
        let settings = this._st.Settings.get();

        return (settings.enable_animations) ? settings.slow_down_factor * duration : 1;
    }

    /**
     * get signal id of the event
     *
     * @param {Gtk.Widget} widget to find signal in
     * @param {string} signalName signal name
     *
     * @returns {number}
     */
    /**
     * add search signals that needs to be show search entry when the
     * search entry is hidden
     *
     * @param {boolean} add true means add the signal, false means remove
     *   the signal
     *
     * @returns {void}
     */
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

    /**
     * Set maximum displayed search result to default value
     *
     * @returns {void}
     */
    /**
     * change date menu indicator icon size
     *
     * @param {number} size
     *
     * @returns {void}
     */
    #changeDateMenuIndicatorIconSize(size)
    {
        let dateMenu = this._main.panel.statusArea.dateMenu;

        // we get set_icon_size is not a function in some setups
        // in case the date menu has been removed or not created
        if (
            dateMenu &&
            dateMenu._indicator &&
            dateMenu._indicator.set_icon_size
        ) {
            dateMenu._indicator.set_icon_size(size);
        }
    }

    /**
     * get panel icon size
     *
     * @returns {void}
     */
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

    /**
     * change notification banner position
     *
     * @param {number} pos
     *   see XY_POSITION for available positions
     *
     * @returns {void}
     */
    /**
     * fix panel menu opening side based on panel position
     *
     * @param {number} position St.Side value
     *   is the same
     *
     * @returns {void}
     */
    #fixPanelMenuSide(position)
    {
        let PanelMenuButton = this._panelMenu.Button;
        let PanelMenuButtonProto = PanelMenuButton.prototype;

        // Set Instances
        let findPanelMenus = (widget) => {
            if (widget instanceof PanelMenuButton && widget.menu?._boxPointer) {
                widget.menu._boxPointer._userArrowSide = position;
            }
            widget.get_children().forEach(subWidget => {
                findPanelMenus(subWidget)
            });
        }

        let panelBoxes = [
            this._main.panel._centerBox,
            this._main.panel._rightBox,
            this._main.panel._leftBox,
        ];
        panelBoxes.forEach(panelBox => findPanelMenus(panelBox));

        // Set Prototypes
        if (position === this._st.Side.TOP) {
            // reset to default since GNOME Shell panel is top by default
            if (PanelMenuButtonProto._setMenuOld) {
                PanelMenuButtonProto.setMenu = PanelMenuButtonProto._setMenuOld;
            }
            return;
        }

        if (!PanelMenuButtonProto._setMenuOld) {
            PanelMenuButtonProto._setMenuOld = PanelMenuButtonProto.setMenu;
        }

        PanelMenuButtonProto.setMenu = function (menu) {
            this._setMenuOld(menu);
            if (menu) {
                menu._boxPointer._userArrowSide = position;
            }
        }
    }

    /**
     * enable panel notification icon
     *
     * @returns {void}
     */
    /**
     * call a function when async property of quick settings is available
     *
     * @param {string} propertyName
     * @param {Function} func function to call when the property is available
     *
     * @returns {void}
     */
    #onQuickSettingsPropertyCall(propertyName, func)
    {
        const quickSettings = this._main.panel.statusArea.quickSettings;
        const indicators = quickSettings._indicators;

        if (quickSettings[propertyName]) {
            func(quickSettings[propertyName]);
            return;
        }

        if (!this._quickSettingsCallSignals) {
            this._quickSettingsCallSignals = {};
        }

        if (this._quickSettingsCallSignals[propertyName]) {
            indicators.disconnect(this._quickSettingsCallSignals[propertyName]);
        }

        this._quickSettingsCallSignals[propertyName] = indicators.connect(
            (this.#shellVersion >= 46) ? 'child-added' : 'actor-added',
            () => {
                if (!quickSettings[propertyName]) {
                    return;
                }

                if (this._quickSettingsCallSignals[propertyName]) {
                    indicators.disconnect(this._quickSettingsCallSignals[propertyName]);
                }

                func(quickSettings[propertyName]);
            }
        );
    }

    /**
     * disconnect all quick settings property calls
     *
     * @returns {void}
     */

    /**
     * set panel size to default
     *
     * @returns {void}
     */
    panelSetDefaultSize()
    {
        if (!this.#originals['panelHeight']) {
            return;
        }

        this.panelSetSize(this.#originals['panelHeight'], false);
    }

    /**
     * change panel size
     *
     * @param {number} size 0 to 100
     * @param {boolean} fake true means it shouldn't change the last size,
     *   false otherwise
     *
     * @returns {void}
     */

    /**
     * change panel size
     *
     * @param {number} size 0 to 100
     * @param {boolean} fake true means it shouldn't change the last size,
     *   false otherwise
     *
     * @returns {void}
     */
    panelSetSize(size, fake)
    {
        if (!this.#originals['panelHeight']) {
            this.#originals['panelHeight'] = this._main.panel.height;
        }

        if (size > 100 || size < 0) {
            return;
        }

        this._main.panel.height = size;

        if (!fake) {
            this._panelSize = size;
        }
    }

    /**
     * get the last size of the panel
     *
     * @returns {number}
     */

    /**
     * get the last size of the panel
     *
     * @returns {number}
     */
    panelGetSize()
    {
        if (this._panelSize !== undefined) {
            return this._panelSize;
        }

        if (this.#originals['panelHeight']) {
            return this.#originals['panelHeight'];
        }

        return this._main.panel.height;
    }

    /**
     * emit refresh styles
     * this is useful when changed style doesn't emit change because doesn't have
     * standard styles. for example, style with only `-natural-hpadding`
     * won't notify any change. so you need to call this function
     * to refresh that
     *
     * @returns {void}
     */

    /**
     * show panel
     *
     * @returns {void}
     */
    panelShow()
    {
        this._panelVisibility = true;

        let classname = this.#getAPIClassname('no-panel');

        if (!this.UIStyleClassContain(classname)) {
            return;
        }

        // The class name should be removed before addChrome the panelBox
        // removing after can cause `st_theme_node_lookup_shadow` crash
        this.UIStyleClassRemove(classname);

        let overview = this._main.overview;
        let searchEntryParent = overview.searchEntry.get_parent();
        let panelBox = this._main.layoutManager.panelBox;

        panelBox.translation_y = 0;

        this._main.layoutManager.overviewGroup.remove_child(panelBox);
        this._main.layoutManager.addChrome(panelBox, {
            affectsStruts: true,
            trackFullscreen: true,
        });

        if (this._hidePanelWorkareasChangedSignal) {
            global.display.disconnect(this._hidePanelWorkareasChangedSignal);
            delete(this._hidePanelWorkareasChangedSignal);
        }

        if (this._hidePanelHeightSignal) {
            panelBox.disconnect(this._hidePanelHeightSignal);
            delete(this._hidePanelHeightSignal);
        }

        searchEntryParent.set_style(`margin-top: 0;`);

        // hide and show can fix windows going under panel
        panelBox.hide();
        panelBox.show();

        if (this.#timeoutIds.panelHide) {
            this._glib.source_remove(this.#timeoutIds.panelHide);
            delete(this.#timeoutIds.panelHide);
        }
    }

    /**
     * hide panel
     *
     * @param {mode} hide mode see PANEL_HIDE_MODE. defaults to hide all
     * @param {boolean} force apply hide even if it is hidden
     *
     * @returns {void}
     */

    /**
     * hide panel
     *
     * @param {mode} hide mode see PANEL_HIDE_MODE. defaults to hide all
     * @param {boolean} force apply hide even if it is hidden
     *
     * @returns {void}
     */
    panelHide(mode)
    {
        this._panelVisibility = false;
        this._panelHideMode = mode;

        let overview = this._main.overview;
        let searchEntryParent = overview.searchEntry.get_parent();
        let panelBox = this._main.layoutManager.panelBox;
        let panelHeight = this._main.panel.height;
        let panelPosition = this.panelGetPosition();
        let direction = (panelPosition === PANEL_POSITION.BOTTOM) ? 1 : -1;

        if (panelBox.get_parent() === this._main.layoutManager.uiGroup) {
            this._main.layoutManager.removeChrome(panelBox);
            this._main.layoutManager.overviewGroup.insert_child_at_index(panelBox, 0);
        }

        panelBox.translation_y = (mode === PANEL_HIDE_MODE.DESKTOP) ? 0 : panelHeight * direction;

        if (panelPosition === PANEL_POSITION.TOP) {
            // when panel is hidden the first element gets too close to the top,
            // so we fix it with top margin in search entry
            // the panel height is the actual scaled height
            // css engine applies the scale automatically so we need to use
            // the original non-scaled value as initial value
            const scaleFactor = this._st.ThemeContext.get_for_stage(global.stage).scale_factor;
            let marginTop = (mode === PANEL_HIDE_MODE.ALL) ? 15 : Math.round(panelHeight / scaleFactor);
            searchEntryParent.set_style(`margin-top: ${marginTop}px;`);
        } else {
            searchEntryParent.set_style(`margin-top: 0;`);
        }

        // hide and show can fix windows going under panel
        panelBox.hide();
        panelBox.show();

        if (this._hidePanelWorkareasChangedSignal) {
            global.display.disconnect(this._hidePanelWorkareasChangedSignal);
            delete(this._hidePanelWorkareasChangedSignal);
        }

        this._hidePanelWorkareasChangedSignal = global.display.connect(
            'workareas-changed',
            () => {
                this.panelHide(this._panelHideMode);
            }
        );

        if (!this._hidePanelHeightSignal) {
            this._hidePanelHeightSignal = panelBox.connect(
                'notify::height',
                () => {
                    this.panelHide(this._panelHideMode);
                }
            );
        }

        let classname = this.#getAPIClassname('no-panel');
        this.UIStyleClassAdd(classname);

        // update hot corners since we need to make them available
        // outside overview
        this._main.layoutManager._updateHotCorners();

        // For GNOME Shell 45-48
        // Maximized windows will have bad maximized gap after unlock in Wayland
        // This is a Mutter issue,
        // See https://gitlab.gnome.org/GNOME/mutter/-/issues/1627
        if (this.#shellVersion <= 48 && this._meta.is_wayland_compositor()) {
            let duration = this.#addToAnimationDuration(180);
            this.#timeoutIds.panelHide = this._glib.timeout_add(
                this._glib.PRIORITY_DEFAULT,
                duration,
                () => {
                    panelBox.hide();
                    panelBox.show();
                    this.#timeoutIds.panelHide = null;
                    return this._glib.SOURCE_REMOVE;
                }
            );
        }
    }

    /**
     * check whether panel is visible
     *
     * @returns {boolean}
     */

    /**
     * check whether panel is visible
     *
     * @returns {boolean}
     */
    isPanelVisible()
    {
        if (this._panelVisibility === undefined) {
            return true;
        }

        let fullyHidden = this._panelHideMode === PANEL_HIDE_MODE.ALL;

        return this._panelVisibility || (!this._panelVisibility && !fullyHidden);
    }

    /**
     * check whether dash is visible
     *
     * @returns {boolean}
     */

    /**
     * add class name to the UI group
     *
     * @param {string} classname class name
     *
     * @returns {void}
     */
    UIStyleClassAdd(classname)
    {
        this._main.layoutManager.uiGroup.add_style_class_name(classname);
    }

    /**
     * remove class name from UI group
     *
     * @param {string} classname class name
     *
     * @returns {void}
     */

    /**
     * remove class name from UI group
     *
     * @param {string} classname class name
     *
     * @returns {void}
     */
    UIStyleClassRemove(classname)
    {
        this._main.layoutManager.uiGroup.remove_style_class_name(classname);
    }

    /**
     * check whether UI group has class name
     *
     * @param {string} classname class name
     *
     * @returns {boolean}
     */

    /**
     * check whether UI group has class name
     *
     * @param {string} classname class name
     *
     * @returns {boolean}
     */
    UIStyleClassContain(classname)
    {
        return this._main.layoutManager.uiGroup.has_style_class_name(classname);
    }

    /**
     * enable background menu
     *
     * @returns {void}
     */

    /**
     * enable background menu
     *
     * @returns {void}
     */
    backgroundMenuEnable()
    {
        if (!this.#originals['backgroundMenuOpen']) {
            return;
        }

        this._backgroundMenu.BackgroundMenu.prototype.open = this.#originals['backgroundMenuOpen'];
    }

    /**
     * disable background menu
     *
     * @returns {void}
     */

    /**
     * disable background menu
     *
     * @returns {void}
     */
    backgroundMenuDisable()
    {
        let backgroundMenuProto = this._backgroundMenu.BackgroundMenu.prototype;

        if (!this.#originals['backgroundMenuOpen']) {
            this.#originals['backgroundMenuOpen'] = backgroundMenuProto.open;
        }

        backgroundMenuProto.open = () => {};
    }

    /**
     * show search
     *
     * @param {boolean} fake true means it just needs to do the job but
     *   don't need to change the search visibility status
     *
     * @returns {void}
     */

    /**
     * show search
     *
     * @param {boolean} fake true means it just needs to do the job but
     *   don't need to change the search visibility status
     *
     * @returns {void}
     */
    searchEntryShow(fake)
    {
        let classname = this.#getAPIClassname('no-search');

        if (!this.UIStyleClassContain(classname)) {
            return;
        }

        this.UIStyleClassRemove(classname);

        let searchEntry = this._main.overview.searchEntry;
        let searchEntryParent = searchEntry.get_parent();

        searchEntryParent.ease({
            height: searchEntry.height,
            opacity: 255,
            mode: this._clutter.AnimationMode.EASE,
            duration: 110,
            onComplete: () => {
                searchEntryParent.height = -1;
                searchEntry.ease({
                    opacity: 255,
                    mode: this._clutter.AnimationMode.EASE,
                    duration: 700,
                });
            },
        });

        if (!fake) {
            this._searchEntryVisibility = true;
        }

        this.#computeWorkspacesBoxForStateChanged();
    }

    /**
     * hide search
     *
     * @param {boolean} fake true means it just needs to do the job
     *   but don't need to change the search visibility status
     *
     * @returns {void}
     */

    /**
     * hide search
     *
     * @param {boolean} fake true means it just needs to do the job
     *   but don't need to change the search visibility status
     *
     * @returns {void}
     */
    searchEntryHide(fake)
    {
        this.UIStyleClassAdd(this.#getAPIClassname('no-search'));

        let searchEntry = this._main.overview.searchEntry;
        let searchEntryParent = searchEntry.get_parent();

        searchEntry.ease({
            opacity: 0,
            mode: this._clutter.AnimationMode.EASE,
            duration: 50,
        });

        searchEntryParent.ease({
            height: 0,
            opacity: 0,
            mode: this._clutter.AnimationMode.EASE,
            duration: 120,
        });

        if (!fake) {
            this._searchEntryVisibility = false;
        }

        this.#computeWorkspacesBoxForStateChanged();
    }

    /**
     * enable start search
     *
     * @returns {void}
     */

    /**
     * enable start search
     *
     * @returns {void}
     */
    startSearchEnable()
    {
        this.#startSearchSignal(true);

        if (!this.#originals['startSearch']) {
            return;
        }

        this._searchController.SearchController.prototype.startSearch = this.#originals['startSearch'];
    }

    /**
     * disable start search
     *
     * @returns {void}
     */

    /**
     * disable start search
     *
     * @returns {void}
     */
    startSearchDisable()
    {
        this.#startSearchSignal(false);

        if (!this.#originals['startSearch']) {
            this.#originals['startSearch'] = this._searchController.SearchController.prototype.startSearch
        }

        this._searchController.SearchController.prototype.startSearch = () => {};
    }

    /**
     * add search signals that needs to be show search entry when the
     * search entry is hidden
     *
     * @param {boolean} add true means add the signal, false means remove
     *   the signal
     *
     * @returns {void}
     */

    /**
     * Set maximum displayed search result to default value
     *
     * @returns {void}
     */
    setMaxDisplayedSearchResultToDefault()
    {
        if (!this.#originals['searchGetMaxDisplayedResults']) {
            return;
        }

        let ListSearchResultsProto = this._search.ListSearchResults.prototype;

        ListSearchResultsProto._getMaxDisplayedResults = this.#originals['searchGetMaxDisplayedResults'];
    }

    /**
     * Set maximum displayed search result
     *
     * @param {number} items max items
     *
     * @returns {void}
     */

    /**
     * Set maximum displayed search result
     *
     * @param {number} items max items
     *
     * @returns {void}
     */
    setMaxDisplayedSearchResult(items)
    {
        let ListSearchResultsProto = this._search.ListSearchResults.prototype;

        if (!this.#originals['searchGetMaxDisplayedResults']) {
            this.#originals['searchGetMaxDisplayedResults'] = ListSearchResultsProto._getMaxDisplayedResults;
        }

        ListSearchResultsProto._getMaxDisplayedResults = () => {
            return items;
        }
    }

    /**
     * enable OSD
     *
     * @returns {void}
     */

    /**
     * add element to stage
     *
     * @param {St.Widget} element widget
     *
     * @returns {void}
     */
    chromeAdd(element)
    {
        this._main.layoutManager.addChrome(element, {
            affectsInputRegion : true,
            affectsStruts : false,
            trackFullscreen : true,
        });
    }

    /**
     * remove element from stage
     *
     * @param {St.Widget} element widget
     *
     * @returns {void}
     */

    /**
     * remove element from stage
     *
     * @param {St.Widget} element widget
     *
     * @returns {void}
     */
    chromeRemove(element)
    {
        this._main.layoutManager.removeChrome(element);
    }

    /**
     * show activities button
     *
     * @returns {void}
     */

    /**
     * show activities button
     *
     * @returns {void}
     */
    activitiesButtonShow()
    {
        let activities = this._main.panel.statusArea.activities;

        if (!this.isLocked() && activities) {
            activities.container.show();
        }
    }

    /**
     * hide activities button
     *
     * @returns {void}
     */

    /**
     * hide activities button
     *
     * @returns {void}
     */
    activitiesButtonHide()
    {
        let activities = this._main.panel.statusArea.activities;

        if (activities) {
            activities.container.hide();
        }
    }

    /**
     * show date menu
     *
     * @returns {void}
     */

    /**
     * show date menu
     *
     * @returns {void}
     */
    dateMenuShow()
    {
        if (!this.isLocked()) {
            this._main.panel.statusArea.dateMenu.container.show();
        }
    }

    /**
     * hide date menu
     *
     * @returns {void}
     */

    /**
     * hide date menu
     *
     * @returns {void}
     */
    dateMenuHide()
    {
        this._main.panel.statusArea.dateMenu.container.hide();
    }

    /**
     * show keyboard layout
     *
     * @returns {void}
     */

    /**
     * show keyboard layout
     *
     * @returns {void}
     */
    keyboardLayoutShow()
    {
        this._main.panel.statusArea.keyboard.container.show();
    }

    /**
     * hide keyboard layout
     *
     * @returns {void}
     */

    /**
     * hide keyboard layout
     *
     * @returns {void}
     */
    keyboardLayoutHide()
    {
        this._main.panel.statusArea.keyboard.container.hide();
    }

    /**
     * show accessibility menu
     *
     * @returns {void}
     */

    /**
     * show accessibility menu
     *
     * @returns {void}
     */
    accessibilityMenuShow()
    {
        this._main.panel.statusArea.a11y?.container.show();
    }

    /**
     * hide accessibility menu
     *
     * @returns {void}
     */

    /**
     * hide accessibility menu
     *
     * @returns {void}
     */
    accessibilityMenuHide()
    {
        this._main.panel.statusArea.a11y?.container.hide();
    }

    /**
     * show quick settings menu
     *
     * @returns {void}
     */

    /**
     * show quick settings menu
     *
     * @returns {void}
     */
    quickSettingsMenuShow()
    {
        this._main.panel.statusArea.quickSettings.container.show();
    }

    /**
     * hide quick settings menu
     *
     * @returns {void}
     */

    /**
     * hide quick settings menu
     *
     * @returns {void}
     */
    quickSettingsMenuHide()
    {
        this._main.panel.statusArea.quickSettings.container.hide();
    }

    /**
     * check whether lock dialog is currently showing
     *
     * @returns {boolean}
     */

    /**
     * show power icon
     *
     * @returns {void}
     */
    powerIconShow()
    {
        this.UIStyleClassRemove(this.#getAPIClassname('no-power-icon'));
    }

    /**
     * hide power icon
     *
     * @returns {void}
     */

    /**
     * hide power icon
     *
     * @returns {void}
     */
    powerIconHide()
    {
        this.UIStyleClassAdd(this.#getAPIClassname('no-power-icon'));
    }

    /**
     * get primary monitor information
     *
     * @returns {false|Object} false when monitor does not exist | object
     *  x: int
     *  y: int
     *  width: int
     *  height: int
     *  geometryScale: float
     */

    /**
     * get panel position
     *
     * @returns {number} see PANEL_POSITION
     */
    panelGetPosition()
    {
        if (this._panelPosition === undefined) {
            return PANEL_POSITION.TOP;
        }

        return this._panelPosition;
    }

    /**
     * move panel position
     *
     * @param {number} position see PANEL_POSITION
     * @param {boolean} force allow to set even when the current position
     *   is the same
     *
     * @returns {void}
     */

    /**
     * move panel position
     *
     * @param {number} position see PANEL_POSITION
     * @param {boolean} force allow to set even when the current position
     *   is the same
     *
     * @returns {void}
     */
    panelSetPosition(position, force = false)
    {
        let monitorInfo = this.monitorGetInfo();
        let panelBox = this._main.layoutManager.panelBox;

        if (!force && position === this.panelGetPosition()) {
            return;
        }

        if (position === PANEL_POSITION.TOP) {
            this._panelPosition = PANEL_POSITION.TOP;
            if (this._workareasChangedSignal) {
                global.display.disconnect(this._workareasChangedSignal);
                this._workareasChangedSignal = null;
            }
            if (this._panelHeightSignal) {
                panelBox.disconnect(this._panelHeightSignal);
                this._panelHeightSignal = null;
            }
            let topX = (monitorInfo) ? monitorInfo.x : 0;
            let topY = (monitorInfo) ? monitorInfo.y : 0;
            panelBox.set_position(topX, topY);
            this.UIStyleClassRemove(this.#getAPIClassname('bottom-panel'));
            this.#fixPanelMenuSide(this._st.Side.TOP);
            return;
        }

        this._panelPosition = PANEL_POSITION.BOTTOM;

        // only change it when a monitor detected
        // 'workareas-changed' signal will do the job on next monitor detection
        if (monitorInfo) {
            let BottomX = monitorInfo.x;
            let BottomY = monitorInfo.y + monitorInfo.height - this.panelGetSize();

            panelBox.set_position(BottomX, BottomY);
            this.UIStyleClassAdd(this.#getAPIClassname('bottom-panel'));
        }

        if (!this._workareasChangedSignal) {
            this._workareasChangedSignal
            = global.display.connect('workareas-changed', () => {
                this.panelSetPosition(PANEL_POSITION.BOTTOM, true);
            });
        }

        if (!this._panelHeightSignal) {
            this._panelHeightSignal = panelBox.connect('notify::height', () => {
                this.panelSetPosition(PANEL_POSITION.BOTTOM, true);
            });
        }

        this.#fixPanelMenuSide(this._st.Side.BOTTOM);
    }

    /**
     * fix panel menu opening side based on panel position
     *
     * @param {number} position St.Side value
     *   is the same
     *
     * @returns {void}
     */

    /**
     * enable panel notification icon
     *
     * @returns {void}
     */
    panelNotificationIconEnable()
    {
        this.UIStyleClassRemove(this.#getAPIClassname('no-panel-notification-icon'));
    }

    /**
     * disable panel notification icon
     *
     * @returns {void}
     */

    /**
     * disable panel notification icon
     *
     * @returns {void}
     */
    panelNotificationIconDisable()
    {
        this.UIStyleClassAdd(this.#getAPIClassname('no-panel-notification-icon'));
    }

    /**
     * disconnect all clock menu position signals
     *
     * @returns {void}
     */

    /**
     * set the clock menu position to default
     *
     * @returns {void}
     */
    clockMenuPositionSetDefault()
    {
        this.clockMenuPositionSet(0, 0);
        this.#disconnectClockMenuPositionSignals();
    }

    /**
     * set the clock menu position
     *
     * @param {number} pos see PANEL_BOX_POSITION
     * @param {number} offset starts from 0
     *
     * @returns {void}
     */

    /**
     * set the clock menu position
     *
     * @param {number} pos see PANEL_BOX_POSITION
     * @param {number} offset starts from 0
     *
     * @returns {void}
     */
    clockMenuPositionSet(pos, offset)
    {
        let dateMenu = this._main.panel.statusArea.dateMenu;

        let panelBoxes = [
            this._main.panel._centerBox,
            this._main.panel._rightBox,
            this._main.panel._leftBox,
        ];

        this.#disconnectClockMenuPositionSignals();

        let fromPos = -1;
        let fromIndex = -1;
        let toIndex = -1;
        let childLength = 0;
        for (let i = 0; i <= 2; i++) {
            let child = panelBoxes[i].get_children();
            let childIndex = child.indexOf(dateMenu.container);
            if (childIndex !== -1) {
                fromPos = i;
                fromIndex = childIndex;
                childLength = panelBoxes[pos].get_children().length;
                toIndex = (offset > childLength) ? childLength : offset;
                break;
            }
        }

        // couldn't find the from and to position because it has been removed
        if (fromPos === -1 || fromIndex === -1 || toIndex === -1) {
            return;
        }

        if (pos === fromPos && toIndex === fromIndex) {
            return;
        }

        panelBoxes[fromPos].remove_child(dateMenu.container);
        panelBoxes[pos].insert_child_at_index(dateMenu.container, toIndex);

        if (this.isLocked()) {
            this.dateMenuHide();
        }

        if (!this._clockMenuPositionSignals) {
            this._clockMenuPositionSignals = [null, null, null];
            for (let i = 0; i <= 2; i++) {
                this._clockMenuPositionSignals[i] = panelBoxes[i].connect(
                    (this.#shellVersion >= 46) ? 'child-added' : 'actor-added',
                    () => {
                        this.clockMenuPositionSet(pos, offset);
                    }
                );
            }
        }
    }

    /**
     * enable show apps button
     *
     * @returns {void}
     */

    /**
     * enable show apps button
     *
     * @returns {void}
     */
    showAppsButtonEnable()
    {
        this.UIStyleClassRemove(this.#getAPIClassname('no-show-apps-button'));
    }

    /**
     * disable show apps button
     *
     * @returns {void}
     */

    /**
     * disable show apps button
     *
     * @returns {void}
     */
    showAppsButtonDisable()
    {
        this.UIStyleClassAdd(this.#getAPIClassname('no-show-apps-button'));
    }

    /**
     * set animation speed as default
     *
     * @returns {void}
     */

    /**
     * set panel button hpadding to default
     *
     * @returns {void}
     */
    panelButtonHpaddingSetDefault()
    {
        if (this._panelButtonHpaddingSize === undefined) {
            return;
        }

        let classnameStarter = this.#getAPIClassname('panel-button-padding-size');
        this.UIStyleClassRemove(classnameStarter + this._panelButtonHpaddingSize);
        this.#emitRefreshStyles();

        delete this._panelButtonHpaddingSize;
    }

    /**
     * set panel button hpadding size
     *
     * @param {number} size in pixels (0 - 60)
     *
     * @returns {void}
     */

    /**
     * set panel button hpadding size
     *
     * @param {number} size in pixels (0 - 60)
     *
     * @returns {void}
     */
    panelButtonHpaddingSizeSet(size)
    {
        this.panelButtonHpaddingSetDefault();

        if (size < 0 || size > 60) {
            return;
        }

        this._panelButtonHpaddingSize = size;

        let classnameStarter = this.#getAPIClassname('panel-button-padding-size');
        this.UIStyleClassAdd(classnameStarter + size);
        this.#emitRefreshStyles();
    }

    /**
     * set panel indicator padding to default
     *
     * @returns {void}
     */

    /**
     * set panel indicator padding to default
     *
     * @returns {void}
     */
    panelIndicatorPaddingSetDefault()
    {
        if (this._panelIndicatorPaddingSize === undefined) {
            return;
        }

        let classnameStarter = this.#getAPIClassname('panel-indicator-padding-size');
        this.UIStyleClassRemove(classnameStarter + this._panelIndicatorPaddingSize);
        this.#emitRefreshStyles();

        delete this._panelIndicatorPaddingSize;
    }

    /**
     * set panel indicator padding size
     *
     * @param {number} size in pixels (0 - 60)
     *
     * @returns {void}
     */

    /**
     * set panel indicator padding size
     *
     * @param {number} size in pixels (0 - 60)
     *
     * @returns {void}
     */
    panelIndicatorPaddingSizeSet(size)
    {
        this.panelIndicatorPaddingSetDefault();

        if (size < 0 || size > 60) {
            return;
        }

        this._panelIndicatorPaddingSize = size;

        let classnameStarter = this.#getAPIClassname('panel-indicator-padding-size');
        this.UIStyleClassAdd(classnameStarter + size);
        this.#emitRefreshStyles();
    }

    /**
     * get window preview prototype
     *
     * @returns {Object}
     */

    /**
     * invert the position of calendar column items
     *
     * @returns {void}
     */
    invertCalendarColumnItems()
    {
        if (this._isCalendarColumnInverted) {
            return;
        }

        let dateMenu = this._main.panel.statusArea.dateMenu;
        let calendar = dateMenu._calendar;
        let date = dateMenu._date;
        let eventsItem = dateMenu._eventsItem;
        let clocksItem = dateMenu._clocksItem;
        let weatherItem = dateMenu._weatherItem;

        let displayBox = eventsItem.get_parent();
        if (displayBox) {
            displayBox.remove_child(clocksItem);
            displayBox.remove_child(eventsItem);
            displayBox.remove_child(weatherItem);
            displayBox.insert_child_at_index(weatherItem, 1);
            displayBox.insert_child_at_index(clocksItem, 2);
            displayBox.insert_child_at_index(eventsItem, 3);
        }

        let calendarBox = calendar.get_parent();
        if (calendarBox) {
            calendarBox.remove_child(calendar);
            calendarBox.remove_child(date);
            calendarBox.insert_child_at_index(calendar, 1);
            calendarBox.insert_child_at_index(date, 2);
        }

        this._isCalendarColumnInverted = true;
    }

    /**
     * show weather in date menu
     *
     * @returns {void}
     */

    /**
     * show weather in date menu
     *
     * @returns {void}
     */
    weatherShow()
    {
        this.UIStyleClassRemove(this.#getAPIClassname('no-weather'));
    }

    /**
     * hide weather in date menu
     *
     * @returns {void}
     */

    /**
     * hide weather in date menu
     *
     * @returns {void}
     */
    weatherHide()
    {
        this.UIStyleClassAdd(this.#getAPIClassname('no-weather'));
    }

    /**
     * show world clocks in date menu
     *
     * @returns {void}
     */

    /**
     * show world clocks in date menu
     *
     * @returns {void}
     */
    worldClocksShow()
    {
        if (!this.#originals['clocksItemSync']) {
            return;
        }

        let clocksItem = this._main.panel.statusArea.dateMenu._clocksItem;

        clocksItem._sync = this.#originals['clocksItemSync'];
        delete(this.#originals['clocksItemSync']);

        if (this._clocksItemShowSignal) {
            clocksItem.disconnect(this._clocksItemShowSignal);
            delete(this._clocksItemShowSignal);
        }

        clocksItem._sync();
    }

    /**
     * hide world clocks in date menu
     *
     * @returns {void}
     */

    /**
     * hide world clocks in date menu
     *
     * @returns {void}
     */
    worldClocksHide()
    {
        let clocksItem = this._main.panel.statusArea.dateMenu._clocksItem;

        if (!this.#originals['clocksItemSync']) {
            this.#originals['clocksItemSync'] = clocksItem._sync;
        }

        clocksItem._sync = function () {
            this.visible = false;
        };

        if (!this._clocksItemShowSignal) {
            this._clocksItemShowSignal = clocksItem.connect('show', () => {
                clocksItem._sync();
            });
        }

        clocksItem._sync();
    }

    /**
     * show events button in date menu
     *
     * @returns {void}
     */

    /**
     * show events button in date menu
     *
     * @returns {void}
     */
    eventsButtonShow()
    {
        this.UIStyleClassRemove(this.#getAPIClassname('no-events-button'));
    }

    /**
     * hide events button in date menu
     *
     * @returns {void}
     */

    /**
     * hide events button in date menu
     *
     * @returns {void}
     */
    eventsButtonHide()
    {
        this.UIStyleClassAdd(this.#getAPIClassname('no-events-button'));
    }

    /**
     * show calendar in date menu
     *
     * @returns {void}
     */

    /**
     * show calendar in date menu
     *
     * @returns {void}
     */
    calendarShow()
    {
        this._main.panel.statusArea.dateMenu._calendar.show();
    }

    /**
     * hide calendar in date menu
     *
     * @returns {void}
     */

    /**
     * hide calendar in date menu
     *
     * @returns {void}
     */
    calendarHide()
    {
        this._main.panel.statusArea.dateMenu._calendar.hide();
    }

    /**
     * set default panel icon size
     *
     * @returns {void}
     */

    /**
     * set default panel icon size
     *
     * @returns {void}
     */
    panelIconSetDefaultSize()
    {
        if (this._panelIconSize === undefined || !this.#originals['panelIconSize']) {
            return;
        }

        let classnameStarter = this.#getAPIClassname('panel-icon-size');
        this.UIStyleClassRemove(classnameStarter + this._panelIconSize);
        this.#emitRefreshStyles();

        let defaultSize = this.#originals['panelIconSize'];
        this.#changeDateMenuIndicatorIconSize(defaultSize);

        delete(this._panelIconSize);
    }

    /**
     * set panel icon size
     *
     * @param {number} size 1-60
     *
     * @returns {void}
     */

    /**
     * set panel icon size
     *
     * @param {number} size 1-60
     *
     * @returns {void}
     */
    panelIconSetSize(size)
    {
        if (size < 1 || size > 60) {
            return;
        }

        if (!this.#originals['panelIconSize']) {
            this.#originals['panelIconSize'] = this._panel.PANEL_ICON_SIZE;
        }

        let classnameStarter = this.#getAPIClassname('panel-icon-size');
        this.UIStyleClassRemove(classnameStarter + this.panelIconGetSize());
        this.UIStyleClassAdd(classnameStarter + size);
        this.#emitRefreshStyles();

        this.#changeDateMenuIndicatorIconSize(size);

        this._panelIconSize = size;
    }

    /**
     * change date menu indicator icon size
     *
     * @param {number} size
     *
     * @returns {void}
     */

    /**
     * enable screen sharing indicator
     *
     * @returns {void}
     */
    screenSharingIndicatorEnable()
    {
        this.UIStyleClassRemove(this.#getAPIClassname('no-screen-sharing-indicator'));
    }

    /**
     * disable screen sharing indicator
     *
     * @returns {void}
     */

    /**
     * disable screen sharing indicator
     *
     * @returns {void}
     */
    screenSharingIndicatorDisable()
    {
        this.UIStyleClassAdd(this.#getAPIClassname('no-screen-sharing-indicator'));
    }

    /**
     * enable screen recording indicator
     *
     * @returns {void}
     */

    /**
     * enable screen recording indicator
     *
     * @returns {void}
     */
    screenRecordingIndicatorEnable()
    {
        this.UIStyleClassRemove(this.#getAPIClassname('no-screen-recording-indicator'));
    }

    /**
     * disable screen recording indicator
     *
     * @returns {void}
     */

    /**
     * disable screen recording indicator
     *
     * @returns {void}
     */
    screenRecordingIndicatorDisable()
    {
        this.UIStyleClassAdd(this.#getAPIClassname('no-screen-recording-indicator'));
    }

    /**
     * set controls manager spacing to default
     *
     * @returns {void}
     */

    /**
     * show airplane mode toggle button in quick settings
     *
     * @returns {void}
     */
    quickSettingsAirplaneModeToggleShow()
    {
        this.#onQuickSettingsPropertyCall('_rfkill', (rfkill) => {
            if (this._rfkillToggleShowSignal) {
                rfkill._rfkillToggle.disconnect(this._rfkillToggleShowSignal);
            }

            if (this.#originals['rfkilToggleVisibleDefaultStatus'] !== undefined) {
                rfkill._rfkillToggle.visible = this.#originals['rfkilToggleVisibleDefaultStatus'];
                rfkill._sync();
                delete(this.#originals['rfkilToggleVisibleDefaultStatus']);
            }
        });
    }

    /**
     * hide airplane mode toggle button in quick settings
     *
     * @returns {void}
     */

    /**
     * hide airplane mode toggle button in quick settings
     *
     * @returns {void}
     */
    quickSettingsAirplaneModeToggleHide()
    {
        this._rfkillToggleShowSignal;

        this.#onQuickSettingsPropertyCall('_rfkill', (rfkill) => {
            if (!this.#originals['rfkilToggleVisibleDefaultStatus']) {
                this.#originals['rfkilToggleVisibleDefaultStatus'] = rfkill._rfkillToggle.visible;
            }

            rfkill._rfkillToggle.hide();
            rfkill._sync();

            if (!this._rfkillToggleShowSignal) {
                this._rfkillToggleShowSignal = rfkill._rfkillToggle.connect('show', () => {
                    rfkill._rfkillToggle.hide();
                    rfkill._sync();
                });
            }
        });
    }

    /**
     * show dark style toggle button in quick settings
     *
     * @returns {void}
     */

    /**
     * show dark style toggle button in quick settings
     *
     * @returns {void}
     */
    quickSettingsDarkStyleToggleShow()
    {
        this.#onQuickSettingsPropertyCall('_darkMode', (darkMode) => {
            darkMode.quickSettingsItems[0].show();
        });
    }

    /**
     * hide dark style toggle button in quick settings
     *
     * @returns {void}
     */

    /**
     * hide dark style toggle button in quick settings
     *
     * @returns {void}
     */
    quickSettingsDarkStyleToggleHide()
    {
        this.#onQuickSettingsPropertyCall('_darkMode', (darkMode) => {
            darkMode.quickSettingsItems[0].hide();
        });
    }

    /**
     * show night light toggle button in quick settings
     *
     * @returns {void}
     */

    /**
     * show night light toggle button in quick settings
     *
     * @returns {void}
     */
    quickSettingsNightLightToggleShow()
    {
        this.#onQuickSettingsPropertyCall('_nightLight', (nightLight) => {
            nightLight.quickSettingsItems[0].show();
        });
    }

    /**
     * hide night light toggle button in quick settings
     *
     * @returns {void}
     */

    /**
     * hide night light toggle button in quick settings
     *
     * @returns {void}
     */
    quickSettingsNightLightToggleHide()
    {
        this.#onQuickSettingsPropertyCall('_nightLight', (nightLight) => {
            nightLight.quickSettingsItems[0].hide();
        });
    }

    /**
     * show do not disturb toggle button in quick settings
     *
     * @returns {void}
     */

    /**
     * show do not disturb toggle button in quick settings
     *
     * @returns {void}
     */
    quickSettingsDoNotDisturbToggleShow()
    {
        if (this.#shellVersion < 49) {
            return;
        }

        this.#onQuickSettingsPropertyCall('_doNotDisturb', (doNotDisturb) => {
            doNotDisturb.quickSettingsItems[0].show();
        });
    }

    /**
     * hide do not disturb toggle button in quick settings
     *
     * @returns {void}
     */

    /**
     * hide do not disturb toggle button in quick settings
     *
     * @returns {void}
     */
    quickSettingsDoNotDisturbToggleHide()
    {
        if (this.#shellVersion < 49) {
            return;
        }

        this.#onQuickSettingsPropertyCall('_doNotDisturb', (doNotDisturb) => {
            doNotDisturb.quickSettingsItems[0].hide();
        });
    }

    /**
     * show backlight toggle button in quick settings
     *
     * @returns {void}
     */

    /**
     * show backlight toggle button in quick settings
     *
     * @returns {void}
     */
    quickSettingsBacklightToggleShow()
    {
        this.#onQuickSettingsPropertyCall('_backlight', (backlight) => {
            let item = backlight.quickSettingsItems[0];

            if (this.#originals['backlightToggleVisibleDefaultStatus'] !== undefined) {
                item.visible = this.#originals['backlightToggleVisibleDefaultStatus'];
                delete(this.#originals['backlightToggleVisibleDefaultStatus']);
            }

            if (this._backlightToggleShowSignal) {
                item.disconnect(this._backlightToggleShowSignal);
            }
        });
    }

    /**
     * hide backlight toggle button in quick settings
     *
     * @returns {void}
     */

    /**
     * hide backlight toggle button in quick settings
     *
     * @returns {void}
     */
    quickSettingsBacklightToggleHide()
    {
        this._backlightToggleShowSignal;

        this.#onQuickSettingsPropertyCall('_backlight', (backlight) => {
            let item = backlight.quickSettingsItems[0];

            if (!this.#originals['backlightToggleVisibleDefaultStatus']) {
                this.#originals['backlightToggleVisibleDefaultStatus'] = item.visible;
            }

            item.hide();

            if (!this._backlightToggleShowSignal) {
                this._backlightToggleShowSignal = item.connect('show', () => {
                    item.hide();
                });
            }
        });
    }

    /**
     * call a function when async property of quick settings is available
     *
     * @param {string} propertyName
     * @param {Function} func function to call when the property is available
     *
     * @returns {void}
     */

    /**
     * enable accent color icon
     *
     * @returns {void}
     */
    accentColorIconEnable()
    {
        this.UIStyleClassAdd(this.#getAPIClassname('accent-color-icon'));
    }

    /**
     * disable accent color icon
     *
     * @returns {void}
     */

    /**
     * disable accent color icon
     *
     * @returns {void}
     */
    accentColorIconDisable()
    {
        this.UIStyleClassRemove(this.#getAPIClassname('accent-color-icon'));
    }
}
