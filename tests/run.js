#!/usr/bin/env gjs
// Minimal GJS headless test runner for Alienware Suite.
// Usage: gjs -m tests/run.js [test-file...]
// Each test file exports function run(ctx) or array of [name, fn].
// Exit 0 all pass, 1 any fail.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

let pass = 0;
let fail = 0;
const failures = [];

export function assert(cond, msg) {
    if (!cond)
        throw new Error(msg || 'assertion failed');
}

export function assertEqual(a, b, msg) {
    if (a !== b)
        throw new Error(`${msg || 'not equal'}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
}

async function runFile(path) {
    const mod = await import(`file://${path}`);
    const cases = typeof mod.run === 'function' ? await mod.run({ assert, assertEqual }) : mod.default;
    if (Array.isArray(cases)) {
        for (const [name, fn] of cases) {
            try {
                await fn();
                pass++;
                print(`${GREEN}PASS${RESET} ${path} :: ${name}`);
            } catch (e) {
                fail++;
                failures.push(`${path} :: ${name}: ${e.message}`);
                print(`${RED}FAIL${RESET} ${path} :: ${name}: ${e.message}`);
            }
        }
    } else {
        // run() already asserted internally
        pass++;
        print(`${GREEN}PASS${RESET} ${path}`);
    }
}

export async function main(argv) {
    const dir = Gio.File.new_for_path('tests').get_path()
        || GLib.get_current_dir() + '/tests';
    let files = argv.slice(1);
    if (!files.length) {
        const d = Gio.File.new_for_path('tests');
        const e = d.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
        let info;
        files = [];
        while ((info = e.next_file(null)))
            if (info.get_name().startsWith('test-') && info.get_name().endsWith('.js'))
                files.push('tests/' + info.get_name());
    }
    for (const f of files) {
        try {
            await runFile(GLib.get_current_dir() + '/' + f);
        } catch (e) {
            fail++;
            failures.push(`${f}: load error: ${e.message}`);
            print(`${RED}FAIL${RESET} ${f}: load error: ${e.message}`);
        }
    }
    print(`\n${pass} passed, ${fail} failed`);
    if (failures.length) {
        print('Failures:');
        for (const f of failures)
            print('  ' + f);
    }
    return fail ? 1 : 0;
}

// gjs -m entry: top-level await supported
const status = await main(ARGV);
imports.system.exit(status);
