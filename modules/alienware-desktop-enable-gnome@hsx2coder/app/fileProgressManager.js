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
    constructor(desktopManager) {
        this._desktopManager = desktopManager;
        this._item = null;
        this._inhibitCookie = null;
        this._pulseTimer = null;
        /* Per-grid bubble widgets: [{grid, overlay, revealer, pill, ...}]. */
        this._bubbles = [];
        this._expanded = false;
        this._pointerInCard = false;
        this._hideTimer = null;
        this._queue = [];
    }

    addOperation(id, type, totalItems, message) {
        this._ensureBubbles();
        /* Multi-op: prior _item stays tracked — the ctor registers every
         * item in _queue, so _allOps() sees them all like the Nautilus
         * operations list. */
        this._item = new FileProgressItem(this, id, type, totalItems, message);
        this._syncUI();
        this._startPulse();
        this._showBubbles();
        if (!this._inhibitCookie) {
            this._inhibitCookie = this._desktopManager.mainApp.inhibit(null,
                Gtk.ApplicationInhibitFlags.LOGOUT | Gtk.ApplicationInhibitFlags.SUSPEND,
                message || _('File operation in progress'));
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

    /* External ops (e.g. AutoAr extract/compress dialogs) join the bubble
     * queue without displacing the active copy/paste item. op shape:
     * {_primaryText|_defaultLabel(), _fraction|undefined, _finished,
     *  _cancellable?, cancel?(), _cancelledByUser}. */
    registerExternal(op) {
        this._ensureBubbles();
        /* Plain-object externals (AutoAr) get the same immediate-cancel path
         * as internal items so every row paints terminal state on click. */
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

    _refreshBubbleVisibility() {
        if (this._item || this._queue.length)
            this._showBubbles();
        else
            this._hideBubbles();
    }

    /* Attach (or re-attach) a Nautilus-style bubble to every desktop grid
     * window. Each DesktopGrid owns its own Gtk.ApplicationWindow holding an
     * EventBox > Gtk.Fixed tree, so wrap the EventBox in a Gtk.Overlay once
     * and pin a Revealer pill bottom-left. Safe to call repeatedly (menus,
     * geometry updates, grid rebuilds). */
    _ensureBubbles() {
        const grids = this._desktopManager._desktops || [];
        const alive = [];
        for (let grid of grids) {
            try {
                if (!grid || !grid._window || !grid._eventBox)
                    continue;
                let bubble = null;
                for (let b of this._bubbles) {
                    if (b.grid === grid && b.window === grid._window) {
                        bubble = b;
                        break;
                    }
                }
                if (!bubble)
                    bubble = this._buildBubble(grid);
                if (bubble)
                    alive.push(bubble);
            } catch (e) {
                print(`FileProgress bubble attach failed: ${e.message}`);
            }
        }
        this._bubbles = alive;
    }

    _buildBubble(grid) {
        const eventBox = grid._eventBox;
        let overlay = null;
        const parent = eventBox.get_parent();
        if (parent instanceof Gtk.Overlay)
            overlay = parent;
        if (!overlay) {
            overlay = new Gtk.Overlay();
            overlay.show();
            /* Re-parent the EventBox under the overlay, keeping position. */
            parent.remove(eventBox);
            overlay.add(eventBox);
            parent.add(overlay);
            overlay.show_all();
        }
        const revealer = new Gtk.Revealer({
            halign: Gtk.Align.START,
            valign: Gtk.Align.END,
            margin_start: BUBBLE_MARGIN_START,
            margin_bottom: BUBBLE_MARGIN_BOTTOM,
            transition_type: Gtk.RevealerTransitionType.SLIDE_UP,
            transition_duration: REVEAL_MS,
            reveal_child: false,
        });
        revealer.get_style_context().add_class('ding-transfer-revealer');

        /* EventBox gives the pill its own GdkWindow: opaque bg paint + reliable
         * button/hover input (plain Gtk.Box has no window by default). */
        const pill = new Gtk.EventBox();
        pill.get_style_context().add_class('ding-transfer-pill');
        pill.set_visible_window(true);
        pill.set_above_child(false);
        pill.add_events(Gdk.EventMask.BUTTON_PRESS_MASK | Gdk.EventMask.ENTER_NOTIFY_MASK | Gdk.EventMask.LEAVE_NOTIFY_MASK);

        const box = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 10,
        });
        box.get_style_context().add_class('ding-transfer-box');
        pill.add(box);

        const spinner = new Gtk.Spinner({ active: false });
        spinner.get_style_context().add_class('ding-transfer-spinner');
        box.pack_start(spinner, false, false, 0);

        const labels = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 0,
        });
        labels.get_style_context().add_class('ding-transfer-labels');
        box.pack_start(labels, true, true, 0);

        const primary = new Gtk.Label({
            label: '',
            halign: Gtk.Align.START,
            xalign: 0,
            hexpand: true,
            ellipsize: 2, /* PANGO_ELLIPSIZE_MIDDLE, like Nautilus */
            max_width_chars: 40,
            single_line_mode: true,
        });
        primary.get_style_context().add_class('ding-transfer-primary');
        labels.pack_start(primary, false, true, 0);

        const details = new Gtk.Label({
            label: '',
            halign: Gtk.Align.START,
            xalign: 0,
            hexpand: true,
            ellipsize: 2,
            max_width_chars: 40,
            single_line_mode: true,
            no_show_all: true,
        });
        details.get_style_context().add_class('ding-transfer-details');
        labels.pack_start(details, false, true, 0);

        const bar = new Gtk.ProgressBar();
        bar.get_style_context().add_class('ding-transfer-bar');
        bar.set_show_text(false);
        bar.set_fraction(0);
        labels.pack_start(bar, false, true, 0);

        const stopBtn = new Gtk.Button({
            image: new Gtk.Image({ icon_name: 'process-stop-symbolic' }),
        });
        stopBtn.get_style_context().add_class('ding-transfer-stop');
        stopBtn.get_style_context().add_class('circular');
        stopBtn.get_style_context().add_class('flat');
        stopBtn.set_valign(Gtk.Align.CENTER);
        stopBtn.set_tooltip_text(_('Cancel'));
        stopBtn.connect('clicked', () => {
            const ops = this._allOps().filter(o => !o._finished);
            const target = ops[ops.length - 1];
            if (target && typeof target.requestCancel === 'function')
                target.requestCancel();
            else if (target) {
                /* External op without the method: best-effort cancel flags. */
                try {
                    target._cancelledByUser = true;
                } catch (e) {
                }
                try {
                    if (target._cancellable)
                        target._cancellable.cancel();
                } catch (e) {
                }
                if (typeof target.cancel === 'function') {
                    try {
                        target.cancel();
                    } catch (e) {
                    }
                }
                this._syncUI();
            }
        });
        box.pack_start(stopBtn, false, false, 0);

        /* Click-only expansion (Nautilus parity): the operations popover
         * opens on left-click, never on hover. Hover only pauses auto-hide. */
        pill.connect('button-press-event', (widget, event) => {
            try {
                const [, button] = event.get_button();
                if (button !== 1)
                    return false;
            } catch (e) {
            }
            this._toggleExpanded();
            return true;
        });
        /* Hover pauses auto-hide, like Nautilus floating-bar hover tracking. */
        pill.connect('enter-notify-event', () => {
            this._clearHideTimer();
            return false;
        });
        pill.connect('leave-notify-event', () => {
            /* Moving onto the queue card is not "leaving": keep it open
             * while the pointer is over pill OR card. */
            if (!this._pointerInCard)
                this._armHideTimerIfDone();
            return false;
        });

        revealer.add(pill);
        overlay.add_overlay(revealer);
        overlay.set_overlay_pass_through(revealer, true);
        revealer.show_all();
        details.hide();
        revealer.reveal_child = false;

        try {
            if (!grid._window._dingEscHooked) {
                grid._window._dingEscHooked = true;
                grid._window.connect('key-press-event', (w, event) => {
                    try {
                        const [, keyval] = event.get_keyval();
                        if (keyval === Gdk.KEY_Escape && this._expanded) {
                            this._toggleExpanded();
                            return true;
                        }
                    } catch (e) {
                    }
                    return false;
                });
            }
        } catch (e) {
        }
        const bubble = {
            grid, window: grid._window, overlay, revealer, pill,
            spinner, primary, details, bar, stopBtn,
            queueCard: null, queueList: null,
        };
        if (this._item)
            this._paintBubble(bubble);
        return bubble;
    }

    _paintBubble(b) {
        /* Multi-op header (Nautilus parity): newest unfinished op is the
         * headline; when >1 running, pill shows "Copying 2 Folders…" style
         * summary + aggregate bar. Finished-only state shows last. */
        const active = this._allOps().filter(o => !o._finished);
        const item = active[active.length - 1] || this._allOps()[this._allOps().length - 1];
        if (!item)
            return;
        if (active.length > 1) {
            /* Nautilus shows the running op count against the verb, e.g.
             * "Copying 2 Folders". Verb comes from the newest op type. */
            const verbs = {
                COPY: [_('Copying %d File'), _('Copying %d Files')],
                MOVE: [_('Moving %d File'), _('Moving %d Files')],
                TRASH: [_('Moving %d File to Trash'), _('Moving %d Files to Trash')],
                DELETE: [_('Deleting %d File'), _('Deleting %d Files')],
                EMPTY_TRASH: [_('Emptying Trash'), _('Emptying Trash')],
                EXTRACT: [_('Extracting %d File'), _('Extracting %d Files')],
                COMPRESS: [_('Compressing %d File'), _('Compressing %d Files')],
            };
            const pair = verbs[item._type] || [_('Copying %d File'), _('Copying %d Files')];
            const nOps = active.length;
            const tmpl = nOps === 1 ? pair[0] : pair[1];
            const summary = tmpl.includes('%d') ? tmpl.replace('%d', String(nOps)) : tmpl;
            b.primary.set_label(summary);
            let sum = 0, n = 0;
            for (let o of active) {
                if (typeof o._fraction === 'number') {
                    sum += o._fraction;
                    n++;
                }
            }
            if (n === active.length && n > 0) {
                b.bar.set_fraction(sum / n);
                b.spinner.stop();
            } else {
                b.spinner.start();
            }
            const headlineDetail = (typeof item._detailText === 'function' && item._detailText()) || item._secondaryText || '';
            if (headlineDetail) {
                b.details.set_label(headlineDetail);
                b.details.show();
            } else {
                b.details.set_label('');
                b.details.hide();
            }
        } else {
            const primary = item._primaryText || item._defaultLabel();
            b.primary.set_label(primary);
            const detailText = (typeof item._detailText === 'function' && item._detailText()) || item._secondaryText || '';
            if (detailText) {
                b.details.set_label(detailText);
                b.details.show();
            } else {
                b.details.set_label('');
                b.details.hide();
            }
            if (typeof item._fraction === 'number') {
                b.bar.set_fraction(item._fraction);
                b.spinner.stop();
            } else {
                b.spinner.start();
            }
        }
        b.stopBtn.set_sensitive(!item._finished);
        if (this._expanded && !this._queuePaintIdle) {
            this._queuePaintIdle = true;
            GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                this._queuePaintIdle = false;
                try {
                    for (let bb of this._bubbles)
                        this._paintQueueCard(bb);
                } catch (e) {
                }
                return false;
            });
        }
    }

    _syncUI() {
        this._ensureBubbles();
        for (let b of this._bubbles)
            this._paintBubble(b);
        /* Queue card rebuild is expensive (destroys/recreates rows); coalesce
         * rapid progress updates into one idle paint. */
        if (this._expanded && !this._queuePaintIdle) {
            this._queuePaintIdle = true;
            GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                this._queuePaintIdle = false;
                try {
                    for (let b of this._bubbles)
                        this._paintQueueCard(b);
                } catch (e) {
                }
                return false;
            });
        }
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
        this._expanded = false;
    }

    _clearHideTimer() {
        if (this._hideTimer) {
            GLib.source_remove(this._hideTimer);
            this._hideTimer = null;
        }
    }

    _armHideTimerIfDone() {
        /* Auto open/close (Nautilus parity):
         * - any unfinished op -> pill stays, card stays as the user left it
         * - all finished -> card STAYS open through the hide delay so terminal
         *   states (Completed/Cancelled/Error per row) remain readable, then
         *   the timer collapses + hides everything together. */
        if (this._allOps().some(o => !o._finished))
            return;
        if (!this._item || !this._item._finished) {
            if (this._queue.length)
                return;
            if (!this._item)
                return;
        }
        this._clearHideTimer();
        const delay = this._item._endState === 'error'
            ? AUTOHIDE_ERROR_MS
            : this._item._endState === 'cancelled'
                ? AUTOHIDE_CANCELLED_MS
                : AUTOHIDE_COMPLETED_MS;
        const finishedItem = this._item;
        this._hideTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            this._hideTimer = null;
            /* Drop finished ops that never unregistered (defensive); then if
             * nothing is left running, collapse the queue card first so the
             * popover can never strand open on a finished op. */
            for (let i = this._queue.length - 1; i >= 0; i--) {
                if (this._queue[i]._finished)
                    this._queue.splice(i, 1);
            }
            if (!this._item || this._item === finishedItem)
                this.removeOperation();
            else
                this._refreshBubbleVisibility();
            return false;
        });
    }

    /* Every tracked op in creation order. The ctor registers each item
     * in _queue (internal + external alike); _item is just the newest. */
    _allOps() {
        return [...this._queue];
    }

    _toggleExpanded() {
        this._expanded = !this._expanded;
        for (let b of this._bubbles)
            this._paintQueueCard(b);
        /* Collapsing re-arms auto-hide; expanding pins while user inspects. */
        if (!this._expanded)
            this._armHideTimerIfDone();
        else
            this._clearHideTimer();
    }

    /* Expanded queue card: one row per queued operation with its own label,
     * progress bar and cancel button — the overlay-popover equivalent of
     * Nautilus operations ListBox. Single active item today; queue grows as
     * extract/compress bridges register. */
    _paintQueueCard(b) {
        if (!this._expanded) {
            if (b.queueCard) {
                b.queueCard.destroy();
                b.queueCard = null;
                b.queueList = null;
            }
            return;
        }
        if (!b.queueCard) {
            const card = new Gtk.Frame();
            card.get_style_context().add_class('ding-transfer-queue');
            card.set_halign(Gtk.Align.START);
            card.set_valign(Gtk.Align.END);
            card.set_margin_start(BUBBLE_MARGIN_START);
            card.set_margin_bottom(BUBBLE_MARGIN_BOTTOM + 56);
            const list = new Gtk.ListBox();
            list.get_style_context().add_class('ding-transfer-queue-list');
            list.set_selection_mode(Gtk.SelectionMode.NONE);
            card.add(list);
            card.add_events(Gdk.EventMask.ENTER_NOTIFY_MASK | Gdk.EventMask.LEAVE_NOTIFY_MASK);
            card.connect('enter-notify-event', () => {
                this._pointerInCard = true;
                this._clearHideTimer();
                return false;
            });
            card.connect('leave-notify-event', () => {
                this._pointerInCard = false;
                this._armHideTimerIfDone();
                return false;
            });
            b.overlay.add_overlay(card);
            b.overlay.set_overlay_pass_through(card, true);
            card.show_all();
            b.queueCard = card;
            b.queueList = list;
        }
        const list = b.queueList;
        for (let row of list.get_children())
            row.destroy();
        const seen = new Set();
        const rows = [];
        /* Queue rows: newest op first, every op (internal + external) gets
         * its own row with label/bar/cancel — mirrors Nautilus ops list. */
        for (let op of this._allOps().slice().reverse()) {
            if (seen.has(op))
                continue;
            seen.add(op);
            rows.push(op);
        }
        for (let op of rows) {
            const row = new Gtk.ListBoxRow();
            row.get_style_context().add_class('ding-transfer-queue-row');
            if (op._finished)
                row.get_style_context().add_class('ding-transfer-done');
            const v = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 2 });
            v.get_style_context().add_class('ding-transfer-row-v');
            const h = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 8 });
            const lab = new Gtk.Label({
                label: op._primaryText || (op._defaultLabel && op._defaultLabel()) || '',
                halign: Gtk.Align.START, xalign: 0, hexpand: true,
                ellipsize: 2, max_width_chars: 32, single_line_mode: true,
            });
            h.pack_start(lab, true, true, 0);
            const pbar = new Gtk.ProgressBar();
            pbar.get_style_context().add_class('ding-transfer-bar');
            pbar.set_show_text(false);
            pbar.set_fraction(typeof op._fraction === 'number' ? op._fraction : 0);
            pbar.set_hexpand(true);
            h.pack_start(pbar, true, true, 0);
            if (op._finished) {
                const st = new Gtk.Label({
                    label: (typeof op._detailText === 'function' && op._detailText()) || '',
                    halign: Gtk.Align.END,
                });
                st.get_style_context().add_class('ding-transfer-row-status');
                h.pack_start(st, false, false, 0);
            }
            if (!op._finished) {
                const cancel = new Gtk.Button({
                    image: new Gtk.Image({ icon_name: 'process-stop-symbolic' }),
                });
                cancel.get_style_context().add_class('ding-transfer-stop');
                cancel.get_style_context().add_class('circular');
                cancel.get_style_context().add_class('flat');
                const target = op;
                cancel.connect('clicked', () => {
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
                h.pack_start(cancel, false, false, 0);
            }
            const detail = new Gtk.Label({
                label: (typeof op._detailText === 'function' ? op._detailText() : '') || '',
                halign: Gtk.Align.START,
                xalign: 0,
                ellipsize: 2,
                max_width_chars: 40,
                single_line_mode: true,
            });
            detail.get_style_context().add_class('ding-transfer-row-detail');
            v.pack_start(h, false, false, 0);
            v.pack_start(detail, false, false, 0);
            row.add(v);
            list.add(row);
        }
        list.show_all();
    }

    _startPulse() {
        this._stopPulse();
        this._pulseTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, PULSE_MS, () => {
            if (!this._item || typeof this._item._fraction === 'number') {
                this._stopPulse();
                return false;
            }
            /* Indeterminate: keep spinners turning; bars stay pulsing. */
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
    _detailText() {
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
        if (this._totalItems > 0 && this._completedItems >= 0)
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
                ' (%s/s)'.replace('%s', GLib.format_size(Math.round(rate)));
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
            TRASH: _('Moving to Trash…'),
            DELETE: _('Deleting…'),
            EMPTY_TRASH: _('Emptying Trash…'),
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
         * path as completed — never a stuck pill. */
        this._fraction = null;
        this._finished = true;
        this._endState = 'cancelled';
        this._primaryText = message || _('Cancelled');
        mgr._stopPulse();
        mgr._stopPulse();
        this._fraction = 0;
        this._finished = true;
        this._endState = 'cancelled';
        this._primaryText = _('Cancelled');
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
