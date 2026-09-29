import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
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

const LOG_PREFIX = '[topbar-widgets/topbar-clone] ';
const INACTIVE_WORKSPACE_DOT_SCALE = 0.75;

export class TopbarCloneSubsystem {
    static SCHEMA_ID = 'org.gnome.shell.extensions.panel-clone';
    static SUBSYS_DIR = 'topbar-clone';

    constructor(ctx) {
        this._settings = ctx.settings;
        this._ext = ctx.extension;
        this._boxes = [];
        this._monitorsChangedId = 0;
        this._workareasChangedId = 0;
        this._rebuildIdleId = 0;
        this._syncGeometryIdle = 0;
    }

    enable() {
        if (!this._settings.get_boolean('enable-topbar-clone')) {
            log(`${LOG_PREFIX} disabled via settings`);
            return;
        }

        if (Main.layoutManager.monitors.length <= 1) {
            log(`${LOG_PREFIX} only one monitor, nothing to clone`);
            return;
        }

        this._build();

        this._monitorsChangedId = Main.layoutManager.connect('monitors-changed',
            () => this._scheduleRebuild());

        this._workareasChangedId = global.display.connect('workareas-changed',
            () => this._syncGeometry());

        this._settingsChangedIds = [
            this._settings.connect('changed::topbar-clone-show-clock',
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
        log(`${LOG_PREFIX} disabled`);
    }

    _build() {
        const monitors = Main.layoutManager.monitors || [];
        const primaryIndex = Main.layoutManager.primaryIndex;

        for (let i = 0; i < monitors.length; i++) {
            if (i === primaryIndex)
                continue;
            try {
                const box = new ClonePanelBox(i, monitors[i], this._settings);
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
        this._rebuildIdleId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 800, () => {
            this._rebuildIdleId = 0;
            this._teardown();
            this._build();
            return GLib.SOURCE_REMOVE;
        });
    }

    _syncGeometry() {
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

// -- Supporting classes (adapted from original topbar-clone extension.js) --

const CloneWorkspaceDot = GObject.registerClass({
    Properties: {
        'expansion': GObject.ParamSpec.double('expansion', null, null,
            GObject.ParamFlags.READWRITE, 0, 1, 0),
        'width-multiplier': GObject.ParamSpec.double('width-multiplier', null, null,
            GObject.ParamFlags.READWRITE, 1, 10, 1),
    },
}, class CloneWorkspaceDot extends Clutter.Actor {
    constructor(params) {
        super({...params});
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

const SizedClone = GObject.registerClass(
class SizedClone extends Clutter.Clone {
    _init(params) {
        super._init(params);
        const src = this.source;
        if (src) {
            this._srcNotifyId = src.connect('notify::size', () => this.queue_relayout());
            this._srcAllocId = src.connect('notify::allocation', () => this.queue_relayout());
        }
    }

    vfunc_get_preferred_width(_forHeight) {
        const s = this.source;
        let w = s ? s.width : 0;
        if (!Number.isFinite(w) || w < 0) w = 0;
        return [w, w];
    }

    vfunc_get_preferred_height(_forWidth) {
        const s = this.source;
        let h = s ? s.height : 0;
        if (!Number.isFinite(h) || h < 0) h = 0;
        return [h, h];
    }

    destroy() {
        const src = this.source;
        if (src) {
            if (this._srcNotifyId) { try { src.disconnect(this._srcNotifyId); } catch (_e) {} this._srcNotifyId = 0; }
            if (this._srcAllocId) { try { src.disconnect(this._srcAllocId); } catch (_e) {} this._srcAllocId = 0; }
        }
        super.destroy();
    }
});

const CloneTopBar = GObject.registerClass(
class CloneTopBar extends St.BoxLayout {
    _init(monitorIndex, settings) {
        super._init({
            name: 'panel',
            reactive: true,
            style_class: 'panel',
            style: 'padding: 0; margin: 0; border: none; spacing: 0;',
            vertical: false,
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
        });

        this.monitorIndex = monitorIndex;
        this._menuCloseIds = new Map();
        this._settings = settings;

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

        // LEFT: workspace switcher
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

        // Spacer L
        this._spacerL = new St.Widget({x_expand: true});
        this.add_child(this._spacerL);

        // CENTER: clock clone
        this._centerClone = mkClone(Main.panel._centerBox);
        this.add_child(this._centerClone);

        // Spacer R
        this._spacerR = new St.Widget({x_expand: true});
        this.add_child(this._spacerR);

        // RIGHT: QuickSettings clone
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
        this._settingId = this._settings
            ? this._settings.connect('changed::topbar-clone-show-clock', () => this._syncClock())
            : 0;
    }

    _syncClock() {
        let show = true;
        try {
            if (this._settings && typeof this._settings.get_boolean === 'function')
                show = this._settings.get_boolean('topbar-clone-show-clock');
        } catch (_e) {}
        if (this._centerClone)
            this._centerClone.visible = show;
    }

    _openIndicatorMenu(indicator, button, role) {
        if (!indicator) return;
        const menu = indicator.menu;
        if (!menu) return;
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
        if (this._settingId && this._settings) {
            try { this._settings.disconnect(this._settingId); } catch (_e) {}
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

class ClonePanelBox {
    constructor(monitorIndex, monitor, settings) {
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

        this.panel = new CloneTopBar(monitorIndex, settings);
        this.panelBox.add_child(this.panel);

        Main.layoutManager.addChrome(this.panelBox, {
            affectsStruts: true,
            trackFullscreen: true,
        });

        Main.ctrlAltTabManager.addGroup(this.panel, 'Top Bar',
            'shell-focus-top-bar-symbolic', {sortGroup: CtrlAltTab.SortGroup.TOP});

        this._height = this._nativePanelHeight();
        this._setMonitorData(monitor);
        if (this._monitor) {
            this.panelBox.set_position(this._monitor.x, this._monitor.y);
            this.panelBox.set_size(this._monitor.width, this._height);
        }

        try {
            Main.uiGroup.set_child_below_sibling(this.panelBox, Main.layoutManager.panelBox);
        } catch (_e) {}

        this._allocationChangedId = this.panelBox.connect('notify::allocation',
            this._onAllocationChanged.bind(this));
    }

    _nativePanelHeight() {
        try {
            const h = Main.panel?.height;
            if (h && h > 0 && !isNaN(h)) return h;
        } catch (_e) {}
        try {
            if (!Main.panel) return 32;
            const [, natHeight] = Main.panel.get_preferred_height(-1);
            if (natHeight > 0 && !isNaN(natHeight)) return natHeight;
        } catch (_e) {}
        const boxHeight = Main.layoutManager.panelBox?.height;
        if (boxHeight && boxHeight > 0 && !isNaN(boxHeight)) return boxHeight;
        return 32;
    }

    _needsUpdate() {
        if (!this._monitor || !this.panelBox) return false;
        return (
            Math.round(this.panelBox.x) !== this._monitor.x ||
            Math.round(this.panelBox.y) !== this._monitor.y ||
            Math.round(this.panelBox.width) !== this._monitor.width ||
            Math.round(this.panelBox.height) !== this._height
        );
    }

    _onAllocationChanged() {
        if (this._geometryIdleId || !this.panelBox || !this._monitor) return;
        if (!this._needsUpdate()) return;
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
        if (!this.panelBox || !this._monitor) return;
        if (!this._needsUpdate()) return;
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
        if (h > 0) this._height = h;
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
        try { Main.ctrlAltTabManager.removeGroup(this.panel); } catch (_e) {}
        try { Main.layoutManager.removeChrome(this.panelBox); } catch (_e) {}
        this.panelBox.destroy();
        this.panelBox = null;
        this.panel = null;
        this._monitor = null;
    }
}
