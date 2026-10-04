/**
 * Alt-tab API: switcher icon and preview sizing.
 *
 * Stateless helper owned by modules/alienware-advanced-alt-tab@hsx2coder/extension.js:
 * constructed in enable(), consumed by _AatJpHandler, released (reference
 * dropped) in disable(). No signals, no GLib sources, no actors — so no
 * enable()/disable() of its own. Caller-owned, caller-released.
 *
 * Split out of alienware-gnome-customizer-manager@hsx2coder lib/API.js by
 * tools/split-api.py. Method bodies are verbatim copies: the only change is
 * that each domain now lives with the module that owns its GSettings keys.
 *
 * @license GPL-3.0-only
 */
const APP_ICON_SIZE = 64;
const WINDOW_PREVIEW_SIZE = 106;

export class AltTabApi
{
    #shellVersion = null;

    #originals = {};

    _altTab = undefined;
    _altTabAPP_ICON_SIZE = undefined;
    _altTabAPP_ICON_SIZE_SMALL = undefined;
    _altTabWINDOW_PREVIEW_SIZE = undefined;
    _initOld = undefined;
    _showImmediately = undefined;
    _windowPreview = undefined;

    constructor(dependencies)
    {
        this._main = dependencies['Main'] || null;
        this._altTab = dependencies['AltTab'] || null;
        this._switcherPopup = dependencies['SwitcherPopup'] || null;
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
        this.#altTabSizesSetDefault();
    }

    /**
     * get window preview prototype
     *
     * @returns {Object}
     */
    #windowPreviewGetPrototype()
    {
        return this._windowPreview.WindowPreview.prototype;
    }

    /**
     * enable window preview caption
     *
     * @returns {void}
     */
    /**
     * set all alt tab sizes to default
     *
     * @returns {void}
     */
    #altTabSizesSetDefault()
    {
        if (!this._altTab?.WindowIcon?.prototype)
            return;
        let WindowIconProto = this._altTab.WindowIcon.prototype;
        if (WindowIconProto._initOld) {
            WindowIconProto._init = WindowIconProto._initOld;
            delete(WindowIconProto._initOld);
        }

        delete(this._altTabAPP_ICON_SIZE);
        delete(this._altTabAPP_ICON_SIZE_SMALL);
        delete(this._altTabWINDOW_PREVIEW_SIZE);
    }

    /**
     * set alt tab sizes
     *
     * @param {number|null} appIconSize
     * @param {number|null} appIconSizeSmall
     * @param {number|null} windowPreviewSize
     *
     * @returns {void}
     */
    /**
     * set alt tab sizes
     *
     * @param {number|null} appIconSize
     * @param {number|null} appIconSizeSmall
     * @param {number|null} windowPreviewSize
     *
     * @returns {void}
     */
    #altTabSizesSet(appIconSize, appIconSizeSmall, windowPreviewSize)
    {
        let WindowIconProto = this._altTab.WindowIcon.prototype;
        if (!WindowIconProto._initOld) {
            WindowIconProto._initOld = WindowIconProto._init;
        }

        this._altTabAPP_ICON_SIZE ||= this._altTab.APP_ICON_SIZE;
        this._altTabAPP_ICON_SIZE_SMALL ||= this._altTab.APP_ICON_SIZE_SMALL;
        this._altTabWINDOW_PREVIEW_SIZE ||= this._altTab.WINDOW_PREVIEW_SIZE;

        const APP_ICON_SIZE = appIconSize || this._altTabAPP_ICON_SIZE;
        const APP_ICON_SIZE_SMALL = appIconSizeSmall || this._altTabAPP_ICON_SIZE_SMALL;
        const WINDOW_PREVIEW_SIZE = windowPreviewSize || this._altTabWINDOW_PREVIEW_SIZE;

        WindowIconProto._init = function(window, mode) {
            this._initOld(window, mode);
        }
    }

    /**
     * set default alt tab window preview size
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
     * enable window preview caption
     *
     * @returns {void}
     */
    windowPreviewCaptionEnable()
    {
        if (!this.#originals['windowPreviewGetCaption']) {
            return;
        }

        let windowPreviewProto = this.#windowPreviewGetPrototype();
        windowPreviewProto._getCaption = this.#originals['windowPreviewGetCaption'];

        this.UIStyleClassRemove(this.#getAPIClassname('no-window-caption'));
    }

    /**
     * disable window preview caption
     *
     * @returns {void}
     */

    /**
     * disable window preview caption
     *
     * @returns {void}
     */
    windowPreviewCaptionDisable()
    {
        let windowPreviewProto = this.#windowPreviewGetPrototype();

        if (!this.#originals['windowPreviewGetCaption']) {
            this.#originals['windowPreviewGetCaption'] = windowPreviewProto._getCaption;
        }

        windowPreviewProto._getCaption = () => {
            return '';
        };

        this.UIStyleClassAdd(this.#getAPIClassname('no-window-caption'));
    }

    /**
     * set workspace background border radius to default size
     *
     * @returns {void}
     */

    /**
     * enable window preview close button
     *
     * @returns {void}
     */
    windowPreviewCloseButtonEnable()
    {
        this.UIStyleClassRemove(this.#getAPIClassname('no-window-close'));
    }

    /**
     * disable window preview close button
     *
     * @returns {void}
     */

    /**
     * disable window preview close button
     *
     * @returns {void}
     */
    windowPreviewCloseButtonDisable()
    {
        this.UIStyleClassAdd(this.#getAPIClassname('no-window-close'));
    }

    /**
     * enable ripple box
     *
     * @returns {void}
     */

    /**
     * disable the removal of switcher popup delay
     *
     * @returns {void}
     */
    switcherPopupDelaySetDefault()
    {
        let SwitcherPopupProto = this._switcherPopup.SwitcherPopup.prototype;

        if (!SwitcherPopupProto.showOld) {
            return;
        }

        SwitcherPopupProto.show = SwitcherPopupProto.showOld;
        delete(SwitcherPopupProto.showOld);
    }

    /**
     * enable the removal of switcher popup delay
     *
     * @returns {void}
     */

    /**
     * enable the removal of switcher popup delay
     *
     * @returns {void}
     */
    removeSwitcherPopupDelay()
    {
        let SwitcherPopupProto = this._switcherPopup.SwitcherPopup.prototype;

        if (!SwitcherPopupProto.showOld) {
            SwitcherPopupProto.showOld = SwitcherPopupProto.show;
        }

        SwitcherPopupProto.show = function (...args) {
            let res = this.showOld(...args);
            if (res) {
                this._showImmediately();
            }
            return res;
        };
    }

    /**
     * set default OSD position
     *
     * @returns {void}
     */

    /**
     * set default alt tab window preview size
     *
     * @returns {void}
     */
    altTabWindowPreviewSetDefaultSize()
    {
        if (!this.#originals['altTabWindowPreviewSize']) {
            return;
        }

        this.#altTabSizesSet(null, null, this.#originals['altTabWindowPreviewSize']);
    }

    /**
     * set alt tab window preview size
     *
     * @param {number} size 1-512
     *
     * @returns {void}
     */

    /**
     * set alt tab window preview size
     *
     * @param {number} size 1-512
     *
     * @returns {void}
     */
    altTabWindowPreviewSetSize(size)
    {
        if (size < 1 || size > 512) {
            return;
        }

        if (!this.#originals['altTabWindowPreviewSize']) {
            this.#originals['altTabWindowPreviewSize'] = this._altTab.WINDOW_PREVIEW_SIZE;
        }

        this.#altTabSizesSet(null, null, size);
    }

    /**
     * set default alt tab icon size
     *
     * @returns {void}
     */

    /**
     * set default alt tab icon size
     *
     * @returns {void}
     */
    altTabIconSetDefaultSize()
    {
        if (!this.#originals['altTabAppIconSize']) {
            return;
        }

        this.#altTabSizesSet(this.#originals['altTabAppIconSize'], null, null);
    }

    /**
     * set alt tab icon size
     *
     * @param {number} size 1-512
     *
     * @returns {void}
     */

    /**
     * set alt tab icon size
     *
     * @param {number} size 1-512
     *
     * @returns {void}
     */
    altTabIconSetSize(size)
    {
        if (size < 1 || size > 512) {
            return;
        }

        if (!this.#originals['altTabAppIconSize']) {
            this.#originals['altTabAppIconSize'] = this._altTab.APP_ICON_SIZE;
        }

        this.#altTabSizesSet(size, null, null);
    }

    /**
     * enable screen sharing indicator
     *
     * @returns {void}
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
    UIStyleClassRemove(classname)
    {
        this._main.layoutManager.uiGroup.remove_style_class_name(classname);
    }
}
