/* DING: Desktop Icons New Generation for GNOME Shell
 *
 * Copyright (C) 2025 Alienware Suite contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, version 3 of the License.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * Nautilus-style file transfer bubble.
 *
 * Replaces the old centered Gtk.Window "File Operations" popup (Windows-style)
 * with a GNOME-consistent overlay pill, modeled on Nautilus:
 *
 * - nautilus-floating-bar.c: pill with spinner + primary/details labels +
 *   circular flat stop button, hover tracking with a hide timeout, slide
 *   animation via GtkRevealer.
 * - nautilus-progress-info-widget.ui: status label (ellipsized, max width) +
 *   thin progress bar + details row.
 * - nautilus-progress-indicator.ui: header pill that opens a queue popover
 *   (operations ListBox) with per-operation rows and cancel buttons.
 * - nautilus-list-base.c: overlays attached with gtk_overlay_add_overlay()
 *   on the view's GtkOverlay.
 *
 * DING mapping: each DesktopGrid owns a separate Gtk.ApplicationWindow, so the
 * manager fans one logical operation out to a bubble per grid window. Position
 * is bottom-left, above the Bottom Panel: DesktopGrid.updateWindowGeometry()
 * already insets windows by the shell work-area margins (which exclude the
 * Bottom Panel strut), so halign START + valign END with a small margin lands
 * exactly where the Nautilus floating bar sits. No hardcoded panel height.
 */
'use strict';
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Gdk = imports.gi.Gdk;
const Gtk = imports.gi.Gtk;

const Gettext = imports.gettext.domain('ding');

const _ = Gettext.gettext;

/* Margin of the bubble from the desktop window edges (px, unscaled). The
 * bottom margin keeps the pill clear of the desktop icon grid; the window
 * itself already ends above the Bottom Panel via work-area margins. */
const BUBBLE_MARGIN_START = 12;
const BUBBLE_MARGIN_BOTTOM = 8;
/* GSettings keys for the Transfers tab (prefs.js). Read defensively: tests and
 * old hosts may run without Prefs.desktopSettings, so every read falls back
 * to the compiled-in default above. */
const TRANSFER_SETTINGS_ID = 'org.gnome.shell.extensions.ding';
const TRANSFER_POSITIONS = ['bottom-left', 'bottom-right', 'top-left', 'top-right'];
const TRANSFER_DEFAULTS = {
    'transfer-show-detail': true,
    'transfer-show-rate': true,
    'transfer-show-elapsed': true,
    'transfer-animation': true,
    'transfer-position': 'bottom-left',
    'transfer-margin': 12,
    'transfer-card-width': 320,
    'transfer-hide-delay': 1500,
};

function _transferSettings() {
    try {
        const Prefs = imports.preferences;
        if (Prefs && Prefs.desktopSettings)
            return Prefs.desktopSettings;
    } catch (e) { /* no preferences module on this host */ }
    return null;
}

function _transferGet(key) {
    const settings = _transferSettings();
    if (!settings)
        return TRANSFER_DEFAULTS[key];
    try {
        const dflt = TRANSFER_DEFAULTS[key];
        if (typeof dflt === 'boolean')
            return settings.get_boolean(key);
        if (typeof dflt === 'number')
            return settings.get_int(key);
        return settings.get_string(key);
    } catch (e) {
        return TRANSFER_DEFAULTS[key];
    }
}
/* Slide animation duration (ms), matching Adw/Gtk revealer defaults. */
const REVEAL_MS = 250;
/* Auto-hide delay after completion/error/cancel (ms). Nautilus keeps the bar
 * briefly so the user sees the final state, then slides it away. */
const AUTOHIDE_COMPLETED_MS = 1200;
const AUTOHIDE_ERROR_MS = 4000;
const AUTOHIDE_CANCELLED_MS = 1500;
/* Pulse interval (ms) while byte progress is unknown. */
const PULSE_MS = 250;

var FileProgressManager = class {
    /* Snapshot of transfer prefs. Re-read on every paint so Settings changes
     * apply live; clamps keep hand-edited dconf values sane. */
    _bubbleConfig() {
        const margin = _transferGet('transfer-margin');
        const width = _transferGet('transfer-card-width');
        const pos = _transferGet('transfer-position');
        return {
            margin: Math.max(0, Math.min(64, margin)),
            cardWidth: Math.max(240, Math.min(520, width)),
            hideDelay: Math.max(0, Math.min(15000, _transferGet('transfer-hide-delay'))),
            position: TRANSFER_POSITIONS.includes(pos) ? pos : 'bottom-left',
            showDetail: _transferGet('transfer-show-detail'),
            showRate: _transferGet('transfer-show-rate'),
            showElapsed: _transferGet('transfer-show-elapsed'),
            animate: _transferGet('transfer-animation'),
        };
    }

    /* Apply position + margins + animation to an existing revealer. Called on
     * creation and on every paint so live pref changes move the stack. */
    _applyBubbleLayout(revealer, cfg) {
        const left = cfg.position.endsWith('left');
        const top = cfg.position.startsWith('top');
        revealer.halign = left ? Gtk.Align.START : Gtk.Align.END;
        revealer.valign = top ? Gtk.Align.START : Gtk.Align.END;
        revealer.margin_start = cfg.margin;
        revealer.margin_end = cfg.margin;
        revealer.margin_top = cfg.margin;
        revealer.margin_bottom = cfg.margin;
        revealer.transition_duration = cfg.animate ? REVEAL_MS : 0;
    }

    constructor(desktopManager) {
        this._desktopManager = desktopManager;
        this._item = null;
        this._inhibitCookie = null;
        this._pulseTimer = null;
        /* Per-grid card stacks: [{grid, window, overlay, revealer, list}].
         * Each running op gets its own card, always fully visible —
         * no summary pill, no expandable popover. */
        this._bubbles = [];
        this._queue = [];
        this._hideTimer = null;
        this._queuePaintIdle = false;
    }

    addOperation(id, type, totalItems, message) {
        this._ensureBubbles();
        /* Multi-op: prior _item stays tracked — the ctor registers every
         * item in _queue, so _allOps() sees them all, one card each. */
        this._item = new FileProgressItem(this, id, type, totalItems, message);
        this._syncUI();
        this._startPulse();
        this._showBubbles();
        if (!this._inhibitCookie) {
            this._inhibitCookie = this._desktopManager.mainApp.inhibit(null,
                Gtk.ApplicationInhibitFlags.LOGOUT | Gtk.ApplicationInhibitFlags.SUSPEND,
                _('File operation in progress'));
        }
        return this._item;
    }

    removeOperation() {
        if (this._item) {
            this._item._destroy();
            this._item = null;
        }
        this._stopPulse();
        this._refreshBubbleVisibility();
        if (this._inhibitCookie !== null) {
            this._desktopManager.mainApp.uninhibit(this._inhibitCookie);
            this._inhibitCookie = null;
        }
    }

    /* External ops (e.g. AutoAr extract/compress dialogs) join the card stack
     * without displacing the active copy/paste item. op shape:
     * {_primaryText|_defaultLabel(), _fraction|undefined, _finished,
     *  _cancellable?, cancel?(), _cancelledByUser}. */
    registerExternal(op) {
        if (!op || this._queue.includes(op))
            return;
        this._ensureBubbles();
        /* Plain-object externals (AutoAr) get the same immediate-cancel path
         * as internal items so every card paints terminal state on click. */
        if (op && typeof op.requestCancel !== 'function') {
            op.requestCancel = () => {
                if (op._finished)
                    return;
                op._cancelledByUser = true;
                try {
                    if (op._cancellable)
                        op._cancellable.cancel();
                } catch (e) {
                }
                if (typeof op.cancel === 'function') {
                    try {
                        op.cancel();
                    } catch (e) {
                    }
                }
                if (typeof op._fraction !== 'number')
                    op._fraction = 0;
                op._finished = true;
                op._endState = 'cancelled';
                try {
                    op._primaryText = _('Cancelling…');
                } catch (e) {
                }
                this._syncUI();
                this._armHideTimerIfDone();
            };
        }
        if (!this._queue.includes(op))
            this._queue.push(op);
        this._syncUI();
        this._showBubbles();
    }

    unregisterExternal(op) {
        const i = this._queue.indexOf(op);
        if (i >= 0)
            this._queue.splice(i, 1);
        this._syncUI();
        this._refreshBubbleVisibility();
    }

    /* Dismiss a terminal card immediately (X button). Removes the op from
     * the stack now instead of waiting for the auto-hide timer. */
    _dismissOp(op) {
        if (!op || !op._finished)
            return;
        try {
            if (typeof op._destroy === 'function' && !op._destroyed)
                op._destroy();
        } catch (e) {
        }
        const i = this._queue.indexOf(op);
        if (i >= 0)
            this._queue.splice(i, 1);
        if (this._item === op)
            this._item = null;
        this._syncUI();
        this._refreshBubbleVisibility();
    }

    /* Tooltip: primary + detail + elapsed, so long ellipsized lines and
     * "running how long" stay reachable on hover. */
    _tooltipText(op) {
        const bits = [];
        const primary = op._primaryText
            || (typeof op._defaultLabel === 'function' && op._defaultLabel())
            || '';
        if (primary)
            bits.push(primary);
        const detail = (typeof op._detailText === 'function' && op._detailText())
            || op._secondaryText || '';
        if (detail && detail !== primary)
            bits.push(detail);
        if (!this._bubbleConfig().showElapsed)
            return bits.join('\n');
        let start = 0;
        try {
            if (typeof op._startMono === 'number')
                start = op._startMono;
            else if (typeof op._startTime === 'number')
                start = op._startTime;
        } catch (e) {
        }
        if (start > 0) {
            try {
                const secs = Math.max(0, (GLib.get_monotonic_time() - start) / 1000000);
                bits.push(_('Elapsed: %s').replace('%s', this._fmtElapsed(secs)));
            } catch (e) {
            }
        }
        return bits.join('\n');
    }

    _fmtElapsed(secs) {
        const s = Math.max(Math.round(secs), 0);
        if (s < 60)
            return _('%d second').replace('%d', String(s));
        const m = Math.floor(s / 60);
        if (m < 60)
            return _('%d minute').replace('%d', String(m));
        return _('%d hour').replace('%d', String(Math.floor(m / 60)));
    }

    /* Every tracked op in creation order. The ctor registers each item
     * in _queue (internal + external alike); _item is just the newest. */
    _allOps() {
        return [...this._queue];
    }

    _ensureBubbles() {
        const grids = this._desktopManager._desktops || [];
        const alive = [];
        for (let grid of grids) {
            try {
                if (!grid || !grid._window || !grid._eventBox)
                    continue;
                let bubble = null;
                for (let b of this._bubbles) {
                    if (b.grid === grid &&
                        b.window === grid._window) {
                        bubble = b;
                        break;
                    }
                }
                if (!bubble)
                    bubble = this._buildBubble(grid);
                if (bubble)
                    alive.push(bubble);
            } catch (e) {
            }
        }
        this._bubbles = alive;
    }

    _buildBubble(grid) {
        const eventBox = grid._eventBox;
        const parent = eventBox.get_parent();
        if (!parent)
            return null;
        let overlay = null;
        if (parent instanceof Gtk.Overlay) {
            overlay = parent;
        } else {
            overlay = new Gtk.Overlay();
            overlay.show();
            /* Re-parent the EventBox under the overlay, keeping position. */
            parent.remove(eventBox);
            overlay.add(eventBox);
            parent.add(overlay);
            overlay.show_all();
        }
        /* One vertical stack per grid: one card per op, bottom-left above
         * the Bottom Panel, slide-up reveal. */
        const _cfg0 = this._bubbleConfig();
        const revealer = new Gtk.Revealer({
            halign: Gtk.Align.START,
            valign: Gtk.Align.END,
            transition_type: Gtk.RevealerTransitionType.SLIDE_UP,
            transition_duration: _cfg0.animate ? REVEAL_MS : 0,
            reveal_child: false,
        });
        this._applyBubbleLayout(revealer, _cfg0);
        revealer.get_style_context().add_class('ding-transfer-revealer');
        const list = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 8,
        });
        list.get_style_context().add_class('ding-transfer-stack');
        revealer.add(list);
        overlay.add_overlay(revealer);
        overlay.set_overlay_pass_through(revealer, true);
        revealer.show_all();
        revealer.reveal_child = false;
        const bubble = { grid, window: grid._window, overlay, revealer, list };
        return bubble;
    }

    _showBubbles() {
        this._clearHideTimer();
        for (let b of this._bubbles) {
            try {
                b.revealer.reveal_child = true;
            } catch (e) {
                /* grid window gone; pruned on next _ensureBubbles */
            }
        }
    }

    _hideBubbles() {
        for (let b of this._bubbles) {
            try {
                b.revealer.reveal_child = false;
            } catch (e) {
            }
        }
    }

    /* Indeterminate bars only animate on pulse() calls, and rebuilds
     * happen on notify/idle — not on a clock. While any visible card is
     * unfinished and fractionless, keep a 100ms pulse timer (Nautilus
     * spinners/bars animate continuously, never freeze between notifies). */
    _armPulseTimer() {
        const need = this._queue.some(op => !op._finished && typeof op._fraction !== 'number');
        if (need && !this._pulseTimer) {
            this._pulseTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                this._syncUI();
                const still = this._queue.some(op => !op._finished && typeof op._fraction !== 'number');
                if (!still) {
                    this._pulseTimer = null;
                    return false;
                }
                return true;
            });
        } else if (!need && this._pulseTimer) {
            try { GLib.source_remove(this._pulseTimer); } catch (e) {}
            this._pulseTimer = null;
        }
    }

    _refreshBubbleVisibility() {
        if (this._queue.length)
            this._showBubbles();
        else
            this._hideBubbles();
    }

    _clearHideTimer() {
        if (this._hideTimer) {
            GLib.source_remove(this._hideTimer);
            this._hideTimer = null;
        }
    }

    /* Per-op hide delay (ms): errors linger, cancelled keep the default,
     * hideDelay=0 pins the card until dismissed. */
    _hideDelayFor(op) {
        const cfg = this._bubbleConfig().hideDelay;
        if (op && op._endState === 'error')
            return Math.max(AUTOHIDE_ERROR_MS, cfg);
        return cfg;
    }

    /* Hide one finished op now: drop its card widgets, then the queue entry.
     * Running siblings are untouched — each card hides on its own delay. */
    _hideOpNow(op) {
        if (!op || !op._finished)
            return;
        try {
            for (let b of this._bubbles) {
                for (let child of b.list.get_children()) {
                    if (child._dingOp === op) {
                        try { child.destroy(); } catch (e) {}
                    }
                }
            }
        } catch (e) {}
        const i = this._queue.indexOf(op);
        if (i >= 0)
            this._queue.splice(i, 1);
        if (this._item === op)
            this._item = null;
        this._syncUI();
        this._refreshBubbleVisibility();
    }

    _armHideTimerIfDone() {
        /* Auto-hide, per card: each finished op hides on its own delay
         * (Nautilus parity: a done copy vanishes while the next one still
         * runs). Running ops never hide. */
        const pending = this._allOps().filter(o => o._finished && !o._hideArmed);
        for (let op of pending) {
            op._hideArmed = true;
            const delay = this._hideDelayFor(op);
            if (!delay)
                continue;
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
                try {
                    if (!op._hoverIn)
                        this._hideOpNow(op);
                    else {
                        /* Hovered: retry shortly after leave. */
                        op._hideArmed = false;
                        this._armHideTimerIfDone();
                    }
                } catch (e) {}
                return false;
            });
        }
        /* ponytail: no blanket timer. Each finished op already got its own
         * hide timer above; running ops never hide. Nothing left to arm. */
        return;
    }

    _syncUI() {
        this._ensureBubbles();
        this._armPulseTimer();
        /* Card rebuild destroys/recreates rows; coalesce rapid progress
         * updates into one idle paint. */
        if (this._queuePaintIdle)
            return;
        this._queuePaintIdle = true;
        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._queuePaintIdle = false;
            try {
                for (let b of this._bubbles)
                    this._paintStack(b);
            } catch (e) {
            }
            return false;
        });
    }

    /* One card per op, always fully visible: status line, detail line
     * (bytes x/y — time left (rate)), progress bar, cancel while running,
     * dimmed status label when finished. */
    _paintStack(b) {
        const _cfg = this._bubbleConfig();
        this._applyBubbleLayout(b.revealer, _cfg);
        /* ponytail: diff, not rebuild. Destroying cards per paint kills the
         * running GtkSpinner animation (fresh start() each paint = frozen)
         * and swaps the cancel button under the cursor mid-click. Update
         * existing cards in place; only add/remove on set change. */
        const live = new Set(this._allOps());
        for (let child of b.list.get_children()) {
            const tag = child._dingOp || null;
            if (!tag || !live.has(tag)) {
                try { child.destroy(); } catch (e) {}
            }
        }
        const have = new Set();
        for (let child of b.list.get_children()) {
            if (child._dingOp)
                have.add(child._dingOp);
        }
        for (let op of this._allOps()) {
            if (have.has(op))
                continue;
            have.add(op);
            const card = this._buildCard(op);
            card._dingOp = op;
            b.list.add(card);
        }
        for (let child of b.list.get_children()) {
            if (child._dingOp && live.has(child._dingOp))
                this._updateCard(child, child._dingOp);
        }
        b.list.show_all();
    }

    _buildCard(op) {
        const card = new Gtk.EventBox();
        card.set_size_request(this._bubbleConfig().cardWidth, -1);
        card.get_style_context().add_class('ding-transfer-pill');
        card.set_visible_window(true);
        card.set_above_child(false);
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 10,
        });
        box.get_style_context().add_class('ding-transfer-box');
        card.add(box);
        /* Status icon per state (Nautilus operations popover parity):
         * running = spinner, done = green check, cancelled = dim stop,
         * error = red error mark. */
        /* ponytail: both states prebuilt in a slot; _updateCard toggles
         * visibility so the spinner is never destroyed while running. */
        const statusSlot = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 0 });
        statusSlot.set_valign(Gtk.Align.CENTER);
        const spinner = new Gtk.Spinner();
        spinner.start();
        statusSlot.pack_start(spinner, false, false, 0);
        let statusIcon = new Gtk.Image({ icon_name: 'emblem-ok-symbolic' });
        statusSlot.pack_start(statusIcon, false, false, 0);
        if (!op._finished) {
            statusIcon.hide();
        } else {
            const iconName = op._endState === 'error'
                ? 'dialog-error-symbolic'
                : op._endState === 'cancelled'
                    ? 'process-stop-symbolic'
                    : 'emblem-ok-symbolic';
            try { statusIcon.set_from_icon_name(iconName, Gtk.IconSize.MENU); } catch (e) {}
            statusIcon.get_style_context().add_class('ding-transfer-status-icon');
            if (op._endState === 'error')
                statusIcon.get_style_context().add_class('ding-transfer-status-error');
            else if (op._endState === 'cancelled')
                statusIcon.get_style_context().add_class('ding-transfer-status-cancelled');
            else
                statusIcon.get_style_context().add_class('ding-transfer-status-done');
        }
        statusIcon.set_valign(Gtk.Align.CENTER);
        statusIcon.get_style_context().add_class('ding-transfer-status-icon');
        box.pack_start(statusSlot, false, false, 0);
        const labels = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 0,
        });
        labels.get_style_context().add_class('ding-transfer-labels');
        box.pack_start(labels, true, true, 0);
        const primary = new Gtk.Label({
            label: op._primaryText || (typeof op._defaultLabel === 'function' && op._defaultLabel()) || '',
            halign: Gtk.Align.START,
            xalign: 0,
            hexpand: true,
            ellipsize: 2, /* PANGO_ELLIPSIZE_MIDDLE, like Nautilus */
            max_width_chars: 40,
            single_line_mode: true,
        });
        primary.get_style_context().add_class('ding-transfer-primary');
        labels.pack_start(primary, false, true, 0);
        /* Secondary label (current filename from localFileOps) is merged with
         * the byte/time/rate detail — both visible on one ellipsized line. */
        const detailParts = [];
        if (op._secondaryText)
            detailParts.push(op._secondaryText);
        const autoDetail = (typeof op._detailText === 'function' && op._detailText()) || '';
        if (autoDetail && autoDetail !== op._secondaryText)
            detailParts.push(autoDetail);
        const _cfgCard = this._bubbleConfig();
        const showRate = _cfgCard.showDetail && _cfgCard.showRate;
        const detailText = _cfgCard.showDetail ? detailParts.join(' — ') : '';
        const detail = new Gtk.Label({
            label: detailText,
            halign: Gtk.Align.START,
            xalign: 0,
            hexpand: true,
            ellipsize: 2,
            max_width_chars: 40,
            single_line_mode: true,
            no_show_all: !detailText,
        });
        detail.get_style_context().add_class('ding-transfer-details');
        labels.pack_start(detail, false, true, 0);
        const bar = new Gtk.ProgressBar();
        bar.get_style_context().add_class('ding-transfer-bar');
        bar.set_show_text(false);
        if (typeof op._fraction === 'number')
            bar.set_fraction(op._fraction);
        else if (!op._finished)
            bar.pulse();
        else
            bar.set_fraction(0);
        bar.set_hexpand(true);
        labels.pack_start(bar, false, true, 0);
        /* ponytail: both buttons prebuilt; _updateCard shows cancel while
         * running and dismiss once terminal — the button widget is never
         * replaced mid-click. */
        const actionSlot = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 0 });
        actionSlot.set_valign(Gtk.Align.CENTER);
        box.pack_start(actionSlot, false, false, 0);
        {
            const stopBtn = new Gtk.Button({
                image: new Gtk.Image({ icon_name: 'process-stop-symbolic' }),
            });
            stopBtn.get_style_context().add_class('ding-transfer-stop');
            stopBtn.get_style_context().add_class('circular');
            stopBtn.get_style_context().add_class('flat');
            stopBtn.set_valign(Gtk.Align.CENTER);
            stopBtn.set_tooltip_text(_('Cancel'));
            const target = op;
            stopBtn.connect('clicked', () => {
                if (typeof target.requestCancel === 'function')
                    target.requestCancel();
                else {
                    target._cancelledByUser = true;
                    try {
                        target._cancellable.cancel();
                    } catch (e) {
                    }
                    if (target.cancel)
                        target.cancel();
                    this._syncUI();
                }
            });
            stopBtn._dingRole = 'stop';
            actionSlot.pack_start(stopBtn, false, false, 0);
            if (op._finished)
                stopBtn.hide();
        }
        {
            /* Finished: status text already shows in the detail line —
             * dim the card, no duplicate label (G2). */
            card.get_style_context().add_class('ding-transfer-done');
            if (op._endState === 'error')
                card.get_style_context().add_class('ding-transfer-error');
            const dismiss = new Gtk.Button({
                image: new Gtk.Image({ icon_name: 'window-close-symbolic' }),
            });
            dismiss.get_style_context().add_class('ding-transfer-stop');
            dismiss.get_style_context().add_class('circular');
            dismiss.get_style_context().add_class('flat');
            dismiss.set_valign(Gtk.Align.CENTER);
            dismiss.set_tooltip_text(_('Dismiss'));
            const gone = op;
            dismiss.connect('clicked', () => {
                this._dismissOp(gone);
            });
            dismiss._dingRole = 'dismiss';
            actionSlot.pack_start(dismiss, false, false, 0);
            if (!op._finished)
                dismiss.hide();
        }
        /* Tooltip carries elapsed + full text (Nautilus "running how long"). */
        try {
            const tip = this._tooltipText(op);
            if (tip)
                card.set_tooltip_text(tip);
        } catch (e) {
        }
        /* Hover pauses auto-hide, like Nautilus floating-bar hover tracking. */
        card.add_events(Gdk.EventMask.ENTER_NOTIFY_MASK | Gdk.EventMask.LEAVE_NOTIFY_MASK);
        card.connect('enter-notify-event', () => {
            op._hoverIn = true;
            this._clearHideTimer();
            return false;
        });
        card.connect('leave-notify-event', () => {
            op._hoverIn = false;
            this._armHideTimerIfDone();
            return false;
        });
        card._dingRefs = { primary, detail, bar, statusSlot, actionSlot };
        return card;
    }

    /* In-place card refresh: text, icon state, bar fraction, button swap.
     * No widget is destroyed here, so a running spinner keeps animating
     * and the cancel button stays clickable across progress notifies. */
    _updateCard(card, op) {
        const R = card._dingRefs;
        if (!R)
            return;
        const primaryText = op._primaryText
            || (typeof op._defaultLabel === 'function' && op._defaultLabel())
            || '';
        try { R.primary.set_text(primaryText); } catch (e) {}
        const detailParts = [];
        if (op._secondaryText)
            detailParts.push(op._secondaryText);
        const autoDetail = (typeof op._detailText === 'function' && op._detailText()) || '';
        if (autoDetail && autoDetail !== op._secondaryText)
            detailParts.push(autoDetail);
        const _cfgCard = this._bubbleConfig();
        const detailText = _cfgCard.showDetail ? detailParts.join(' \u2014 ') : '';
        try {
            R.detail.set_text(detailText);
            R.detail.set_visible(!!detailText);
        } catch (e) {}
        if (typeof op._fraction === 'number') {
            try { R.bar.set_fraction(op._fraction); } catch (e) {}
        } else if (!op._finished) {
            try { R.bar.pulse(); } catch (e) {}
        } else {
            try { R.bar.set_fraction(0); } catch (e) {}
        }
        /* Status slot: exactly one of spinner / state icon visible. */
        try {
            const kids = R.statusSlot.get_children();
            for (let k of kids) {
                const isSpin = (k instanceof Gtk.Spinner);
                const want = op._finished ? !isSpin : isSpin;
                if (want && !k.get_visible()) {
                    k.show();
                    if (isSpin) { try { k.start(); } catch (e) {} }
                } else if (!want && k.get_visible()) {
                    if (isSpin) { try { k.stop(); } catch (e) {} }
                    k.hide();
                }
            }
            if (op._finished) {
                const iconName = op._endState === 'error'
                    ? 'dialog-error-symbolic'
                    : (op._endState === 'cancelled'
                        ? 'process-stop-symbolic'
                        : 'emblem-ok-symbolic');
                for (let k of kids) {
                    if (!(k instanceof Gtk.Spinner)) {
                        try { k.set_from_icon_name(iconName, Gtk.IconSize.MENU); } catch (e) {}
                        const ctx = k.get_style_context();
                        try { ctx.remove_class('ding-transfer-error'); } catch (e) {}
                        try { ctx.remove_class('ding-transfer-cancelled'); } catch (e) {}
                        try { ctx.remove_class('ding-transfer-done'); } catch (e) {}
                        if (op._endState === 'error')
                            ctx.add_class('ding-transfer-error');
                        else if (op._endState === 'cancelled')
                            ctx.add_class('ding-transfer-cancelled');
                        else
                            ctx.add_class('ding-transfer-done');
                    }
                }
            }
        } catch (e) {}
        /* Action slot: cancel while running, dismiss once terminal. */
        try {
            const kids = R.actionSlot.get_children();
            for (let k of kids) {
                const isStop = (k._dingRole === 'stop');
                const want = op._finished ? !isStop : isStop;
                if (want && !k.get_visible())
                    k.show();
                else if (!want && k.get_visible())
                    k.hide();
            }
        } catch (e) {}
        try {
            const errCtx = card.get_style_context();
            if (op._finished && op._endState === 'error')
                errCtx.add_class('ding-transfer-error');
            else {
                try { errCtx.remove_class('ding-transfer-error'); } catch (e) {}
            }
        } catch (e) {}
        try {
            const tip = this._tooltipText(op);
            if (tip)
                card.set_tooltip_text(tip);
        } catch (e) {}
    }

    _startPulse() {
        this._stopPulse();
        this._pulseTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, PULSE_MS, () => {
            if (!this._item || typeof this._item._fraction === 'number') {
                this._stopPulse();
                return false;
            }
            /* Indeterminate (G4): pulse every bar without a byte fraction
             * so "Preparing…" cards animate instead of sitting at 0. */
            this._syncUI();
            return true;
        });
    }

    _stopPulse() {
        if (this._pulseTimer) {
            GLib.source_remove(this._pulseTimer);
            this._pulseTimer = null;
        }
    }

    _notify(header, text) {
        this._desktopManager.dbusManager.doNotify(header, text);
    }
};

var FileProgressItem = class {
    constructor(manager, id, type, totalItems, message) {
        this._manager = manager;
        this._id = id;
        this._type = type;
        this._totalItems = totalItems;
        this._completedItems = 0;
        this._cancelled = false;
        this._startTime = GLib.get_monotonic_time();
        this._cancellable = new Gio.Cancellable();
        this._cancelledByUser = false;
        this._destroyed = false;
        this._primaryText = message || null;
        this._secondaryText = null;
        this._fraction = null;
        this._finished = false;
        this._endState = null;
        /* Detail tracking (Nautilus file-operations parity): byte counters +
         * monotonic start so each row can show "x / y — T left (R/s)". */
        this._doneBytes = 0;
        this._totalBytes = 0;
        this._startMono = GLib.get_monotonic_time();
        if (!this._manager._queue.includes(this))
            this._manager._queue.push(this);
    }

    /* Nautilus file-operations detail format: "x / y — T left (R files/s)".
     * Falls back to item counts ("3 / 10") when byte totals are unknown,
     * mirroring nautilus-file-operations.c progress callback. */
    _detailText(showRate = true) {
        if (this._finished) {
            if (this._endState === 'cancelled')
                return _('Cancelled');
            if (this._endState === 'error')
                return this._primaryText || _('Error');
            return _('Completed');
        }
        if (this._totalBytes > 0 && this._doneBytes >= 0) {
            const done = GLib.format_size(this._doneBytes);
            const total = GLib.format_size(this._totalBytes);
            const extra = this._etaText();
            return extra ? '%s / %s \u2014 %s'.replace('%s', done).replace('%s', total).replace('%s', extra) : '%s / %s'.replace('%s', done).replace('%s', total);
        }
        if (this._totalItems > 1 && this._completedItems >= 0)
            return '%d / %d'.replace('%d', String(this._completedItems)).replace('%d', String(this._totalItems));
        return this._secondaryText || '';
    }

    _etaText() {
        try {
            const now = GLib.get_monotonic_time();
            const elapsed = Math.max((now - this._startMono) / 1000000, 0.001);
            /* Nautilus waits for a reliable rate before showing ETA. */
            if (elapsed < 2 || this._doneBytes <= 0)
                return null;
            const rate = this._doneBytes / elapsed;
            const left = this._totalBytes > this._doneBytes
                ? (this._totalBytes - this._doneBytes) / Math.max(rate, 1)
                : 0;
            return _('%s left').replace('%s', this._formatDuration(left)) +
                showRate ? ' (%s/s)'.replace('%s', GLib.format_size(Math.round(rate))) : '';
        } catch (e) {
            return null;
        }
    }

    _formatDuration(secs) {
        const s = Math.max(Math.round(secs), 0);
        if (s < 60)
            return _('%d second').replace('%d', String(s));
        const m = Math.floor(s / 60);
        if (m < 60)
            return _('%d minute').replace('%d', String(m));
        const h = Math.floor(m / 60);
        return _('%d hour').replace('%d', String(h));
    }

    _defaultLabel() {
        const labels = {
            COPY: _('Copying to Desktop…'),
            MOVE: _('Moving to Desktop…'),
            EXTRACT: _('Extracting files…'),
            COMPRESS: _('Compressing files…'),
        };
        return labels[this._type] || _('File operation…');
    }

    setLabel(text) {
        if (this._destroyed) return;
        this._primaryText = text;
        this._syncLabel();
    }

    setSecondaryLabel(text) {
        if (this._destroyed) return;
        this._secondaryText = text || null;
        this._manager._syncUI();
    }

    setProgress(currentBytes, totalBytes) {
        if (this._destroyed) return;
        const mgr = this._manager;
        if (mgr._item !== this && !mgr._queue.includes(this)) return;
        mgr._stopPulse();
        const fraction = totalBytes > 0 ? Math.min(currentBytes / totalBytes, 1.0) : 0;
        this._fraction = fraction;
        this._doneBytes = Math.max(currentBytes, 0);
        this._totalBytes = Math.max(totalBytes, 0);
        mgr._syncUI();
    }

    setCompleted() {
        if (this._destroyed) return;
        const mgr = this._manager;
        mgr._stopPulse();
        this._fraction = 1.0;
        this._finished = true;
        this._endState = 'done';
        mgr._syncUI();
        mgr._armHideTimerIfDone();
    }

    setError(message) {
        if (this._destroyed) return;
        const mgr = this._manager;
        mgr._stopPulse();
        this._fraction = 0;
        this._finished = true;
        this._endState = 'error';
        this._primaryText = message || _('Error');
        mgr._syncUI();
        mgr._armHideTimerIfDone();
    }

    /* Immediate cancel feedback (Nautilus parity): freeze the bar and flip
     * the row/pill to a terminal "Cancelling…" state the moment the user hits
     * cancel — never spin until the async op happens to unwind. Idempotent:
     * the caller's later setCancelled()/setError() finalizes it. */
    requestCancel() {
        if (this._finished)
            return;
        const mgr = this._manager;
        mgr._stopPulse();
        this._cancelledByUser = true;
        try {
            this._cancellable.cancel();
        } catch (e) {
        }
        if (typeof this.cancel === 'function') {
            try {
                this.cancel();
            } catch (e) {
            }
        }
        this._fraction = typeof this._fraction === 'number' ? this._fraction : 0;
        this._finished = true;
        this._endState = 'cancelled';
        this._primaryText = _('Cancelling…');
        mgr._syncUI();
        mgr._armHideTimerIfDone();
    }

    setCancelled(message) {
        if (this._destroyed) return;
        const mgr = this._manager;
        this._cancelled = true;
        /* Nautilus parity: a cancelled op flips to a brief "Cancelled" state
         * (bar freezes, spinner stops) then auto-hides via the same fade
         * path as completed — never a stuck pill. Idempotent with
         * requestCancel(): whichever runs first wins. */
        if (this._finished && this._endState === 'cancelled') {
            /* requestCancel() already flipped state; still honor the
             * caller's final message, then repaint. */
            if (message && this._primaryText !== message) {
                this._primaryText = message;
                mgr._syncUI();
            }
            return;
        }
        this._fraction = 0;
        this._finished = true;
        this._endState = 'cancelled';
        this._primaryText = message || _('Cancelled');
        mgr._stopPulse();
        mgr._syncUI();
        mgr._armHideTimerIfDone();
    }

    _syncLabel() {
        const mgr = this._manager;
        if (mgr._item === this || mgr._queue.includes(this))
            mgr._syncUI();
    }

    incrementCompleted() { this._completedItems++; }

    get completedItems() { return this._completedItems; }
    get totalItems() { return this._totalItems; }
    get cancellable() { return this._cancellable; }
    get cancelled() { return this._cancellable.is_cancelled(); }
    get cancelledByUser() { return this._cancelledByUser; }

    _destroy() {
        if (this._destroyed) return;
        this._destroyed = true;
        const q = this._manager._queue;
        const i = q.indexOf(this);
        if (i >= 0)
            q.splice(i, 1);
        this._cancellable.cancel();
    }
};
