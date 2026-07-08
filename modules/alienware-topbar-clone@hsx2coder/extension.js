/*
 * Alienware Topbar Clone
 *
 * Clones the native GNOME top bar onto every secondary (non-primary) monitor.
 * Each clone contains a fresh Activities button (left), Date/Clock menu
 * (center) and Quick Settings system menu (right) — independent instances so
 * the original Main.panel indicators are never moved or disturbed.
 *
 * The clone panel sits at the TOP of each secondary monitor as tracked chrome
 * with affectsStruts=true, so it pushes content down. It is fully independent
 * from Dash to Panel (which owns the BOTTOM dash on the same monitors).
 *
 * Target: GNOME Shell 49.x, GJS/ESM, Wayland.
 */

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Graphene from 'gi://Graphene';
import St from 'gi://St';
import Atk from 'gi://Atk';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as CtrlAltTab from 'resource:///org/gnome/shell/ui/ctrlAltTab.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';
import {DateMenuButton} from 'resource:///org/gnome/shell/ui/dateMenu.js';
import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

const LOG_PREFIX = '[alienware-topbar-clone]';

const INACTIVE_WORKSPACE_DOT_SCALE = 0.75;

// Module-level settings handle, set in enable(). Used by the panel widgets
// to decide which elements to build.
let SETTINGS = null;

/* --------------------------------------------------------------------- *
 * Workspace dot + indicators, cloned from the native GNOME panel.js
 * (WorkspaceDot / WorkspaceIndicators are not exported, so we reproduce
 * them here). These render the workspace control dots and animate on
 * workspace change, identical to the native top bar.
 * --------------------------------------------------------------------- */
const CloneWorkspaceDot = GObject.registerClass({
    Properties: {
        'expansion': GObject.ParamSpec.double('expansion', null, null,
            GObject.ParamFlags.READWRITE, 0, 1, 0),
        'width-multiplier': GObject.ParamSpec.double('width-multiplier', null, null,
            GObject.ParamFlags.READWRITE, 1, 10, 1),
    },
}, class CloneWorkspaceDot extends Clutter.Actor {
    constructor(params) {
        super({
            ...params,
        });

        this._dot = new St.Widget({
            style_class: 'workspace-dot',
            y_align: Clutter.ActorAlign.CENTER,
            pivot_point: new Graphene.Point({x: 0.5, y: 0.5}),
            request_mode: Clutter.RequestMode.WIDTH_FOR_HEIGHT,
        });
        this.add_child(this._dot);

        this.connect('notify::width-multiplier', () => this.queue_relayout());
        this.connect('notify::expansion', () => {
            this._updateVisuals();
            this.queue_relayout();
        });
        this._updateVisuals();

        this._destroying = false;
    }

    _updateVisuals() {
        const {expansion} = this;
        this._dot.set({
            opacity: Util.lerp(0.50, 1.0, expansion) * 255,
            scaleX: Util.lerp(INACTIVE_WORKSPACE_DOT_SCALE, 1.0, expansion),
            scaleY: Util.lerp(INACTIVE_WORKSPACE_DOT_SCALE, 1.0, expansion),
        });
    }

    vfunc_get_preferred_width(forHeight) {
        const factor = Util.lerp(1.0, this.widthMultiplier, this.expansion);
        return this._dot.get_preferred_width(forHeight).map(v => Math.round(v * factor));
    }

    vfunc_get_preferred_height(forWidth) {
        return this._dot.get_preferred_height(forWidth);
    }

    vfunc_allocate(box) {
        this.set_allocation(box);
        box.set_origin(0, 0);
        this._dot.allocate(box);
    }

    scaleIn() {
        this.set({scale_x: 0, scale_y: 0});
        this.ease({
            duration: 500,
            mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
            scale_x: 1.0,
            scale_y: 1.0,
        });
    }

    scaleOutAndDestroy() {
        this._destroying = true;
        this.ease({
            duration: 500,
            mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
            scale_x: 0.0,
            scale_y: 0.0,
            onComplete: () => this.destroy(),
        });
    }

    get destroying() {
        return this._destroying;
    }
});

const CloneWorkspaceIndicators = GObject.registerClass(
class CloneWorkspaceIndicators extends St.BoxLayout {
    constructor() {
        super();

        this._workspacesAdjustment = Main.createWorkspacesAdjustment(this);
        this._workspacesAdjustment.connectObject(
            'notify::value', () => this._updateExpansion(),
            'notify::upper', () => this._recalculateDots(),
            this);

        for (let i = 0; i < this._workspacesAdjustment.upper; i++)
            this.insert_child_at_index(new CloneWorkspaceDot(), i);
        this._updateExpansion();
    }

    _getActiveIndicators() {
        return [...this].filter(i => !i.destroying);
    }

    _recalculateDots() {
        const activeIndicators = this._getActiveIndicators();
        const nIndicators = activeIndicators.length;
        const targetIndicators = this._workspacesAdjustment.upper;

        let remaining = Math.abs(nIndicators - targetIndicators);
        while (remaining--) {
            if (nIndicators < targetIndicators) {
                const indicator = new CloneWorkspaceDot();
                this.add_child(indicator);
                indicator.scaleIn();
            } else {
                const indicator = activeIndicators[nIndicators - remaining - 1];
                indicator.scaleOutAndDestroy();
            }
        }

        this._updateExpansion();
    }

    _updateExpansion() {
        const nIndicators = this._getActiveIndicators().length;
        const activeWorkspace = this._workspacesAdjustment.value;

        let widthMultiplier;
        if (nIndicators <= 2)
            widthMultiplier = 3.625;
        else if (nIndicators <= 5)
            widthMultiplier = 3.25;
        else
            widthMultiplier = 2.75;

        this.get_children().forEach((indicator, index) => {
            const distance = Math.abs(index - activeWorkspace);
            indicator.expansion = Math.clamp(1 - distance, 0, 1);
            indicator.widthMultiplier = widthMultiplier;
        });
    }

    destroy() {
        if (this._workspacesAdjustment) {
            this._workspacesAdjustment.disconnectObject(this);
            this._workspacesAdjustment = null;
        }
        super.destroy();
    }
});

/* --------------------------------------------------------------------- *
 * Workspace control button (left). Mirrors the native ActivitiesButton:
 * shows workspace dots, toggles overview on click, switches workspace on
 * scroll. Uses fresh instances so the original button is never disturbed.
 * --------------------------------------------------------------------- */
const CloneWorkspaceButton = GObject.registerClass(
class CloneWorkspaceButton extends PanelMenu.Button {
    _init() {
        super._init(0.0, null, true);

        this.set({
            name: 'panelActivities',
            accessible_role: Atk.Role.TOGGLE_BUTTON,
            accessible_name: _('Workspaces'),
        });

        this._indicators = new CloneWorkspaceIndicators();
        this.add_child(this._indicators);

        this._showingId = Main.overview.connect('showing', () => {
            this.add_style_pseudo_class('checked');
            this.add_style_pseudo_class('overview');
        });
        this._hidingId = Main.overview.connect('hiding', () => {
            this.remove_style_pseudo_class('checked');
            this.remove_style_pseudo_class('overview');
        });
    }

    vfunc_event(event) {
        if (event.type() === Clutter.EventType.TOUCH_END ||
            event.type() === Clutter.EventType.BUTTON_RELEASE) {
            if (Main.overview.shouldToggleByCornerOrButton())
                Main.overview.toggle();
        }
        // Scroll over the button switches workspace, like the native bar.
        return Main.wm.handleWorkspaceScroll(event);
    }

    vfunc_key_release_event(event) {
        const symbol = event.get_key_symbol();
        if (symbol === Clutter.KEY_Return || symbol === Clutter.KEY_space) {
            if (Main.overview.shouldToggleByCornerOrButton()) {
                Main.overview.toggle();
                return Clutter.EVENT_STOP;
            }
        }
        return Clutter.EVENT_PROPAGATE;
    }

    destroy() {
        if (this._showingId) {
            Main.overview.disconnect(this._showingId);
            this._showingId = 0;
        }
        if (this._hidingId) {
            Main.overview.disconnect(this._hidingId);
            this._hidingId = 0;
        }
        super.destroy();
    }
});

/* --------------------------------------------------------------------- *
 * A Clutter.Clone that always reports its source's REAL on-screen size as
 * its preferred size. The plain Clutter.Clone under-reports the height of
 * dynamic containers (workspace dots, clock, quickSettings), which made the
 * clones look vertically squashed. By forcing preferred = source allocation
 * size, the clone is laid out 1:1 and never stretched/compressed.
 * --------------------------------------------------------------------- */
const SizedClone = GObject.registerClass(
class SizedClone extends Clutter.Clone {
    _init(params) {
        super._init(params);
        // Re-layout whenever the source's geometry changes. Without this the
        // clone keeps the source's INITIAL (often not-yet-laid-out) size — e.g.
        // quickSettings starts short and grows once its icons load, leaving the
        // clone sitting low until some unrelated relayout nudges it. Tracking
        // the source keeps the clone correct from the first frame.
        const src = this.source;
        if (src) {
            this._srcNotifyId = src.connect('notify::size', () => {
                this.queue_relayout();
            });
            this._srcAllocId = src.connect('notify::allocation', () => {
                this.queue_relayout();
            });
        }
    }

    vfunc_get_preferred_width(_forHeight) {
        const s = this.source;
        let w = s ? s.width : 0;
        if (!Number.isFinite(w) || w < 0)
            w = 0;
        return [w, w];
    }

    vfunc_get_preferred_height(_forWidth) {
        const s = this.source;
        let h = s ? s.height : 0;
        if (!Number.isFinite(h) || h < 0)
            h = 0;
        return [h, h];
    }

    destroy() {
        const src = this.source;
        if (src) {
            if (this._srcNotifyId) {
                try { src.disconnect(this._srcNotifyId); } catch (_e) {}
                this._srcNotifyId = 0;
            }
            if (this._srcAllocId) {
                try { src.disconnect(this._srcAllocId); } catch (_e) {}
                this._srcAllocId = 0;
            }
        }
        super.destroy();
    }
});

/* --------------------------------------------------------------------- *
 * The clone panel widget itself. Mirrors the native Panel layout
 * (left / center / right boxes) and inherits the 'panel' style class so it
 * gets the exact native top bar height/colors from the active theme.
 * --------------------------------------------------------------------- */
const CloneTopBar = GObject.registerClass(
class CloneTopBar extends St.BoxLayout {
    _init(monitorIndex) {
        super._init({
            name: 'panel',
            reactive: true,
            style_class: 'panel',
            // No extra padding/margin: match the native bar; let the row fill
            // the full native panel height so clones are not squashed.
            style: 'padding: 0; margin: 0; border: none; spacing: 0;',
            vertical: false,
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
        });

        this.monitorIndex = monitorIndex;
        this._menuCloseIds = new Map();

        // Swallow right/middle clicks (no stray context menu).
        this.connect('button-press-event', (_a, event) => {
            const b = event.get_button();
            if (b === Clutter.BUTTON_SECONDARY || b === Clutter.BUTTON_MIDDLE)
                return Clutter.EVENT_STOP;
            return Clutter.EVENT_PROPAGATE;
        });

        const mkClone = (source) => new SizedClone({
            source,
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.CENTER,
        });

        const activities = Main.panel.statusArea?.activities;
        const qs = Main.panel.statusArea?.quickSettings;

        // LEFT: workspace switcher (clone of the real activities indicator).
        this._wsClone = mkClone(activities?.container ?? activities ?? Main.panel._leftBox);
        this._wsButton = new St.Button({
            reactive: true, can_focus: true, track_hover: true,
            style: 'padding: 0 4px; margin: 0;',
            child: this._wsClone,
            y_expand: true,
            y_align: Clutter.ActorAlign.FILL,
        });
        this._wsButton.connect('clicked', () => Main.overview.toggle());
        this._wsButton.connect('scroll-event', (_a, event) =>
            (Main.wm.handleWorkspaceScroll
                ? Main.wm.handleWorkspaceScroll(event)
                : Clutter.EVENT_PROPAGATE));
        this.add_child(this._wsButton);

        // Spacer (expands) -> pushes centre to the middle.
        this._spacerL = new St.Widget({x_expand: true});
        this.add_child(this._spacerL);

        // CENTER: plain clone of the real _centerBox (clock). Draw only.
        this._centerClone = mkClone(Main.panel._centerBox);
        this.add_child(this._centerClone);

        // Spacer (expands).
        this._spacerR = new St.Widget({x_expand: true});
        this.add_child(this._spacerR);

        // RIGHT: clone of the QuickSettings widget (no tray), clickable.
        this._qsClone = mkClone(qs ?? Main.panel._rightBox);
        this._qsButton = new St.Button({
            reactive: true, can_focus: true, track_hover: true,
            style: 'padding: 0 4px; margin: 0;',
            child: this._qsClone,
            y_expand: true,
            y_align: Clutter.ActorAlign.FILL,
        });
        this._qsButton.connect('clicked', () =>
            this._openIndicatorMenu(qs, this._qsButton, 'quickSettings'));
        this.add_child(this._qsButton);

        this._showingId = Main.overview.connect('showing',
            () => this.add_style_pseudo_class('overview'));
        this._hidingId = Main.overview.connect('hiding',
            () => this.remove_style_pseudo_class('overview'));

        this._syncClock();
        this._settingId = SETTINGS
            ? SETTINGS.connect('changed::topbar-clone-show-clock', () => this._syncClock())
            : 0;
    }

    _syncClock() {
        let show = true;
        try {
            if (SETTINGS && typeof SETTINGS.get_boolean === 'function')
                show = SETTINGS.get_boolean('topbar-clone-show-clock');
        } catch (_e) { /* keep default */ }
        if (this._centerClone)
            this._centerClone.visible = show;
    }

    _openIndicatorMenu(indicator, button, role) {
        if (!indicator)
            return;
        const menu = indicator.menu;
        if (!menu)
            return;
        if (menu.isOpen) {
            menu.close(true);
            return;
        }
        const originalSource = menu.sourceActor;
        menu.sourceActor = button;
        if (typeof indicator._toggleMenu === 'function')
            indicator._toggleMenu(indicator);
        else
            menu.open(true);
        if (!this._menuCloseIds.has(role)) {
            const id = menu.connect('open-state-changed', (m, isOpen) => {
                if (!isOpen) {
                    m.sourceActor = originalSource;
                    m.disconnect(id);
                    this._menuCloseIds.delete(role);
                }
            });
            this._menuCloseIds.set(role, id);
        }
    }

    destroy() {
        if (this._showingId) {
            Main.overview.disconnect(this._showingId);
            this._showingId = 0;
        }
        if (this._hidingId) {
            Main.overview.disconnect(this._hidingId);
            this._hidingId = 0;
        }
        if (this._settingId && SETTINGS) {
            try { SETTINGS.disconnect(this._settingId); } catch (_e) {}
            this._settingId = 0;
        }
        if (this._menuCloseIds) {
            for (const [role, id] of this._menuCloseIds) {
                try {
                    const ind = Main.panel.statusArea?.[role];
                    if (ind && ind.menu) {
                        ind.menu.disconnect(id);
                        ind.menu.sourceActor = ind;
                    }
                } catch (_e) {}
            }
            this._menuCloseIds.clear();
            this._menuCloseIds = null;
        }
        for (const a of [this._wsClone, this._centerClone, this._qsClone,
            this._wsButton, this._qsButton, this._spacerL, this._spacerR]) {
            try { a?.destroy(); } catch (_e) {}
        }
        this._wsClone = this._centerClone = this._qsClone = null;
        this._wsButton = this._qsButton = null;
        this._spacerL = this._spacerR = null;

        super.destroy();
    }
});

/* --------------------------------------------------------------------- *
 * Chrome wrapper: a vertical box added to the layout manager as tracked
 * chrome with affectsStruts. Holds the CloneTopBar and keeps its geometry
 * pinned to the monitor's top edge at native panel height.
 * --------------------------------------------------------------------- */
class ClonePanelBox {
    constructor(monitorIndex, monitor) {
        this._monitorIndex = monitorIndex;
        this._monitor = null;
        this._geometryIdleId = 0;
        this._allocationChangedId = 0;

        this.panelBox = new St.BoxLayout({
            name: 'alienwareCloneTopBarBox',
            vertical: true,
            clip_to_allocation: true,
            visible: true,
        });

        this.panel = new CloneTopBar(monitorIndex);
        this.panelBox.add_child(this.panel);

        Main.layoutManager.addChrome(this.panelBox, {
            affectsStruts: true,
            trackFullscreen: true,
        });

        Main.ctrlAltTabManager.addGroup(this.panel, _('Top Bar'),
            'shell-focus-top-bar-symbolic', {sortGroup: CtrlAltTab.SortGroup.TOP});

        this._height = this._nativePanelHeight();
        this._setMonitorData(monitor);
        if (this._monitor) {
            this.panelBox.set_position(this._monitor.x, this._monitor.y);
            this.panelBox.set_size(this._monitor.width, this._height);
        }

        // Keep the clone painted below the real panelBox of the primary.
        try {
            Main.uiGroup.set_child_below_sibling(this.panelBox, Main.layoutManager.panelBox);
        } catch (_e) {
            // Non-fatal: ordering only matters for overlap on the same monitor.
        }

        this._allocationChangedId = this.panelBox.connect('notify::allocation',
            this._onAllocationChanged.bind(this));
    }

    // Use the live native top bar height so we never exceed it. Falls back to
    // the theme's preferred height, then a safe default.
    _nativePanelHeight() {
        try {
            const h = Main.panel?.height;
            if (h && h > 0 && !isNaN(h))
                return h;
        } catch (_e) { /* fallthrough */ }
        try {
            if (!Main.panel) return 32;
            const [, natHeight] = Main.panel.get_preferred_height(-1);
            if (natHeight > 0 && !isNaN(natHeight))
                return natHeight;
        } catch (_e) { /* fallthrough */ }
        const boxHeight = Main.layoutManager.panelBox?.height;
        if (boxHeight && boxHeight > 0 && !isNaN(boxHeight))
            return boxHeight;
        return 32;
    }

    _needsUpdate() {
        if (!this._monitor || !this.panelBox)
            return false;
        return (
            Math.round(this.panelBox.x) !== this._monitor.x ||
            Math.round(this.panelBox.y) !== this._monitor.y ||
            Math.round(this.panelBox.width) !== this._monitor.width ||
            Math.round(this.panelBox.height) !== this._height
        );
    }

    // Never re-enter layout from inside the allocation pass — defer to idle.
    _onAllocationChanged() {
        if (this._geometryIdleId || !this.panelBox || !this._monitor)
            return;
        if (!this._needsUpdate())
            return;
        this._geometryIdleId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._geometryIdleId = 0;
            this._applyGeometry();
            return GLib.SOURCE_REMOVE;
        });
    }

    _setMonitorData(monitor) {
        if (!monitor || isNaN(monitor.x) || isNaN(monitor.y) || !monitor.width || monitor.width <= 0) {
            this._monitor = null;
            return;
        }
        this._monitor = {x: monitor.x, y: monitor.y, width: monitor.width};
    }

    _applyGeometry() {
        if (!this.panelBox || !this._monitor)
            return;
        if (!this._needsUpdate())
            return;
        this.panelBox.set_position(this._monitor.x, this._monitor.y);
        this.panelBox.set_size(this._monitor.width, this._height);
    }

    updateMonitor(monitor) {
        const prevMonitor = this._monitor;
        this._setMonitorData(monitor);
        if (!this._monitor) {
            this._monitor = prevMonitor;
            return;
        }
        const h = this._nativePanelHeight();
        if (h > 0)
            this._height = h;
        this._applyGeometry();
    }

    destroy() {
        if (this._geometryIdleId) {
            GLib.source_remove(this._geometryIdleId);
            this._geometryIdleId = 0;
        }
        if (this._allocationChangedId) {
            this.panelBox.disconnect(this._allocationChangedId);
            this._allocationChangedId = 0;
        }

        try {
            Main.ctrlAltTabManager.removeGroup(this.panel);
        } catch (_e) { /* already removed */ }

        try {
            Main.layoutManager.removeChrome(this.panelBox);
        } catch (_e) { /* already untracked */ }

        // Destroying the box destroys the panel child (and its indicators).
        this.panelBox.destroy();
        this.panelBox = null;
        this.panel = null;
        this._monitor = null;
    }
}

export default class TopbarCloneExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._boxes = [];
        this._monitorsChangedId = 0;
        this._workareasChangedId = 0;
        this._rebuildIdleId = 0;
        this._syncGeometryIdle = 0;
    }

    enable() {
        this._settings = this._loadSuiteSettings();
        SETTINGS = this._settings;

        this._build();

        this._monitorsChangedId = Main.layoutManager.connect('monitors-changed',
            () => this._scheduleRebuild());

        // Workareas can change (e.g. fullscreen) without a monitors-changed;
        // re-pin geometry so struts/positions stay correct.
        this._workareasChangedId = global.display.connect('workareas-changed',
            () => this._syncGeometry());

        // Rebuild clones when the clock/tray visibility settings change.
        this._settingsChangedIds = [
            this._settings.connect('changed::topbar-clone-show-clock',
                () => this._scheduleRebuild()),
            this._settings.connect('changed::topbar-clone-show-tray',
                () => this._scheduleRebuild()),
        ];

        log(`${LOG_PREFIX} enabled (${this._boxes.length} clone panel(s))`);
    }

    disable() {
        if (this._rebuildIdleId) {
            GLib.source_remove(this._rebuildIdleId);
            this._rebuildIdleId = 0;
        }
        if (this._syncGeometryIdle) {
            GLib.source_remove(this._syncGeometryIdle);
            this._syncGeometryIdle = 0;
        }
        if (this._monitorsChangedId) {
            Main.layoutManager.disconnect(this._monitorsChangedId);
            this._monitorsChangedId = 0;
        }
        if (this._workareasChangedId) {
            global.display.disconnect(this._workareasChangedId);
            this._workareasChangedId = 0;
        }
        if (this._settingsChangedIds) {
            for (const id of this._settingsChangedIds)
                this._settings.disconnect(id);
            this._settingsChangedIds = null;
        }

        this._teardown();
        this._settings = null;
        SETTINGS = null;
        log(`${LOG_PREFIX} disabled`);
    }

    // Load the suite settings schema. The module lives under the suite but has
    // no schemas/ dir of its own, so resolve the compiled schema from the suite
    // root (this.dir is the module dir; its parent's parent is the suite dir).
    _loadSuiteSettings() {
        const schemaId = 'org.gnome.shell.extensions.alienware-suite';
        try {
            // Prefer the standard extension helper if the schema is resolvable.
            return this.getSettings(schemaId);
        } catch (_e) {
            // Fall back to loading the compiled schema from the suite's schemas dir.
            const suiteSchemasDir = this.dir.get_parent().get_parent()
                .get_child('schemas').get_path();
            const source = Gio.SettingsSchemaSource.new_from_directory(
                suiteSchemasDir,
                Gio.SettingsSchemaSource.get_default(),
                false);
            const schema = source.lookup(schemaId, true);
            if (!schema)
                throw new Error(`${LOG_PREFIX} schema ${schemaId} not found in ${suiteSchemasDir}`);
            return new Gio.Settings({settings_schema: schema});
        }
    }

    _build() {
        const monitors = Main.layoutManager.monitors || [];
        const primaryIndex = Main.layoutManager.primaryIndex;

        for (let i = 0; i < monitors.length; i++) {
            if (i === primaryIndex)
                continue;
            try {
                const box = new ClonePanelBox(i, monitors[i]);
                this._boxes.push(box);
            } catch (e) {
                logError(e, `${LOG_PREFIX} failed to build clone for monitor ${i}`);
            }
        }
    }

    _teardown() {
        while (this._boxes.length > 0) {
            const box = this._boxes.pop();
            try {
                box.destroy();
            } catch (e) {
                logError(e, `${LOG_PREFIX} failed to destroy clone panel`);
            }
        }
    }

    _scheduleRebuild() {
        if (this._rebuildIdleId)
            return;
        // Defer rebuild long enough for monitor geometry to fully settle
        // and other extensions (Dash-to-Panel, DING) to finish their handlers.
        this._rebuildIdleId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 800, () => {
            this._rebuildIdleId = 0;
            this._teardown();
            this._build();
            return GLib.SOURCE_REMOVE;
        });
    }

    _syncGeometry() {
        // Defer to idle so we only read geometry once the layout has settled.
        if (this._syncGeometryIdle)
            return;
        this._syncGeometryIdle = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._syncGeometryIdle = 0;
            const monitors = Main.layoutManager.monitors || [];
            for (const box of this._boxes) {
                const idx = box._monitorIndex;
                if (idx < monitors.length && monitors[idx] && !isNaN(monitors[idx].x))
                    box.updateMonitor(monitors[idx]);
            }
            return GLib.SOURCE_REMOVE;
        });
    }
}
