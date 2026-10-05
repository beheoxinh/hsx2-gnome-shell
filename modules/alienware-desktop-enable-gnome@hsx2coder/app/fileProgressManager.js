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
        this._hideTimer = null;
        this._queue = [];
    }

    addOperation(id, type, totalItems, message) {
        this._ensureBubbles();
        if (this._item)
            this._item._destroy();
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
            if (this._item) {
                this._item._cancelledByUser = true;
                this._item._cancellable.cancel();
            }
        });
        box.pack_start(stopBtn, false, false, 0);

        /* Click on the pill toggles the expanded queue card, like clicking
         * the Nautilus progress indicator opens the operations popover. */
        pill.connect('button-press-event', () => {
            this._toggleExpanded();
            return true;
        });
        /* Hover pauses auto-hide, like Nautilus floating-bar hover tracking. */
        pill.connect('enter-notify-event', () => {
            this._clearHideTimer();
            return false;
        });
        pill.connect('leave-notify-event', () => {
            this._armHideTimerIfDone();
            return false;
        });

        revealer.add(pill);
        overlay.add_overlay(revealer);
        overlay.set_overlay_pass_through(revealer, true);
        revealer.show_all();
        details.hide();
        revealer.reveal_child = false;

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
        /* Header shows the active copy/paste item; when none, fall back to
         * the first unfinished external op (e.g. AutoAr extract/compress). */
        const item = this._item || this._queue.find(o => !o._finished) || this._queue[0];
        if (!item)
            return;
        const primary = item._primaryText || item._defaultLabel();
        b.primary.set_label(primary);
        if (item._secondaryText) {
            b.details.set_label(item._secondaryText);
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
        if (this._queue.some(o => !o._finished))
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
            /* Drop finished externals that never unregistered (defensive). */
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

    _toggleExpanded() {
        this._expanded = !this._expanded;
        for (let b of this._bubbles)
            this._paintQueueCard(b);
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
        for (let op of this._queue.concat(this._item ? [this._item] : [])) {
            if (seen.has(op))
                continue;
            seen.add(op);
            rows.push(op);
        }
        for (let op of rows) {
            const row = new Gtk.ListBoxRow();
            row.get_style_context().add_class('ding-transfer-queue-row');
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
            if (!op._finished) {
                const cancel = new Gtk.Button({
                    image: new Gtk.Image({ icon_name: 'process-stop-symbolic' }),
                });
                cancel.get_style_context().add_class('ding-transfer-stop');
                cancel.get_style_context().add_class('circular');
                cancel.get_style_context().add_class('flat');
                const target = op;
                cancel.connect('clicked', () => {
                    target._cancelledByUser = true;
                    try {
                        target._cancellable.cancel();
                    } catch (e) {
                    }
                    if (target.cancel)
                        target.cancel();
                });
                h.pack_start(cancel, false, false, 0);
            }
            row.add(h);
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
        if (!this._manager._queue.includes(this))
            this._manager._queue.push(this);
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
        if (mgr._item !== this) return;
        mgr._stopPulse();
        const fraction = totalBytes > 0 ? Math.min(currentBytes / totalBytes, 1.0) : 0;
        this._fraction = fraction;
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

    setCancelled() {
        if (this._destroyed) return;
        this._cancelled = true;
        const mgr = this._manager;
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
        if (mgr._item === this)
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
