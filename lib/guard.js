// Central error boundary for the whole extension suite.
//
// Why this exists: an exception that escapes into the shell main loop aborts
// the emission it was raised from and leaves actors half torn down, which is
// what produced the "has been already disposed" storms after lock/logout. Every
// entry point is therefore wrapped so a failure is logged with a traceable
// "<tag>.<method>" label and the shell keeps running.
//
// Logging policy: warnings and errors only. No info or debug output.
//
// Two layers:
//   1. installRegisterClassGuard() patches GObject.registerClass, so every
//      GObject class registered after this module is imported gets its
//      prototype and static methods wrapped automatically.
//   2. guardClass(Klass, tag) does the same for plain classes and for
//      Extension subclasses, which do not go through GObject.registerClass.

import Gio from 'gi://Gio';
import GObject from 'gi://GObject';

const TAG = '[alienware-guard]';
const GUARDED = Symbol.for('alienware.guard.wrapped');

// Rate limiter: a broken callback can fire on every frame, and thousands of
// identical lines in the journal hide the first (useful) one.
const WINDOW_MS = 5000;
const MAX_PER_WINDOW = 20;
let windowStart = 0;
let windowCount = 0;
let suppressed = 0;
// Same context + same message is only reported once per window; the counter
// keeps repeating errors visible without flooding.
const seen = new Map();

function describe(error) {
    try {
        if (error instanceof Error || typeof error?.message === 'string')
            return String(error.message || error.name || 'Error');
        return String(error);
    } catch (_e) {
        return 'unreadable error';
    }
}

/**
 * Log one caught error. Never throws, never recurses into the guard.
 * @param {unknown} error the caught value
 * @param {string} context where it happened, e.g. "MediaIndicator._performUpdate"
 */
export function logWarn(error, context = 'unknown') {
    try {
        const now = Date.now();
        if (now - windowStart > WINDOW_MS) {
            if (suppressed > 0)
                console.warn(`${TAG} suppressed ${suppressed} further error(s) in the previous window`);
            windowStart = now;
            windowCount = 0;
            suppressed = 0;
            seen.clear();
        }

        const message = describe(error);
        const key = `${context}\u0000${message}`;
        const hits = (seen.get(key) ?? 0) + 1;
        seen.set(key, hits);

        if (hits > 1) {
            if (hits % 50 === 0)
                console.warn(`${TAG} ${context}: ${message} (repeated ${hits} times)`);
            return;
        }

        if (windowCount >= MAX_PER_WINDOW) {
            suppressed++;
            return;
        }
        windowCount++;

        console.warn(`${TAG} ${context}: ${message}`);
        const stack = error?.stack;
        if (typeof stack === 'string' && stack.length > 0) {
            // First few lines are enough to locate the throw site; the full
            // stack is available by re-running with the context label.
            const head = stack.split('\n').slice(0, 5).join('\n');
            console.warn(`${TAG} ${context} stack:\n${head}`);
        }
    } catch (_e) {
        // Logging must never be the reason something breaks.
    }
}

function wrapFunction(original, label) {
    const isAsync = original.constructor?.name === 'AsyncFunction';
    if (isAsync) {
        const wrapped = async function (...args) {
            try {
                return await original.apply(this, args);
            } catch (e) {
                if (e?.matches && (
                    e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED) ||
                    e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS) ||
                    e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.PENDING))) {
                    throw e;
                }
                logWarn(e, label);
                return undefined;
            }
        };
        try { Object.defineProperty(wrapped, 'name', {value: original.name || label}); } catch (_e) {}
        return wrapped;
    }

    const wrapped = function (...args) {
        try {
            return original.apply(this, args);
        } catch (e) {
            if (e?.matches && (
                e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED) ||
                e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS) ||
                e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.PENDING))) {
                throw e;
            }
            logWarn(e, label);
            return undefined;
        }
    };
    try { Object.defineProperty(wrapped, 'name', {value: original.name || label}); } catch (_e) {}
    return wrapped;
}

function wrapMethodTable(target, tag) {
    if (!target || (typeof target !== 'object' && typeof target !== 'function'))
        return;

    const names = Object.getOwnPropertyNames(target);
    for (const key of names) {
        // 'constructor' must stay untouched; GObject vfuncs are resolved by
        // GJS from the class metadata and must not be replaced with wrappers.
        if (key === 'constructor' || key === 'prototype' || key === 'length' ||
            key === 'name' || key === 'caller' || key === 'arguments')
            continue;
        if (key.startsWith('vfunc_'))
            continue;

        let desc;
        try {
            desc = Object.getOwnPropertyDescriptor(target, key);
        } catch (_e) {
            continue;
        }
        if (!desc || typeof desc.value !== 'function')
            continue;  // getters and setters stay as they are

        try {
            desc.value = wrapFunction(desc.value, `${tag}.${key}`);
            Object.defineProperty(target, key, desc);
        } catch (_e) {
            // Non-writable method: leave it alone rather than break the class.
        }
    }
}

/**
 * Wrap every method of a class (prototype + static methods).
 * @param {Function} Klass class constructor
 * @param {string} tag label used in log messages
 * @returns {Function} the same class, for chaining
 */
export function guardClass(Klass, tag) {
    if (typeof Klass !== 'function' || !Klass.prototype)
        return Klass;

    try {
        if (Klass.prototype[GUARDED])
            return Klass;
    } catch (_e) {
        return Klass;
    }

    const label = tag || Klass.name || 'AnonymousClass';

    wrapMethodTable(Klass.prototype, label);

    // Static helpers (getInstance, load, etc.) can throw just as well.
    for (const key of Object.getOwnPropertyNames(Klass)) {
        if (key === 'prototype' || key === 'length' || key === 'name')
            continue;
        let desc;
        try {
            desc = Object.getOwnPropertyDescriptor(Klass, key);
        } catch (_e) {
            continue;
        }
        if (!desc || typeof desc.value !== 'function')
            continue;
        try {
            desc.value = wrapFunction(desc.value, `${label}.${key}`);
            Object.defineProperty(Klass, key, desc);
        } catch (_e) {}
    }

    try {
        Object.defineProperty(Klass.prototype, GUARDED, {value: true});
    } catch (_e) {}

    return Klass;
}

/**
 * Wrap a single function or callback with the same logging policy.
 * Use it for signal handlers, GLib timeouts and D-Bus callbacks that are
 * defined inline instead of on a class.
 */
export function safeFn(tag, fn) {
    if (typeof fn !== 'function')
        return fn;
    return wrapFunction(fn, tag);
}

let installed = false;

/**
 * Patch GObject.registerClass so every class registered afterwards is guarded.
 * Must run before module files are evaluated; lib/guard.js does it on import and
 * extension.js imports it first.
 */
export function installRegisterClassGuard() {
    if (installed)
        return;
    installed = true;

    try {
        const originalRegisterClass = GObject.registerClass;
        if (typeof originalRegisterClass !== 'function')
            return;

        GObject.registerClass = function (...args) {
            const Klass = originalRegisterClass.apply(this, args);
            try {
                // The patch is process-global, so other extensions in the same
                // shell would be affected too. Only guard registrations that
                // come from this extension's own files, identified by the
                // caller path in the stack.
                const stack = new Error().stack || '';
                if (stack.includes('alienware-hsx2coder-gnome@hsx2coder.github.com'))
                    guardClass(Klass, Klass?.name || 'GObjectClass');
            } catch (e) {
                logWarn(e, 'installRegisterClassGuard');
            }
            return Klass;
        };
        GObject.__alienwareGuarded = true;
    } catch (e) {
        logWarn(e, 'installRegisterClassGuard');
    }
}

// Side effect on import: modules are evaluated after their importer's import
// list is resolved, so being the first import of the suite entry point is
// enough to cover every GObject class in the tree.
installRegisterClassGuard();
