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
 */
'use strict';
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Gdk = imports.gi.Gdk;
const Gtk = imports.gi.Gtk;

const Gettext = imports.gettext.domain('ding');

const _ = Gettext.gettext;

var FileProgressManager = class {
    constructor(desktopManager) {
        this._desktopManager = desktopManager;
        this._item = null;
        this._inhibitCookie = null;
        this._pulseTimer = null;
        this._window = null;
        this._statusLabel = null;
        this._progressBar = null;
        this._cancelBtn = null;
    }

    addOperation(id, type, totalItems, message) {
        this._ensureWindow();
        if (this._item)
            this._item._destroy();
        this._item = new FileProgressItem(this, id, type, totalItems, message);
        this._syncUI();
        this._startPulse();
        this._window.show_all();
        this._window.present();
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
        if (this._window)
            this._window.hide();
        if (this._inhibitCookie !== null) {
            this._desktopManager.mainApp.uninhibit(this._inhibitCookie);
            this._inhibitCookie = null;
        }
    }

    _ensureWindow() {
        if (this._window)
            return;

        this._window = new Gtk.Window({
            title: _('File Operations'),
            resizable: false,
            deletable: false,
            modal: false,
            default_width: 400,
            window_position: Gtk.WindowPosition.CENTER_ALWAYS,
        });
        this._window.get_style_context().add_class('file-progress-popup');
        this._window.connect('delete-event', () => true);

        const outer = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 2,
            margin_top: 10,
            margin_bottom: 10,
            margin_start: 14,
            margin_end: 14,
        });
        outer.get_style_context().add_class('file-progress-popup-box');
        outer.override_background_color(Gtk.StateFlags.NORMAL,
            new Gdk.RGBA({ red: 0.14, green: 0.14, blue: 0.14, alpha: 0.93 }));

        const headerBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 8,
        });

        this._statusLabel = new Gtk.Label({
            label: '',
            halign: Gtk.Align.START,
            xalign: 0,
            hexpand: true,
        });
        this._statusLabel.get_style_context().add_class('file-progress-status');

        this._cancelBtn = new Gtk.Button({ label: _('Cancel') });
        this._cancelBtn.get_style_context().add_class('file-progress-popup-cancel');
        this._cancelBtn.connect('clicked', () => {
            if (this._item) {
                this._item._cancelledByUser = true;
                this._item._cancellable.cancel();
            }
        });

        headerBox.pack_start(this._statusLabel, true, true, 0);
        headerBox.pack_start(this._cancelBtn, false, false, 0);

        this._progressBar = new Gtk.ProgressBar();
        this._progressBar.get_style_context().add_class('file-progress-popup-bar');
        this._progressBar.set_show_text(false);

        outer.pack_start(headerBox, false, true, 0);
        outer.pack_start(this._progressBar, false, true, 0);
        this._window.add(outer);
    }

    _syncUI() {
        if (!this._item || !this._statusLabel)
            return;
        this._statusLabel.set_label(this._item._primaryText || this._item._defaultLabel());
        this._progressBar.set_fraction(0);
    }

    _startPulse() {
        this._stopPulse();
        this._pulseTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
            if (!this._item || !this._progressBar) {
                this._stopPulse();
                return false;
            }
            this._progressBar.pulse();
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
    }

    _defaultLabel() {
        const labels = {
            COPY: _('Copying to Desktop…'),
            MOVE: _('Moving to Desktop…'),
            TRASH: _('Moving to Trash…'),
            DELETE: _('Deleting…'),
            EMPTY_TRASH: _('Emptying Trash…'),
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
        const mgr = this._manager;
        if (mgr._item === this && mgr._statusLabel) {
            const primary = this._primaryText || this._defaultLabel();
            mgr._statusLabel.set_label(text ? primary + ' - ' + text : primary);
        }
    }

    setProgress(currentBytes, totalBytes) {
        if (this._destroyed) return;
        const mgr = this._manager;
        if (mgr._item !== this) return;
        mgr._stopPulse();
        const fraction = totalBytes > 0 ? Math.min(currentBytes / totalBytes, 1.0) : 0;
        if (mgr._progressBar)
            mgr._progressBar.set_fraction(fraction);
    }

    setCompleted() {
        if (this._destroyed) return;
        const mgr = this._manager;
        mgr._stopPulse();
        if (mgr._progressBar) mgr._progressBar.set_fraction(1.0);
        if (mgr._statusLabel && mgr._item === this)
            mgr._statusLabel.set_label(_('Completed'));
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1200, () => {
            if (!this._destroyed) this._manager.removeOperation();
            return false;
        });
    }

    setError(message) {
        if (this._destroyed) return;
        const mgr = this._manager;
        mgr._stopPulse();
        if (mgr._progressBar) mgr._progressBar.set_fraction(0);
        if (mgr._statusLabel && mgr._item === this)
            mgr._statusLabel.set_label(message || _('Error'));
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 4000, () => {
            if (!this._destroyed) this._manager.removeOperation();
            return false;
        });
    }

    setCancelled() {
        if (this._destroyed) return;
        this._cancelled = true;
        const mgr = this._manager;
        mgr._stopPulse();
        if (mgr._progressBar) mgr._progressBar.set_fraction(0);
        if (mgr._statusLabel && mgr._item === this)
            mgr._statusLabel.set_label(_('Cancelled'));
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => {
            if (!this._destroyed) this._manager.removeOperation();
            return false;
        });
    }

    _syncLabel() {
        const mgr = this._manager;
        if (mgr._item === this && mgr._statusLabel)
            mgr._statusLabel.set_label(this._primaryText || this._defaultLabel());
    }

    incrementCompleted() { this._completedItems++; }

    get completedItems() { return this._completedItems; }
    get totalItems() { return this._totalItems; }
    get cancellable() { return this._cancellable; }
    get cancelled() { return this._cancelled || this._cancellable.is_cancelled(); }
    get cancelledByUser() { return this._cancelledByUser; }

    _destroy() {
        if (this._destroyed) return;
        this._destroyed = true;
        this._cancellable.cancel();
    }
};
