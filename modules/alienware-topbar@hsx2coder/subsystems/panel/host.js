/**
 * PanelHost — the single door to the GNOME Shell top bar.
 *
 * Only this module may touch Main.panel, its _leftBox / _centerBox / _rightBox
 * or its statusArea. Other modules ask PanelHost instead, so no module has to
 * reach across a module boundary to get at the bar.
 *
 * PanelApi (moved out of the old shared gnome-customizer-manager engine) is the
 * implementation behind it; its method bodies are unchanged.
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as BackgroundMenu from 'resource:///org/gnome/shell/ui/backgroundMenu.js';
import * as Search from 'resource:///org/gnome/shell/ui/search.js';
import * as OverviewControls from 'resource:///org/gnome/shell/ui/overviewControls.js';
import * as WorkspaceThumbnail from 'resource:///org/gnome/shell/ui/workspaceThumbnail.js';
import * as WorkspacesView from 'resource:///org/gnome/shell/ui/workspacesView.js';
import * as WindowPreview from 'resource:///org/gnome/shell/ui/windowPreview.js';

import {PanelApi} from './api.js';

const BOXES = ['left', 'center', 'right'];

export const SIDE = {LEFT: 0, CENTER: 1, RIGHT: 2};

class PanelHostImpl {
    #api = null;
    #listeners = new Set();
    /** role -> actor, so remove() reaches the same object add() created even
     *  when a dash-to-panel override reroutes addToStatusArea elsewhere */
    #owned = new Map();

    get api() {
        return this.#api;
    }

    get available() {
        return this.#api !== null;
    }

    get panel() {
        return Main.panel;
    }

    get statusArea() {
        return Main.panel?.statusArea ?? null;
    }

    /**
     * @param {number} shellVersion major GNOME Shell version
     */
    enable(shellVersion) {
        if (this.#api)
            return;

        this.#api = new PanelApi({
            'Main': Main,
            'PanelMenu': PanelMenu,
            'BackgroundMenu': BackgroundMenu,
            'Search': Search,
            'SearchController': Search.SearchController
                ? Search.SearchController.get_default()
                : null,
            'InterfaceSettings': new Gio.Settings({schema_id: 'org.gnome.desktop.interface'}),
            'OverviewControls': OverviewControls,
            'WorkspaceThumbnail': WorkspaceThumbnail,
            'WorkspacesView': WorkspacesView,
            'WindowPreview': WindowPreview,
            'St': St,
            'GLib': GLib,
            'Clutter': Clutter,
            'Meta': Meta,
            'GObject': GObject,
        }, shellVersion);

        this.#api.open();
        this.#emit();
    }

    disable() {
        for (const actor of this.#owned.values()) {
            try {
                actor.destroy();
            } catch (_) {
                /* already gone */
            }
        }
        this.#owned.clear();
        this.#api?.close();
        this.#api = null;
        this.#emit();
    }

    // ── consumers ────────────────────────────────────────────────────────

    /**
     * Add an indicator to the status area. box is 'right' (default), 'center'
     * or 'left'. Goes through Main.panel.addToStatusArea on purpose so a
     * dash-to-panel override installed on the panel object is still honoured.
     */
    addStatusItem(role, indicator, position = 0, box = 'right') {
        const target = this.getBox(box);
        if (!target) {
            logError(new Error('no panel'), `[alienware-topbar] cannot add ${role}`);
            return null;
        }
        this.#owned.get(role)?.destroy();
        this.#owned.set(role, indicator);
        return Main.panel.addToStatusArea(role, indicator, position, target);
    }

    /** The actor PanelHost added for this role, or undefined. */
    getStatusItem(role) {
        return this.#owned.get(role) ?? Main.panel?.statusArea?.[role];
    }

    hasStatusItem(role) {
        return this.#owned.has(role) || !!Main.panel?.statusArea?.[role];
    }

    /** Same as addStatusItem but for raw actors that are not indicators. */
    addPanelBoxItem(role, actor, position = 0, box = 'right') {
        const target = this.getBox(box);
        if (!target) {
            logError(new Error('no panel'), `[alienware-topbar] cannot add ${role}`);
            return null;
        }
        this.#owned.get(role)?.destroy();
        this.#owned.set(role, actor);
        if (typeof Main.panel._addToPanelBox === 'function')
            return Main.panel._addToPanelBox(role, actor, position, target);
        return Main.panel.addToStatusArea(role, actor, position, target);
    }

    /**
     * Put an actor in the shell's chrome layer, so a cloned or injected bar
     * participates in fullscreen, workspace and monitor-change handling.
     * @param {Clutter.Actor} actor
     * @param {object} params trackFullscreen, affectsStruts, affectsInputRegion
     */
    addChrome(actor, params) {
        try {
            this.#api?.chromeAdd(actor, params);
        } catch (e) {
            logError(e, '[alienware-topbar] addChrome failed');
            return false;
        }
        return true;
    }

    removeChrome(actor) {
        // never let a failed remove abort the caller's teardown loop
        try {
            this.#api?.chromeRemove(actor);
        } catch (e) {
            logError(e, '[alienware-topbar] removeChrome failed');
            return false;
        }
        return true;
    }

    removeStatusItem(role) {
        const actor = this.getStatusItem(role);
        this.#owned.delete(role);
        if (!actor)
            return false;
        actor.destroy();
        return true;
    }

    /** @param {'left'|'center'|'right'} side */
    getBox(side) {
        // null-safe: consumers call this from their own enable(), which may run
        // before the panel exists (and when this module is disabled entirely)
        const panel = Main.panel;
        switch (side) {
        case 'left':
            return panel?._leftBox ?? null;
        case 'center':
            return panel?._centerBox ?? null;
        default:
            return panel?._rightBox ?? null;
        }
    }

    /** Clamp a stored integer position onto a valid side name. */
    sideForIndex(index) {
        if (typeof index === 'string')
            return index;
        return BOXES[Math.max(0, Math.min(BOXES.length - 1, Number(index) || 0))];
    }

    /** Notify consumers when the panel engine came up or went down. */
    watch(cb) {
        this.#listeners.add(cb);
        return () => this.#listeners.delete(cb);
    }

    #emit() {
        for (const cb of this.#listeners) {
            try {
                cb();
            } catch (e) {
                logError(e, '[alienware-topbar] PanelHost listener failed');
            }
        }
    }
}

export const PanelHost = new PanelHostImpl();
