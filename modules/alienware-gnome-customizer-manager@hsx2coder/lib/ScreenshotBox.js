import GLib from 'gi://GLib';
import St from 'gi://St';
import {InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class ScreenshotBox
{
    #settings = null;
    #removePreselectedBox = true;
    #screenshotOnRelease = true;
    #injectionManager = null;
    #areaSelector = null;
    #retryId = 0;
    #selectionRectOpacity = null;
    #handleOpacities = null;
    #attemptCount = 0;
    #capturing = false;
    #cssProvider = null;
    #dimensionLabel = null;
    #isDragging = false;
    #dragUpdateId = 0;
    #origUpdateRect = null;
    #cleanupId = 0;

    constructor(dependencies)
    {
        this.#settings = dependencies['Settings'] || null;
        this.#cssProvider = new St.CssProvider();
    }

    enable()
    {
        this.#attemptCount = 0;
        this.#capturing = false;
        this.#isDragging = false;
        this.#handleOpacities = new Map();
        this.#injectionManager = new InjectionManager();

        this.#ensureDimensionLabel();

        this.#settings?.disconnectObject(this);
        this.#refreshRemovePreselectedBox();
        this.#refreshScreenshotOnRelease();

        this.#settings?.connectObject(
            'changed::remove-preselected-box',
            () => {
                this.#refreshRemovePreselectedBox();
                this.#applyCss();
                if (this.#areaSelector)
                    this.#applyPatch(this.#areaSelector);
            },
            this
        );

        this.#settings?.connectObject(
            'changed::screenshot-on-release',
            () => this.#refreshScreenshotOnRelease(),
            this
        );

        this.#addScreenshotUICleanupMonitor();
        this.#applyCss();
        this.#patchWhenReady();
    }

    disable()
    {
        if (this.#retryId) {
            GLib.source_remove(this.#retryId);
            this.#retryId = 0;
        }

        if (this.#cleanupId) {
            GLib.source_remove(this.#cleanupId);
            this.#cleanupId = 0;
        }

        this.#stopDragUpdate();
        this.#isDragging = false;

        this.#restore();

        if (this.#dimensionLabel) {
            this.#dimensionLabel.destroy();
            this.#dimensionLabel = null;
        }

        this.#settings?.disconnectObject(this);
        this.#removeCss();

        this.#injectionManager = null;
        this.#handleOpacities = null;
        this.#selectionRectOpacity = null;
        this.#capturing = false;
    }

    #refreshRemovePreselectedBox()
    {
        this.#removePreselectedBox
            = this.#settings?.get_boolean('remove-preselected-box') ?? true;
    }

    #refreshScreenshotOnRelease()
    {
        this.#screenshotOnRelease
            = this.#settings?.get_boolean('screenshot-on-release') ?? true;
    }

    #addScreenshotUICleanupMonitor()
    {
        if (this.#cleanupId)
            return;

        this.#cleanupId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
            if (!Main?.screenshotUI && !this.#isDragging) {
                if (this.#dimensionLabel)
                    this.#dimensionLabel.hide();
            }
            return GLib.SOURCE_CONTINUE;
        });
    }

    #applyCss()
    {
        if (!this.#removePreselectedBox) {
            this.#removeCss();
            return;
        }

        if (!this.#cssProvider)
            return;

        this.#cssProvider.load_from_data(`
            .screenshot-ui-area-indicator-selection {
                border: 2px dashed rgba(180, 180, 180, 0.9) !important;
                border-radius: 0 !important;
                background-color: transparent !important;
                box-shadow: none !important;
            }
            .screenshot-ui-area-selector-handle {
                width: 0 !important;
                height: 0 !important;
                min-width: 0 !important;
                min-height: 0 !important;
                padding: 0 !important;
                margin: 0 !important;
                background: transparent !important;
                border: 0 !important;
                box-shadow: none !important;
                opacity: 0 !important;
                pointer-events: none !important;
            }
        `, -1);

        St.ThemeContext.get_for_stage(global.stage).add_provider(this.#cssProvider);
    }

    #removeCss()
    {
        if (!this.#cssProvider)
            return;

        St.ThemeContext.get_for_stage(global.stage).remove_provider(this.#cssProvider);
    }

    #patchWhenReady()
    {
        const maxAttempts = 20;
        const attempt = () => {
            this.#attemptCount++;

            const areaSelector = this.#getAreaSelector();
            if (!areaSelector) {
                if (this.#attemptCount >= maxAttempts)
                    return true;
                return false;
            }

            this.#applyPatch(areaSelector);
            return true;
        };

        if (attempt())
            return;

        this.#retryId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
            if (attempt()) {
                this.#retryId = 0;
                return GLib.SOURCE_REMOVE;
            }
            return GLib.SOURCE_CONTINUE;
        });
    }

    #applyPatch(areaSelector)
    {
        this.#restore();
        this.#areaSelector = areaSelector;

        this.#applyCss();

        if (this.#removePreselectedBox && areaSelector.reset && this.#injectionManager) {
            this.#injectionManager.overrideMethod(areaSelector, 'reset',
                originalReset => (...args) => {
                    const result = originalReset?.apply(areaSelector, args);
                    this.#clearSelection(areaSelector);
                    return result;
                }
            );
        }

        this.#origUpdateRect = areaSelector._updateSelectionRect.bind(areaSelector);
        areaSelector._updateSelectionRect = () => {
            this.#origUpdateRect();
            this.#updateDimensionLabel(areaSelector);
        };

        if (this.#removePreselectedBox) {
            areaSelector.connectObject('drag-started',
                () => {
                    this.#dimensionLabel?.hide();
                    this.#revealSelection(areaSelector);
                    this.#isDragging = true;
                    this.#startDragUpdate();
                },
                this
            );
        }

        areaSelector.connectObject('drag-ended',
            () => {
                this.#isDragging = false;
                this.#stopDragUpdate();
                this.#updateDimensionLabel(areaSelector);
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 0, () => {
                    this.#autoCapture(areaSelector);
                    return GLib.SOURCE_REMOVE;
                });
            },
            this
        );

        if (this.#removePreselectedBox)
            this.#clearSelection(areaSelector);
    }

    #startDragUpdate()
    {
        if (this.#dragUpdateId)
            return;

        this.#dragUpdateId = GLib.timeout_add(GLib.PRIORITY_HIGH, 50, () => {
            try {
                if (!this.#isDragging || !this.#areaSelector) {
                    this.#dragUpdateId = 0;
                    return GLib.SOURCE_REMOVE;
                }
                this.#updateDimensionLabel(this.#areaSelector);
            } catch (e) {
                console.error('[ScreenshotBox] drag update error:', e);
            }
            return GLib.SOURCE_CONTINUE;
        });
    }

    #stopDragUpdate()
    {
        if (!this.#dragUpdateId)
            return;

        GLib.source_remove(this.#dragUpdateId);
        this.#dragUpdateId = 0;
    }

    #ensureDimensionLabel()
    {
        if (this.#dimensionLabel)
            return;

        this.#dimensionLabel = new St.Label({
            text: '',
            style: 'font-size: 13px; font-weight: bold; color: #ffffff; background-color: rgba(0,0,0,0.6); border-radius: 6px; padding: 3px 8px;',
            visible: false,
            reactive: false,
            can_focus: false,
        });
        global.stage.add_child(this.#dimensionLabel);
    }

    #updateDimensionLabel(areaSelector)
    {
        if (!this.#dimensionLabel)
            return;

        const [x, y, w, h] = areaSelector.getGeometry();
        if (w <= 0 || h <= 0) {
            if (!this.#isDragging)
                this.#dimensionLabel.hide();
            return;
        }

        const text = `${w} x ${h}`;
        this.#dimensionLabel.text = text;

        const [selX, selY] = areaSelector.get_transformed_position();
        const labelW = Math.min(w, 160);
        this.#dimensionLabel.set_position(
            selX + x + Math.round((w - labelW) / 2),
            selY + y + h + 10
        );
        this.#dimensionLabel.width = labelW;
        this.#dimensionLabel.show();
    }

    #restore()
    {
        if (this.#areaSelector && this.#origUpdateRect) {
            this.#areaSelector._updateSelectionRect = this.#origUpdateRect;
        }
        this.#origUpdateRect = null;

        this.#injectionManager?.clear();

        if (!this.#areaSelector)
            return;

        const areaSelector = this.#areaSelector;
        areaSelector.disconnectObject(this);

        const selectionRect = this.#getSelectionRect(areaSelector);
        if (selectionRect && this.#selectionRectOpacity !== null)
            selectionRect.opacity = this.#selectionRectOpacity;
        this.#selectionRectOpacity = null;

        if (this.#handleOpacities) {
            for (const [name, actor] of this.#getHandles(areaSelector)) {
                const original = this.#handleOpacities.get(name);
                if (actor && original !== undefined)
                    actor.opacity = original;
            }
            this.#handleOpacities.clear();
        }

        this.#areaSelector = null;
    }

    #getAreaSelector()
    {
        return Main?.screenshotUI?._areaSelector ?? null;
    }

    #clearSelection(areaSelector)
    {
        if ('_startX' in areaSelector)
            areaSelector._startX = 0;
        if ('_startY' in areaSelector)
            areaSelector._startY = 0;
        if ('_lastX' in areaSelector)
            areaSelector._lastX = 0;
        if ('_lastY' in areaSelector)
            areaSelector._lastY = 0;

        areaSelector._updateSelectionRect();

        if (!this.#handleOpacities)
            this.#handleOpacities = new Map();

        for (const [name, actor] of this.#getHandles(areaSelector)) {
            if (!actor)
                continue;
            if (!this.#handleOpacities.has(name))
                this.#handleOpacities.set(name, actor.opacity);
            actor.opacity = 0;
        }

        const selectionRect = this.#getSelectionRect(areaSelector);
        if (selectionRect) {
            if (this.#selectionRectOpacity === null)
                this.#selectionRectOpacity = selectionRect.opacity;
            selectionRect.opacity = 0;
        }
    }

    #revealSelection(areaSelector)
    {
        const selectionRect = this.#getSelectionRect(areaSelector);
        if (selectionRect && this.#selectionRectOpacity !== null)
            selectionRect.opacity = this.#selectionRectOpacity;

        for (const [, actor] of this.#getHandles(areaSelector)) {
            if (actor)
                actor.opacity = 0;
        }
    }

    #getSelectionRect(areaSelector)
    {
        if (areaSelector._selectionRect)
            return areaSelector._selectionRect;
        if (areaSelector._areaIndicator?.['_selectionRect'])
            return areaSelector._areaIndicator._selectionRect;
        return null;
    }

    #getHandles(areaSelector)
    {
        const names = [
            '_topLeftHandle',
            '_topRightHandle',
            '_bottomLeftHandle',
            '_bottomRightHandle',
        ];
        return names.map(name => [name, areaSelector[name]]);
    }

    async #autoCapture(areaSelector)
    {
        if (!this.#screenshotOnRelease)
            return;

        const screenshotUI = Main?.screenshotUI;
        if (!screenshotUI)
            return;

        if (!screenshotUI._selectionButton?.checked)
            return;
        if (!screenshotUI._shotButton?.checked)
            return;

        const [,, w, h] = areaSelector.getGeometry();
        if (w <= 2 || h <= 2)
            return;

        if (this.#capturing)
            return;
        this.#capturing = true;

        try {
            if (screenshotUI._onCaptureButtonClicked) {
                await screenshotUI._onCaptureButtonClicked.call(screenshotUI);
            } else if (screenshotUI._saveScreenshot) {
                await screenshotUI._saveScreenshot.call(screenshotUI);
                screenshotUI.close?.(true);
            }
        } catch (_e) {
            // silent
        } finally {
            this.#capturing = false;
        }
    }
}
