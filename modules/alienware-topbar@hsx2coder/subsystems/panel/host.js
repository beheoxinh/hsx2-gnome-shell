/**
 * PanelHost — the single door to the GNOME Shell top bar.
 *
 * Only this module may touch Main.panel, its _leftBox / _centerBox / _rightBox
 * or its statusArea. Other modules ask PanelHost instead, which is why nothing
 * else in the suite needs Extension.lookupByUUID() to reach the panel.
 *
 * The PanelApi instance behind it was split out of the old shared
 * gnome-customizer-manager engine; its method bodies are unchanged.
 */

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Search from 'resource:///org/gnome/shell/ui/search.js';
import * as BackgroundMenu from 'resource:///org/gnome/shell/ui/backgroundMenu.js';
import * as OverviewControls from 'resource:///org/gnome/shell/ui/overviewControls.js';
import * as WorkspaceThumbnail from 'resource:///org/gnome/shell/ui/workspaceThumbnail.js';
import * as WorkspacesView from 'resource:///org/gnome/shell/ui/workspacesView.js';
import * as WindowPreview from 'resource:///org/gnome/shell/ui/windowPreview.js';

import St from 'gi://St';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import GObject from 'gi://GObject';

import {PanelApi} from './api.js';

const BOXES = ['left', 'center', 'right'];

class PanelHostImpl {
    #api = null;
    #signalIds = [];
    #listeners = new Set();

    get api() {
        return this.#api;
    }

    get panel() {
        return Main.panel;
    }

    get statusArea() {
        return Main.panel?.statusArea ?? null;
    }

    /**
     * @param {object} shellVersion config shellVersion from the suite
     */
    enable(shellVersion) {
        if (this.#api)
            return;

        this.#api = new PanelApi({
            'Main': Main,
            'PanelMenu': PanelMenu,
            'PopupMenu': PopupMenu,
            'BackgroundMenu': BackgroundMenu,
            'Search': Search,
            'SearchController': Search.SearchController
                ? Search.SearchController.get_default()
                : null,
            'InterfaceSettings': new imports.gi.Gio.Settings({
                schema_id: 'org.gnome.desktop.interface',
            }),
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

        this.#api.open?.();
        this.#emit();
    }

    disable() {
        this.#api?.close?.();
        this.#api = null;
        for (const id of this.#signalIds) {
            try {
                Main.layoutManager.disconnect(id);
            } catch (_) {
                /* layoutManager already gone */
            }
        }
        this.#signalIds = [];
        this.#emit();
    }

    // ── consumers ────────────────────────────────────────────────────────

    /**
     * Add an indicator to the status area. box is 'right' (default),
     * 'center' or 'left'. Delegates to Main.panel.addToStatusArea so that a
     * dash-to-panel override installed on the panel object is still honoured.
     */
    addStatusItem(role, indicator, position = 0, box = 'right') {
        return Main.panel.addToStatusArea(role, indicator, position, this.getBox(box));
    }

    /** Same as addStatusItem but for raw actors that are not indicators. */
    addPanelBoxItem(role, actor, position = 0, box = 'right') {
        if (typeof Main.panel._addToPanelBox === 'function')
            return Main.panel._addToPanelBox(role, actor, position, this.getBox(box));
        return Main.panel.addToStatusArea(role, actor, position, this.getBox(box));
    }

    removeStatusItem(role) {
        const actor = Main.panel?.statusArea?.[role];
        if (!actor)
            return false;
        actor.destroy();
        return true;
    }

    /** @param {'left'|'center'|'right'} side */
    getBox(side) {
        switch (side) {
        case 'left':
            return Main.panel._leftBox;
        case 'center':
            return Main.panel._centerBox;
        default:
            return Main.panel._rightBox;
        }
    }

    /** Resolve a side name from a GSettings enum/int position, clamped. */
    sideForIndex(index) {
        return BOXES[Math.max(0, Math.min(BOXES.length - 1, Number(index) || 0))];
    }

    /** Notify consumers when the panel geometry or visibility changed. */
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
