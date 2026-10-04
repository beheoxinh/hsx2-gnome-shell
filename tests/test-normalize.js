// Pure-function tests: NC normalize utils (no Shell API, headless-safe).
import {
    normalizeAction,
    normalizePosition,
    normalizeVerticalPosition,
    normalizeBoolean,
} from '../modules/alienware-gnome-customizer-manager@hsx2coder/subsystems/notification-configurator/utils/normalize.js';

export default [
    ['normalizeAction: close/hide pass through', () => {
        if (normalizeAction('close') !== 'close') throw new Error('close');
        if (normalizeAction('hide') !== 'hide') throw new Error('hide');
    }],
    ['normalizeAction: garbage falls back', () => {
        if (normalizeAction('boom') !== 'hide') throw new Error('default fallback');
        if (normalizeAction('boom', 'close') !== 'close') throw new Error('custom fallback');
        if (normalizeAction(undefined) !== 'hide') throw new Error('undefined fallback');
    }],
    ['normalizePosition: valid values', () => {
        for (const v of ['left', 'center', 'right']) {
            if (normalizePosition(v) !== v) throw new Error(v);
        }
    }],
    ['normalizePosition: garbage defaults center', () => {
        if (normalizePosition('moon') !== 'center') throw new Error('fallback');
        if (normalizePosition(undefined) !== 'center') throw new Error('undefined');
    }],
    ['normalizeVerticalPosition: valid values', () => {
        for (const v of ['top', 'bottom']) {
            if (normalizeVerticalPosition(v) !== v) throw new Error(v);
        }
    }],
    ['normalizeVerticalPosition: garbage defaults top', () => {
        if (normalizeVerticalPosition('side') !== 'top') throw new Error('fallback');
    }],
    ['normalizeBoolean: strict true/false', () => {
        if (normalizeBoolean(true, false) !== true) throw new Error('true');
        if (normalizeBoolean(false, true) !== false) throw new Error('false');
        if (normalizeBoolean(1, false) !== false) throw new Error('truthy not bool');
        if (normalizeBoolean(undefined, true) !== true) throw new Error('fallback');
    }],
];
