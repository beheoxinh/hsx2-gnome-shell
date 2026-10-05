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

    _armHideTimerIfDone() {
        /* Auto-hide: while any op runs, stay. When all finished, keep every
         * card readable through the delay, then hide all at once. */
        if (this._allOps().some(o => !o._finished))
            return;
        if (!this._allOps().length)
            return;
        this._clearHideTimer();
        const last = this._allOps()[this._allOps().length - 1];
        const delay = last._endState === 'error'
            ? AUTOHIDE_ERROR_MS
            : last._endState === 'cancelled'
                ? AUTOHIDE_CANCELLED_MS
                : AUTOHIDE_COMPLETED_MS;
        this._hideTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            this._hideTimer = null;
            /* Drop finished ops that never unregistered (defensive). */
            for (let i = this._queue.length - 1; i >= 0; i--) {
                if (this._queue[i]._finished)
                    this._queue.splice(i, 1);
            }
            if (this._queue.length)
                this._refreshBubbleVisibility();
            else
                this.removeOperation();
            return false;
        });
    }

    _syncUI() {
        this._ensureBubbles();
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
        for (let child of b.list.get_children())
            child.destroy();
        const seen = new Set();
        for (let op of this._allOps()) {
            if (seen.has(op))
                continue;
            seen.add(op);
            b.list.add(this._buildCard(op));
        }
        // ponytail: full rebuild per paint; ops stay <10 so O(n) is trivial.
        b.list.show_all();
    }

    _buildCard(op) {
        const card = new Gtk.EventBox();
        card.get_style_context().add_class('ding-transfer-pill');
        card.set_visible_window(true);
        card.set_above_child(false);
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 10,
        });
        box.get_style_context().add_class('ding-transfer-box');
        card.add(box);
        const spinner = new Gtk.Spinner();
        spinner.get_style_context().add_class('ding-transfer-spinner');
        spinner.set_valign(Gtk.Align.CENTER);
        box.pack_start(spinner, false, false, 0);
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
        const detailText = (typeof op._detailText === 'function' && op._detailText()) || op._secondaryText || '';
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
        bar.set_fraction(typeof op._fraction === 'number' ? op._fraction : 0);
        bar.set_hexpand(true);
        labels.pack_start(bar, false, true, 0);
        if (typeof op._fraction === 'number')
            spinner.stop();
        else if (!op._finished)
            spinner.start();
        else
            spinner.stop();
        if (!op._finished) {
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
            box.pack_start(stopBtn, false, false, 0);
        } else {
            const st = new Gtk.Label({
                label: (typeof op._detailText === 'function' && op._detailText()) || '',
                halign: Gtk.Align.END,
            });
            st.get_style_context().add_class('ding-transfer-row-status');
            box.pack_start(st, false, false, 0);
            card.get_style_context().add_class('ding-transfer-done');
        }
        /* Hover pauses auto-hide, like Nautilus floating-bar hover tracking. */
        card.add_events(Gdk.EventMask.ENTER_NOTIFY_MASK | Gdk.EventMask.LEAVE_NOTIFY_MASK);
        card.connect('enter-notify-event', () => {
            this._clearHideTimer();
            return false;
        });
        card.connect('leave-notify-event', () => {
            this._armHideTimerIfDone();
            return false;
        });
        return card;
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
