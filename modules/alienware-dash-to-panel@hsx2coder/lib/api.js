/**
 * Dash API: dash-to-panel visibility and sizing.
 *
 * Split out of alienware-gnome-customizer-manager@hsx2coder lib/API.js by
 * tools/split-api.py. Method bodies are verbatim copies: the only change is
 * that each domain now lives with the module that owns its GSettings keys.
 *
 * @license GPL-3.0-only
 */
const DASH_ICON_SIZES = [16, 22, 24, 32];

export class DashApi
{
    #shellVersion = null;

    _dashVisibility = undefined;
    _dashSeparatorVisibility = undefined;
    _dashIconSize = undefined;

    constructor(dependencies)
    {
        this._main = dependencies['Main'] || null;
        this._windowPreview = dependencies['WindowPreview'] || null;
        this._st = dependencies['St'] || null;
        this._clutter = dependencies['Clutter'] || null;
        this._glib = dependencies['GLib'] || null;
        this._searchEntryVisibility = true;
    }

    open()
    {
        this.UIStyleClassAdd(this.#getAPIClassname('shell-version'));
    }

    close()
    {
        this.UIStyleClassRemove(this.#getAPIClassname('shell-version'));
        this.dashShow();
    }

    /**
     * update window preview overlap
     *
     * @returns {void}
     */
    #updateWindowPreviewOverlap()
    {
        let wpp = this._windowPreview.WindowPreview.prototype;

        if (this.isDashVisible() && wpp.overlapHeightsOld) {
            wpp.overlapHeights = wpp.overlapHeightsOld;
            delete(wpp.overlapHeightsOld);
            return;
        }

        if (!this.isDashVisible()) {
            wpp.overlapHeightsOld = wpp.overlapHeights;
            wpp.overlapHeights = function () {
                let [top, bottom] = this.overlapHeightsOld();
                return [top + 24, bottom + 24];
            };
        }
    }

    /**
     * add class name to the UI group
     *
     * @param {string} classname class name
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
     * set panel size to default
     *
     * @returns {void}
     */

    /**
     * check whether dash is visible
     *
     * @returns {boolean}
     */
    isDashVisible()
    {
        return this._dashVisibility === undefined || this._dashVisibility;
    }

    /**
     * show dash
     *
     * @returns {void}
     */

    /**
     * show dash
     *
     * @returns {void}
     */
    dashShow()
    {
        if (!this._main.overview.dash || this.isDashVisible()) {
            return;
        }

        this._dashVisibility = true;

        this._main.overview.dash.show();

        this._main.overview.dash.height = -1;
        this._main.overview.dash.setMaxSize(-1, -1);

        this.#updateWindowPreviewOverlap();
    }

    /**
     * hide dash
     *
     * @returns {void}
     */

    /**
     * hide dash
     *
     * @returns {void}
     */
    dashHide()
    {
        if (!this._main.overview.dash || !this.isDashVisible()) {
            return;
        }

        this._dashVisibility = false;

        this._main.overview.dash.hide();

        this._main.overview.dash.height = 0;

        this.#updateWindowPreviewOverlap();
    }

    /**
     * update window preview overlap
     *
     * @returns {void}
     */

    /**
     * set dash icon size to default
     *
     * @returns {void}
     */
    dashIconSizeSetDefault()
    {
        let classnameStarter = this.#getAPIClassname('dash-icon-size');

        DASH_ICON_SIZES.forEach(size => {
            this.UIStyleClassRemove(classnameStarter + size);
        });
    }

    /**
     * set dash icon size
     *
     * @param {number} size in pixels
     *   see DASH_ICON_SIZES for available sizes
     *
     * @returns {void}
     */

    /**
     * set dash icon size
     *
     * @param {number} size in pixels
     *   see DASH_ICON_SIZES for available sizes
     *
     * @returns {void}
     */
    dashIconSizeSet(size)
    {
        this.dashIconSizeSetDefault();

        if (!DASH_ICON_SIZES.includes(size)) {
            return;
        }

        let classnameStarter = this.#getAPIClassname('dash-icon-size');

        this.UIStyleClassAdd(classnameStarter + size);
    }

    /**
     * change ControlsManagerLayout._computeWorkspacesBoxForState
     * base on the current state
     *
     * @returns {void}
     */

    /**
     * show dash separator
     *
     * @returns {void}
     */
    dashSeparatorShow()
    {
        this.UIStyleClassRemove(this.#getAPIClassname('no-dash-separator'));
    }

    /**
     * hide dash separator
     *
     * @returns {void}
     */

    /**
     * hide dash separator
     *
     * @returns {void}
     */
    dashSeparatorHide()
    {
        this.UIStyleClassAdd(this.#getAPIClassname('no-dash-separator'));
    }

    /**
     * get looking glass size
     *
     * @returns {array}
     *  width: int
     *  height: int
     */

}
