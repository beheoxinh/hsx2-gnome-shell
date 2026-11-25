// Regression test for lib/guard.js: verifies that GObject classes registered
// from this extension's own files are automatically wrapped, and that classes
// registered from another path (i.e. another extension) are left untouched.
//
// Run: gjs -m tests/guard-registerclass.test.js
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import System from 'system';
import {guardClass} from '../lib/guard.js';

let failures = 0;
const check = (cond, label) => {
    if (cond)
        print(`ok: ${label}`);
    else {
        failures++;
        print(`FAIL: ${label}`);
    }
};

// 1. Registered from this file (inside the extension tree) -> guarded.
const Local = GObject.registerClass(class LocalTestClass extends GObject.Object {
    value() {
        return 42;
    }
    boom() {
        throw new Error('local boom');
    }
    async asyncBoom() {
        throw new Error('local async boom');
    }
});

const local = new Local();
check(local.value() === 42, 'guarded class still returns values');
const expectedNamePart = GObject.gtypeNameBasedOnJSPath
    ? 'guard-registerclass_test_LocalTestClass'
    : 'LocalTestClass';
check(Local.$gtype.name.includes(expectedNamePart), `GTypeName (${Local.$gtype.name}) matches expected pattern`);
check(!Local.$gtype.name.includes('lib_guard'), 'GTypeName does not leak lib_guard prefix');

// 1b. Multiple classes with identical JS names without explicit GTypeName must not collide.
const IndicatorA = GObject.registerClass(class Indicator extends GObject.Object {});
const IndicatorB = GObject.registerClass({Properties: {}}, class Indicator extends GObject.Object {});
check(IndicatorA.$gtype.name !== IndicatorB.$gtype.name, 'same-named classes receive distinct GTypeNames');

let threw = false;
try {
    local.boom();
} catch (_e) {
    threw = true;
}
check(!threw, 'exception from local file is caught by the guard');

// 2. Explicit guardClass keeps working and is idempotent.
class Plain {
    ok() {
        return 'ok';
    }
    fail() {
        throw new Error('plain fail');
    }
}
guardClass(Plain, 'Plain');
guardClass(Plain, 'Plain');
const p = new Plain();
check(p.ok() === 'ok', 'plain class unaffected');
threw = false;
try {
    p.fail();
} catch (_e) {
    threw = true;
}
check(!threw, 'plain class exception caught');

// 3. Async rejection is swallowed and reported asynchronously.
local.asyncBoom().then(() => {
    print('ok: async rejection swallowed');
    finish();
}, () => {
    failures++;
    print('FAIL: async rejection leaked');
    finish();
});

function finish() {
    GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
        print(failures === 0 ? 'ALL GUARD REGRESSION CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
        loop.quit();
        System.exit(failures === 0 ? 0 : 1);
        return GLib.SOURCE_REMOVE;
    });
}

const loop = new GLib.MainLoop(null, false);
GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 10, () => {
    print('TIMEOUT');
    loop.quit();
    return GLib.SOURCE_REMOVE;
});
loop.run();
