// Pure-function tests: NC settings defaults + themes/constants + event emitter (headless-safe).
import { SettingsManager } from '../modules/alienware-gnome-customizer-manager@hsx2coder/subsystems/notification-configurator/utils/settings.js';
import { DEFAULT_THEME } from '../modules/alienware-gnome-customizer-manager@hsx2coder/subsystems/notification-configurator/utils/constants.js';
import { NOTIFICATIONS_PER_SOURCE_DEFAULT } from '../modules/alienware-gnome-customizer-manager@hsx2coder/subsystems/notification-configurator/utils/settings.js';
import { TypedEventEmitter } from '../modules/alienware-gnome-customizer-manager@hsx2coder/subsystems/notification-configurator/utils/event-emitter.js';

export const tests = [
    ['defaults: enabled true', () => {
        const c = SettingsManager.defaultGlobalConfiguration();
        if (c.enabled !== true) throw new Error('enabled');
    }],
    ['defaults: notificationCenter shape', () => {
        const c = SettingsManager.defaultGlobalConfiguration();
        if (c.notificationCenter.disableGrouping !== false) throw new Error('grouping');
        if (c.notificationCenter.maximumPerSource !== NOTIFICATIONS_PER_SOURCE_DEFAULT) throw new Error('perSource');
    }],
    ['defaults: rateLimiting shape', () => {
        const c = SettingsManager.defaultGlobalConfiguration();
        if (c.rateLimiting.enabled !== true) throw new Error('rl-enabled');
        if (c.rateLimiting.notificationThreshold !== 5000) throw new Error('rl-threshold');
        if (c.rateLimiting.action !== 'close') throw new Error('rl-action');
    }],
    ['defaults: timeout shape', () => {
        const c = SettingsManager.defaultGlobalConfiguration();
        if (c.timeout.enabled !== true) throw new Error('to-enabled');
        if (c.timeout.notificationTimeout !== 4000) throw new Error('to-timeout');
        if (c.timeout.ignoreIdle !== true) throw new Error('to-idle');
    }],
    ['defaults: urgency/display/colors/margins keys', () => {
        const c = SettingsManager.defaultGlobalConfiguration();
        if (typeof c.urgency.alwaysNormalUrgency !== 'boolean') throw new Error('urgency');
        if (typeof c.display.enableFullscreen !== 'boolean') throw new Error('display');
        if (!c.colors || !c.margins || !c.windowAttention) throw new Error('keys');
    }],
    ['DEFAULT_THEME: rgba arrays', () => {
        for (const k of ['appNameColor', 'timeColor', 'backgroundColor']) {
            const v = DEFAULT_THEME[k];
            if (!Array.isArray(v) || v.length !== 4) throw new Error(k);
        }
    }],
    ['emitter: on + emit delivers', () => {
        const ee = new TypedEventEmitter();
        let got = 0;
        ee.on('x', () => { got++; });
        ee.emit('x');
        if (got !== 1) throw new Error('got=' + got);
    }],
    ['emitter: off stops delivery', () => {
        const ee = new TypedEventEmitter();
        let got = 0;
        const id = ee.on('x', () => { got++; });
        ee.emit('x');
        ee.off('x', id);
        ee.emit('x');
        if (got !== 1) throw new Error('got=' + got);
    }],
];
