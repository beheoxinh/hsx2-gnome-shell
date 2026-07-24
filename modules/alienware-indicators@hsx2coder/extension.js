import Gio from 'gi://Gio';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import AppIndicatorExtension from './subsystems/appindicator/extension.js';
import CapsNumTouchpadExtension from './subsystems/capsnum-touchpad/extension.js';

export default class IndicatorsExtension extends Extension {
    enable() {
        const baseMeta = {
            uuid: this.uuid,
            dir: this.dir,
            path: this.path,
            url: `file://${this.path}/`,
        };

        // AppIndicator — needs interfaces-xml in this.dir
        this._appIndicator = new AppIndicatorExtension({
            ...baseMeta,
            ...this.metadata,
            'settings-schema': 'org.gnome.shell.extensions.indicators-appindicator',
        });
        this._appIndicator.enable();

        // Caps/Num + Touchpad
        this._capsnum = new CapsNumTouchpadExtension({
            ...baseMeta,
            ...this.metadata,
            'settings-schema': 'org.gnome.shell.extensions.capsnum-touchpad',
        });
        this._capsnum.enable();
    }

    disable() {
        this._capsnum?.disable();
        this._capsnum = null;

        this._appIndicator?.disable();
        this._appIndicator = null;
    }
}
