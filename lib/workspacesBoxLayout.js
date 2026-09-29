/**
 * Shared patch for ControlsManagerLayout._computeWorkspacesBoxForState.
 *
 * Two different features adjust the workspace box while the overview is open:
 * the search entry (owned by the top bar module) and the "workspaces in app
 * grid" height (owned by the customizer). Before the suite was split by domain
 * both lived in one class and shared a single patch. After the split each would
 * save and restore the same shell function independently, and whichever module
 * unregistered last would restore the *other* module's wrapper and leak it.
 *
 * This module therefore owns the patch. Callers register one patch record and
 * keep mutating its fields; the shell function is restored once the last record
 * is unregistered, in any order.
 *
 * Recognised record fields (all optional):
 *   searchEntryVisible - when false, ask the layout for extra top spacing
 *   appGridHeight      - when set, force the box height while in the app grid
 */

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {ControlsState} from 'resource:///org/gnome/shell/ui/overviewControls.js';

const EXTRA_SPACING_WITHOUT_SEARCH = 40;

const records = new Set();
let original = null;

function layout() {
    return Main.overview?._overview?._controls?.layout_manager ?? null;
}

function install() {
    if (original)
        return;
    const controlsLayout = layout();
    if (!controlsLayout)
        return;

    original = controlsLayout._computeWorkspacesBoxForState;

    controlsLayout._computeWorkspacesBoxForState = (state, box, searchHeight, ...args) => {
        const inAppGrid = state === ControlsState.APP_GRID;

        if (inAppGrid) {
            for (const rec of records) {
                if (rec.searchEntryVisible === false)
                    searchHeight = EXTRA_SPACING_WITHOUT_SEARCH;
            }
        }

        const result = original.call(controlsLayout, state, box, searchHeight, ...args);

        if (inAppGrid) {
            for (const rec of records) {
                if (rec.appGridHeight !== undefined)
                    result.set_size(result.get_width(), rec.appGridHeight);
            }
        }

        return result;
    };
}

function uninstall() {
    if (records.size > 0 || !original)
        return;
    const controlsLayout = layout();
    if (controlsLayout)
        controlsLayout._computeWorkspacesBoxForState = original;
    original = null;
}

/**
 * @param {{searchEntryVisible?: boolean, appGridHeight?: number}} record
 * @returns {() => void} unsubscribe
 */
export function addWorkspacesBoxPatch(record) {
    records.add(record);
    install();
    return () => {
        records.delete(record);
        uninstall();
    };
}

/** True while the shell function is patched. Used by the suite self-checks. */
export function hasWorkspacesBoxPatch() {
    return original !== null;
}
