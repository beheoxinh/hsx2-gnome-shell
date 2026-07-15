import GObject from 'gi://GObject';
import { SystemIndicator } from 'resource:///org/gnome/shell/ui/quickSettings.js';
import { TouchpadState } from './types.js';
const ICON_TOUCHPAD = 'input-touchpad-symbolic';
const ICON_TOUCHPAD_DISABLED = 'touchpad-disabled-symbolic';
const ICON_MOUSE_ONLY = 'input-mouse-symbolic';
/**
 * IconIndicator class
 * Represents the icon indicator in the system indicators menu.
 */
export const IconIndicator = GObject.registerClass({
    GTypeName: 'IconIndicator',
    Properties: {},
    Signals: {},
}, class IconIndicator extends SystemIndicator {
    icon;
    constructor() {
        super();
        this.icon = this._addIndicator();
    }
    /**
     * Update the icon.
     */
    updateState(state) {
        switch (state) {
            case TouchpadState.Disabled:
                this.icon.icon_name = ICON_TOUCHPAD_DISABLED;
                break;
            case TouchpadState.MouseOnly:
                this.icon.icon_name = ICON_MOUSE_ONLY;
                break;
            default:
                this.icon.icon_name = ICON_TOUCHPAD;
        }
    }
});
