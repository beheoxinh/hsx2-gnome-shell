/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */

// system-monitor: Gnome shell extension displaying system informations in gnome shell status bar, such as memory usage, cpu usage, network rates…
// Copyright (C) 2011 Florian Mounier aka paradoxxxzero

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

// Author: Florian Mounier aka paradoxxxzero

import { Extension, gettext as _ } from "resource:///org/gnome/shell/extensions/extension.js";

import Clutter from "gi://Clutter";
import GLib from "gi://GLib";
import GObject from "gi://GObject";
import Cogl from "gi://Cogl";

import Gio from "gi://Gio";
import Shell from "gi://Shell";
import St from "gi://St";
import UPowerGlib from "gi://UPowerGlib";
import GTop from "gi://GTop";
import NM from "gi://NM";

import * as ExtensionSystem from "resource:///org/gnome/shell/ui/extensionSystem.js";

import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";

import * as Util from "resource:///org/gnome/shell/misc/util.js";

import { sm_log } from './utils.js';
import { parse_bytearray, check_sensors } from './common.js';
import { migrateSettings } from './migration.js'
import { PanelHost } from '../alienware-topbar@hsx2coder/subsystems/panel/host.js';

const NetworkManager = NM;
const UPower = UPowerGlib;
// Copied as of https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/5fa08fe53376f5dca755360bd005a4a51ca78917/js/ui/panel.js#L45
const PANEL_ICON_SIZE = 16;

// stale network shares will cause the shell to freeze, enable this with caution
const ENABLE_NETWORK_DISK_USAGE = false;

Clutter.Actor.prototype.raise_top = function raise_top() {
    const parent = this.get_parent();
    if (!parent) {
        return;
    }
    parent.set_child_above_sibling(this, null);
}
Clutter.Actor.prototype.reparent = function reparent(newParent) {
    const parent = this.get_parent();
    if (parent) {
        parent.remove_child(this);
    }
    newParent.add_child(this);
}

function l_limit(t) {
    return (t > 0) ? t : 1000;
}

function change_text() {
    this.label.visible = this.extension._Schema.get_boolean(this.elt + '-show-text');
}

function change_style() {
    let style = this.extension._Schema.get_string(this.elt + '-style');
    this.text_box.visible = style === 'digit' || style === 'both';
    this.chart.actor.visible = style === 'graph' || style === 'both';
}

function build_menu_info(extension) {
    let elts = extension.__sm.elts;
    let tray_menu = extension.__sm.tray.menu;

    if (tray_menu._getMenuItems().length &&
        typeof tray_menu._getMenuItems()[0].actor.get_last_child() !== 'undefined') {
        tray_menu._getMenuItems()[0].actor.get_last_child().destroy_all_children();
        for (let elt in elts) {
            elts[elt].menu_items = elts[elt].create_menu_items();
        }
    } else {
        return;
    }

    let menu_info_box_table = new St.Widget({
        style_class: 'sm-info-table',
        style: 'spacing-rows: 0px; spacing-columns: 20px;',
        layout_manager: new Clutter.GridLayout({ orientation: Clutter.Orientation.VERTICAL })
    });
    let menu_info_box_table_layout = menu_info_box_table.layout_manager;

    // Populate Table
    let max_cols = 1;
    for (let elt in elts) {
        if (elts[elt].menu_visible && elts[elt].menu_items) {
            const perRow = Math.ceil(elts[elt].menu_items.length / (elts[elt].menu_rows || 1));
            max_cols = Math.max(max_cols, 1 + perRow);
        }
    }

    let row_index = 0;

    const addSeparator = (span) => {
        let separator = new St.Widget({
            style: 'background-color: rgba(255, 255, 255, 0.05); height: 1px; margin-top: 8px; margin-bottom: 8px;',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER
        });
        menu_info_box_table_layout.attach(separator, 0, row_index, span || max_cols, 1);
        row_index++;
    };

    addSeparator();

    for (let elt in elts) {
        if (!elts[elt].menu_visible) {
            continue;
        }

        const rows = elts[elt].menu_rows || 1;
        const items = elts[elt].menu_items;
        const cols = Math.max(1, Math.ceil(items.length / rows));

        // Add item name to table spanning all rows
        menu_info_box_table_layout.attach(
            new St.Label({
                text: elts[elt].item_name,
                style_class: extension._Style.get('sm-title'),
                style: 'min-width: 80px; padding-right: 5px;',
                x_align: Clutter.ActorAlign.START,
                y_align: Clutter.ActorAlign.CENTER
            }), 0, row_index, 1, rows);

        // Add item data to table distributed across rows
        for (let i = 0; i < items.length; i++) {
            const r = Math.floor(i / cols);
            const c = (i % cols) + 1;
            menu_info_box_table_layout.attach(
                items[i], c, row_index + r, 1, 1);
        }

        row_index += rows;

        addSeparator();
    }
    tray_menu._getMenuItems()[0].actor.get_last_child().add_child(menu_info_box_table);
}

function change_menu() {
    this.menu_visible = this.extension._Schema.get_boolean(this.elt + '-show-menu');
    build_menu_info(this.extension);
}

function change_usage(extension) {
    let usage = extension._Schema.get_string('disk-usage-style');
    extension.__sm.pie.show(usage === 'pie');
    extension.__sm.bar.show(usage === 'bar');
}

function cogl_color_from_string(colorString) {
    let [ok, color] = Cogl.Color.from_string(colorString);
    if (!ok) {
        sm_log(`Failed to parse color string (${colorString}). Falling back to red.`);
        color = new Cogl.Color();
        Cogl.Color.init_from_4ub(color, 255, 0, 0, 255);
    }
    return color;
}

function clutter_color_from_string(colorString) {
    return Clutter.Color.from_string(colorString)[1];
}

function color_from_string(colorString) {
    if (Cogl.Color.from_string)
        return cogl_color_from_string(colorString);
    return clutter_color_from_string(colorString);
}

function interesting_mountpoint(mount) {
    if (mount.length < 3) {
        return false;
    }

    return ((mount[0].indexOf('/dev/') === 0 || mount[2].toLowerCase() === 'nfs') && mount[2].toLowerCase() !== 'udf');
}

// Gnome 45 Clutter.cairo_set_source_color compatibility
function sm_cairo_set_source_color(cr, bg_color) {
    if (Clutter.cairo_set_source_color)
        Clutter.cairo_set_source_color(cr, bg_color);
    else
        cr.setSourceColor(bg_color);
}

function try_read_int_file(filename, callback) {
    if (filename && GLib.file_test(filename, GLib.FileTest.EXISTS)) {
        let file = Gio.file_new_for_path(filename);
        file.load_contents_async(null, (source, result) => {
            let as_r = source.load_contents_finish(result);
            callback(parseInt(parse_bytearray(as_r[1])));
        });
        return true;
    }
}

// Returns used blocks, total blocks (matching `df` Size column), and
// available blocks (matching `df` Avail column). Percentage is computed
// separately as `used / (used + avail)` to match `df` Use%.
function calc_usage(statfs) {
    const used = statfs.blocks - statfs.bfree;
    return {
        used,
        total: statfs.blocks,
        avail: statfs.bavail
    };
}

const smStyleManager = class SystemMonitor_smStyleManager {
    constructor(extension) {
        this.extension = extension;
        this._suffix = '';
        this._iconsize = 1;
        this._diskunits = _('MiB/s');
        this._netunits_kbytes = _('KiB/s');
        this._netunits_mbytes = _('MiB/s');
        this._netunits_gbytes = _('GiB/s');
        this._netunits_kbits = _('kbit/s');
        this._netunits_mbits = _('Mbit/s');
        this._netunits_gbits = _('Gbit/s');
        this._pie_size = 300;
        this._pie_fontsize = 14;
        this._bar_width = 300;

        this._bar_thickness = 15;
        this._bar_fontsize = 14;
        this._compact = this.extension._Schema.get_boolean('compact-display');

        if (this._compact) {
            this._suffix = '-compact';
            this._iconsize = 3 / 5;
            this._diskunits = _('MB');
            this._netunits_kbytes = _('kB');
            this._netunits_mbytes = _('MB');
            this._netunits_gbytes = _('GB');
            this._netunits_kbits = 'kb';
            this._netunits_mbits = 'Mb';
            this._netunits_gbits = 'Gb';
            this._pie_size *= 4 / 5;
            this._pie_fontsize = 12;
            this._bar_width *= 3 / 5;
            this._bar_thickness = 12;
            this._bar_fontsize = 12;
        }
    }
    get(style) {
        return style + this._suffix;
    }
    iconsize() {
        return this._iconsize;
    }
    diskunits() {
        return this._diskunits;
    }
    netunits_kbytes() {
        return this._netunits_kbytes;
    }
    netunits_mbytes() {
        return this._netunits_mbytes;
    }
    netunits_gbytes() {
        return this._netunits_gbytes;
    }
    netunits_kbits() {
        return this._netunits_kbits;
    }
    netunits_mbits() {
        return this._netunits_mbits;
    }
    netunits_gbits() {
        return this._netunits_gbits;
    }
    pie_size() {
        return this._pie_size;
    }
    pie_fontsize() {
        return this._pie_fontsize;
    }
    bar_width() {
        return this._bar_width;
    }
    bar_thickness() {
        return this._bar_thickness;
    }
    bar_fontsize() {
        return this._bar_fontsize;
    }
}

const Chart = class SystemMonitor_Chart {
    constructor(extension, width, height, parent) {
        this.extension = extension;
        this.actor = new St.DrawingArea({ style_class: extension._Style.get('sm-chart'), reactive: false });
        this.parentC = parent;
        this.width = width;
        let themeContext = St.ThemeContext.get_for_stage(global.stage);
        this.scale_factor = themeContext.scale_factor;
        this.actor.set_width(this.width * this.scale_factor);
        this.actor.set_height(height);
        this.data = [];
        for (let i = 0; i < this.parentC.colors.length; i++) {
            this.data[i] = [];
        }
        themeContext.connect('notify::scale-factor', this.rescale.bind(this));
        this.actor.connect('repaint', this._draw.bind(this));
    }
    update() {
        let data_a = this.parentC.vals;
        if (data_a.length !== this.parentC.colors.length) {
            return;
        }
        let accdata = [];
        for (let l = 0; l < data_a.length; l++) {
            accdata[l] = (l === 0) ? data_a[0] : accdata[l - 1] + ((data_a[l] > 0) ? data_a[l] : 0);
            this.data[l].push(accdata[l]);
            if (this.data[l].length > this.width) {
                this.data[l].shift();
            }
        }
        if (!this.actor.visible) {
            return;
        }
        this.actor.queue_repaint();
    }
    _draw() {
        if (!this.actor.visible) {
            return;
        }
        let [width, height] = this.actor.get_surface_size();
        let cr = this.actor.get_context();
        let min = 0, max;
        if (this.parentC.min) {
            min = this.parentC.min;
        }
        if (this.parentC.max) {
            max = this.parentC.max;
        } else {
            max = Math.max.apply(this, this.data[this.data.length - 1]);
            max = Math.max(1, Math.pow(2, Math.ceil(Math.log(max) / Math.log(2))));
            if (this.parentC.graph_scale_cooldown_delay_minutes !== 0) {
                if (max > this.parentC.graph_scale_max_including_cooldown) {
                    // Restart the cooldown period with this new max.
                    const oldMax = this.parentC.graph_scale_max_including_cooldown;
                    this.parentC.restart_cooldown_timer(max);
                }
                this.parentC.graph_scale_max_including_cooldown =
                    Math.max(max, this.parentC.graph_scale_max_including_cooldown);
                max = this.parentC.graph_scale_max_including_cooldown;
            }
        }
        const range = max - min, top = 1 + min / range;
        sm_cairo_set_source_color(cr, this.extension._Background);
        cr.rectangle(0, 0, width, height);
        cr.fill();
        for (let i = this.parentC.colors.length - 1; i >= 0; i--) {
            let samples = this.data[i].length - 1;
            if (samples > 0) {
                cr.moveTo(width, height); // bottom right
                let x = width - 0.25 * this.scale_factor;
                cr.lineTo(x, (top - this.data[i][samples] / range) * height);
                x -= 0.5 * this.scale_factor;
                for (let j = samples; j >= 0; j--) {
                    let y = (top - this.data[i][j] / range) * height;
                    cr.lineTo(x, y);
                    x -= 0.5 * this.scale_factor;
                    cr.lineTo(x, y);
                    x -= 0.5 * this.scale_factor;
                }
                x += 0.25 * this.scale_factor;
                cr.lineTo(x, (top - this.data[i][0] / range) * height);
                cr.lineTo(x, height);
                cr.closePath();
                sm_cairo_set_source_color(cr, this.parentC.colors[i]);
                cr.fill();
            }
        }
        cr.$dispose();
    }
    resize(width) {
        if (this.width === width) {
            return;
        }
        this.width = width;
        if (this.width < this.data[0].length) {
            for (let i = 0; i < this.parentC.colors.length; i++) {
                this.data[i] = this.data[i].slice(-this.width);
            }
        }
        this.actor.set_width(this.width * this.scale_factor); // repaints
    }
    rescale(themeContext) {
        this.scale_factor = themeContext.scale_factor;
        this.actor.set_width(this.width * this.scale_factor); // repaints
    }
}

// Class to deal with volumes insertion / ejection
const smMountsMonitor = class SystemMonitor_smMountsMonitor {
    constructor() {
        this.files = [];
        this.num_mounts = -1;
        this.listeners = [];
        this.connected = false;

        this._volumeMonitor = Gio.VolumeMonitor.get();
        let sys_mounts = ['/usr', '/usr/local'];
        this.base_mounts = ['/'];
        sys_mounts.forEach((sMount) => {
            if (this.is_sys_mount(sMount + '/')) {
                this.base_mounts.push(sMount);
            }
        });
        this.connect();
    }
    refresh() {
        // try check that number of volumes has changed
        // try {
        //     let num_mounts = this.manager.getMounts().length;
        //     if (num_mounts == this.num_mounts)
        //         return;
        //     this.num_mounts = num_mounts;
        // } catch (e) {};

        // Can't get mountlist:
        // GTop.glibtop_get_mountlist
        // Error: No symbol 'glibtop_get_mountlist' in namespace 'GTop'
        // Getting it with mtab
        // let mount_lines = Shell.get_file_contents_utf8_sync('/etc/mtab').split("\n");
        // this.mounts = [];
        // for(let mount_line in mount_lines) {
        //     let mount = mount_lines[mount_line].split(" ");
        //     if(interesting_mountpoint(mount) && this.mounts.indexOf(mount[1]) < 0) {
        //         this.mounts.push(mount[1]);
        //     }
        // }
        // log("[System monitor] old mounts: " + this.mounts);
        this.mounts = [];
        for (let base in this.base_mounts) {
            // log("[System monitor] " + this.base_mounts[base]);
            this.mounts.push(this.base_mounts[base]);
        }
        let mount_lines = this._volumeMonitor.get_mounts();
        mount_lines.forEach((mount) => {
            if ((!this.is_net_mount(mount) || ENABLE_NETWORK_DISK_USAGE) &&
                !this.is_ro_mount(mount)) {
                let mpath = mount.get_root().get_path() || mount.get_default_location().get_path();
                if (mpath && !mpath.startsWith('/tmp') && !mpath.startsWith('/boot') && !mpath.startsWith('/home')) {
                    this.mounts.push(mpath);
                }
            }
        });
        // log("[System monitor] base: " + this.base_mounts);
        // log("[System monitor] mounts: " + this.mounts);
        for (let i in this.listeners) {
            this.listeners[i](this.mounts);
        }
    }
    add_listener(cb) {
        this.listeners.push(cb);
    }
    remove_listener(cb) {
        this.listeners.pop(cb);
    }
    get_mounts() {
        return this.mounts;
    }
    is_sys_mount(mpath) {
        let file = Gio.file_new_for_path(mpath);
        try {
            let info = file.query_info(Gio.FILE_ATTRIBUTE_UNIX_IS_MOUNTPOINT,
                Gio.FileQueryInfoFlags.NONE, null);
            return info.get_attribute_boolean(Gio.FILE_ATTRIBUTE_UNIX_IS_MOUNTPOINT);
        } catch (e) {
            if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)) {
                return false;
            }
            throw e;
        }
    }
    is_ro_mount(mount) {
        // FIXME: running this function after "login after waking from suspend"
        // can make login hang. Actual issue seems to occur when a former net
        // mount got broken (e.g. due to a VPN connection terminated or
        // otherwise broken connection)
        try {
            let file = mount.get_default_location();
            let info = file.query_filesystem_info(Gio.FILE_ATTRIBUTE_FILESYSTEM_READONLY, null);
            return info.get_attribute_boolean(Gio.FILE_ATTRIBUTE_FILESYSTEM_READONLY);
        } catch (e) {
            return false;
        }
    }
    is_net_mount(mount) {
        try {
            let file = mount.get_default_location();
            let info = file.query_filesystem_info(Gio.FILE_ATTRIBUTE_FILESYSTEM_TYPE, null);
            let result = info.get_attribute_string(Gio.FILE_ATTRIBUTE_FILESYSTEM_TYPE);
            let net_fs = ['nfs', 'smbfs', 'cifs', 'ftp', 'sshfs', 'sftp', 'mtp', 'mtpfs'];
            return !file.is_native() || net_fs.indexOf(result) > -1;
        } catch (e) {
            return false;
        }
    }
    connect() {
        if (this.connected) {
            return;
        }
        try {
            this.manager = this._volumeMonitor;
            this.mount_added_id = this.manager.connect('mount-added', this.refresh.bind(this));
            this.mount_removed_id = this.manager.connect('mount-removed', this.refresh.bind(this));
            // need to add the other signals here
            this.connected = true;
        } catch (e) {
            sm_log('Failed to register on placesManager notifications', 'error');
            sm_log('Got exception : ' + e, 'error');
        }
        this.refresh();
    }
    disconnect() {
        if (!this.connected) {
            return;
        }
        this.manager.disconnect(this.mount_added_id);
        this.manager.disconnect(this.mount_removed_id);
        this.connected = false;
    }
    destroy() {
        this.disconnect();
    }
}

const Graph = class SystemMonitor_Graph {
    constructor(extension, width, height) {
        this.extension = extension;
        this.menu_item = '';
        this.actor = new St.DrawingArea({ style_class: this.extension._Style.get('sm-chart'), reactive: false });
        this.width = width;
        this.height = height;
        this.gtop = new GTop.glibtop_fsusage();
        this.colors = ['#888', '#aaa', '#ccc'];
        for (let color in this.colors) {
            this.colors[color] = color_from_string(this.colors[color]);
        }

        let themeContext = St.ThemeContext.get_for_stage(global.stage);
        themeContext.connect('notify::scale-factor', this.set_scale.bind(this));
        this.scale_factor = themeContext.scale_factor;
        let interfaceSettings = new Gio.Settings({
            schema: 'org.gnome.desktop.interface'
        });
        interfaceSettings.connect('changed', this.set_text_scaling.bind(this));
        this.text_scaling = interfaceSettings.get_double('text-scaling-factor');
        if (!this.text_scaling) {
            this.text_scaling = 1;
        }

        this.actor.set_width(this.width * this.scale_factor * this.text_scaling);
        this.actor.set_height(this.height * this.scale_factor * this.text_scaling);
        this.actor.connect('repaint', this._draw.bind(this));
    }
    create_menu_item() {
        this.menu_item = new PopupMenu.PopupBaseMenuItem({ reactive: false });
        this.menu_item.actor.style = 'padding-top: 15px; padding-bottom: 15px;';
        this.actor.x_expand = true;
        this.actor.x_align = Clutter.ActorAlign.CENTER;
        this.menu_item.actor.add_child(this.actor);
        // tray.menu.addMenuItem(this.menu_item);
    }
    show(visible) {
        this.menu_item.actor.visible = visible;
    }
    set_scale(themeContext) {
        this.scale_factor = themeContext.scale_factor;
        this.actor.set_width(this.width * this.scale_factor * this.text_scaling);
        this.actor.set_height(this.height * this.scale_factor * this.text_scaling);
    }
    set_text_scaling(interfaceSettings, key) {
        // FIXME: for some reason we only get this signal once, not on later
        // changes to the setting
        //log('[System monitor] got text scaling signal');
        this.text_scaling = interfaceSettings.get_double(key);
        this.actor.set_width(this.width * this.scale_factor * this.text_scaling);
        this.actor.set_height(this.height * this.scale_factor * this.text_scaling);
    }
}

const Bar = class SystemMonitor_Bar extends Graph {
    constructor(extension) {
        // Height doesn't matter, it gets set on every draw.
        super(extension, extension._Style.bar_width(), 100);
        this.mounts = extension._MountsMonitor.get_mounts();
        extension._MountsMonitor.add_listener(this.update_mounts.bind(this));
        this._refresh_timeout = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT, 2, () => {
                this.actor.queue_repaint();
                return GLib.SOURCE_CONTINUE;
            });
    }
    _draw() {
        if (!this.actor.visible) {
            return;
        }
        let thickness = this.extension._Style.bar_thickness() * this.scale_factor * this.text_scaling;
        let fontsize = this.extension._Style.bar_fontsize() * this.scale_factor * this.text_scaling;
        this.actor.set_height(this.mounts.length * (3 * thickness));
        let [width, height] = this.actor.get_surface_size();
        let cr = this.actor.get_context();

        let x0 = width / 8;
        let y0 = thickness / 2;
        cr.setLineWidth(thickness);
        cr.setFontSize(fontsize);
        for (let mount in this.mounts) {
            GTop.glibtop_get_fsusage(this.gtop, this.mounts[mount]);
            const { used, total, avail } = calc_usage(this.gtop);
            const perc_full = (used + avail) > 0 ? (used / (used + avail)) : 0;

            const get_color_for_perc = (p) => {
                let r_col, g_col, b_col;
                if (p < 0.5) {
                    let t = p / 0.5;
                    r_col = 0x90 + t * (0xf1 - 0x90);
                    g_col = 0xee + t * (0xf3 - 0xee);
                    b_col = 0x90 + t * (0x85 - 0x90);
                } else if (p < 0.85) {
                    let t = (p - 0.5) / 0.35;
                    r_col = 0xf1 + t * (0xd1 - 0xf1);
                    g_col = 0xf3 + t * (0x41 - 0xf3);
                    b_col = 0x85 + t * (0x3f - 0x85);
                } else {
                    r_col = 0xd1;
                    g_col = 0x41;
                    b_col = 0x3f;
                }
                return [r_col / 255, g_col / 255, b_col / 255];
            };

            let text = this.mounts[mount];
            if (text === '/') {
                text = '/';
            } else if (text.length > 10) {
                text = text.split('/').pop();
            }

            const block_size = this.gtop.block_size;
            let format_size = (blocks) => {
                let size = blocks * block_size;
                if (size < 1024 * 1024 * 1024) {
                    return (size / (1024 * 1024)).toFixed(1) + 'MB';
                }
                return (size / (1024 * 1024 * 1024)).toFixed(1) + 'GB';
            };

            const used_str = format_size(used);
            const total_str = format_size(total);
            const perc_str = Math.round(perc_full * 100) + '%';

            text += `  used ${used_str}/${total_str}`;

            cr.moveTo(0, y0 + thickness / 3);
            cr.showText(text);
            cr.moveTo(width - x0, y0 + thickness / 3);
            cr.showText(perc_str);
            y0 += (5 * thickness) / 4;

            let bar_steps = Math.max(10, Math.floor(perc_full * width));
            if (bar_steps === 0) bar_steps = 1;
            let step_width = (perc_full * width) / bar_steps;

            for (let i = 0; i < bar_steps; i++) {
                let current_perc = (i / bar_steps) * perc_full;
                let [r_col, g_col, b_col] = get_color_for_perc(current_perc);

                cr.setSourceRGB(r_col, g_col, b_col);
                cr.moveTo(i * step_width, y0);
                cr.lineTo((i + 1.05) * step_width, y0); // slight overlap to avoid gaps
                cr.stroke();
            }
            y0 += (7 * thickness) / 4;
        }
        cr.$dispose();
    }
    update_mounts(mounts) {
        this.mounts = mounts;
        this.actor.queue_repaint();
    }
    destroy() {
        if (this._refresh_timeout) {
            GLib.Source.remove(this._refresh_timeout);
            this._refresh_timeout = null;
        }
    }
}

const Pie = class SystemMonitor_Pie extends Graph {
    constructor(extension) {
        super(extension, extension._Style.pie_size(), extension._Style.pie_size());
        this.mounts = extension._MountsMonitor.get_mounts();
        extension._MountsMonitor.add_listener(this.update_mounts.bind(this));
        this._refresh_timeout = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT, 2, () => {
                this.actor.queue_repaint();
                return GLib.SOURCE_CONTINUE;
            });
    }

    _draw() {
        if (!this.actor.visible) {
            return;
        }
        let [width, height] = this.actor.get_surface_size();
        let cr = this.actor.get_context();
        let xc = width / 2;
        let yc = height / 2;
        let pi = Math.PI;
        function arc(r, value, max, angle) {
            if (max === 0) {
                return angle;
            }
            let new_angle = angle + (value * 2 * pi / max);
            cr.arc(xc, yc, r, angle, new_angle);
            return new_angle;
        }

        // Set the ring thickness so that at least 7 rings can be displayed. If
        // there are more mounts, make the rings thinner. If the rings are too
        // thin to have a line height of 1.2 for the labels, shrink the labels.
        let rings = Math.max(this.mounts.length, 7);
        let ring_width = width / (2 * rings);
        let fontsize = this.extension._Style.pie_fontsize() * this.scale_factor * this.text_scaling;
        if (ring_width < 1.2 * fontsize) {
            fontsize = ring_width / 1.2;
        }
        let thickness = ring_width / 1.5;

        cr.setLineWidth(thickness);
        cr.setFontSize(fontsize);
        let r = (height - ring_width) / 2;
        let y = (ring_width + fontsize) / 2;
        for (let mount in this.mounts) {
            GTop.glibtop_get_fsusage(this.gtop, this.mounts[mount]);
            const { used, total, avail } = calc_usage(this.gtop);
            const perc_full = (used + avail) > 0 ? (used / (used + avail)) : 0;

            const get_color_for_perc = (p) => {
                let r_col, g_col, b_col;
                if (p < 0.5) {
                    let t = p / 0.5;
                    r_col = 0x90 + t * (0xf1 - 0x90);
                    g_col = 0xee + t * (0xf3 - 0xee);
                    b_col = 0x90 + t * (0x85 - 0x90);
                } else if (p < 0.85) {
                    let t = (p - 0.5) / 0.35;
                    r_col = 0xf1 + t * (0xd1 - 0xf1);
                    g_col = 0xf3 + t * (0x41 - 0xf3);
                    b_col = 0x85 + t * (0x3f - 0x85);
                } else {
                    r_col = 0xd1;
                    g_col = 0x41;
                    b_col = 0x3f;
                }
                return [r_col / 255, g_col / 255, b_col / 255];
            };

            let startAngle = -pi / 2;
            let endAngle = startAngle + (perc_full * 2 * pi);
            let steps = Math.max(10, Math.floor(perc_full * 100));
            if (steps === 0) steps = 1;
            let stepAngle = (endAngle - startAngle) / steps;

            cr.newPath();
            for (let i = 0; i < steps; i++) {
                let a1 = startAngle + i * stepAngle;
                let a2 = startAngle + (i + 1.05) * stepAngle;
                if (i === steps - 1) a2 = endAngle;

                let current_perc = (i / steps) * perc_full;
                let [r_col, g_col, b_col] = get_color_for_perc(current_perc);

                cr.setSourceRGB(r_col, g_col, b_col);
                cr.arc(xc, yc, r, a1, a2);
                cr.stroke();
            }

            let text = this.mounts[mount];
            if (text === '/') {
                text = '/';
            } else if (text.length > 10) {
                text = text.split('/').pop();
            }

            cr.setSourceRGBA(1.0, 1.0, 1.0, 0.9);
            cr.moveTo(0, y);
            cr.showText(text);

            const block_size = this.gtop.block_size;
            let format_size = (blocks) => {
                let size = blocks * block_size;
                if (size < 1024 * 1024 * 1024) {
                    return (size / (1024 * 1024)).toFixed(1) + 'MB';
                }
                return (size / (1024 * 1024 * 1024)).toFixed(1) + 'GB';
            };

            const used_str = format_size(used);
            const total_str = format_size(total);
            const perc_str = Math.round(perc_full * 100) + '%';

            let curve_text = `used ${used_str}/${total_str} (${perc_str})`;

            // Draw curved text along the arc
            cr.setSourceRGB(0, 0, 0);
            let textAngle = startAngle + 0.05;

            for (let i = 0; i < curve_text.length; i++) {
                let char = curve_text[i];
                let extents = cr.textExtents(char);
                let charWidth = extents.x_advance || extents.xAdvance;
                if (charWidth === undefined) {
                    charWidth = extents.width || (fontsize * 0.4);
                }
                if (charWidth === 0 && char === ' ') {
                    charWidth = fontsize * 0.4;
                }

                let charAngle = charWidth / r;

                cr.save();
                cr.translate(xc, yc);
                cr.rotate(textAngle + charAngle / 2 + pi / 2);
                cr.translate(0, -r);

                cr.moveTo(-charWidth / 2, fontsize * 0.3);
                cr.showText(char);
                cr.restore();

                textAngle += charAngle;
            }

            r -= ring_width;
            y += ring_width;
        }
        cr.$dispose();
    }

    update_mounts(mounts) {
        this.mounts = mounts;
        this.actor.queue_repaint();
    }
    destroy() {
        if (this._refresh_timeout) {
            GLib.Source.remove(this._refresh_timeout);
            this._refresh_timeout = null;
        }
    }
}

let TipItem = GObject.registerClass(
    {
        GTypeName: 'TipItem'
    },
    class SystemMonitor_TipItem extends PopupMenu.PopupBaseMenuItem {
        _init() {
            super._init();
            // PopupMenu.PopupBaseMenuItem.prototype._init.call(this);
            this.actor.remove_style_class_name('popup-menu-item');
            this.actor.add_style_class_name('sm-tooltip-item');
        }
    }
);
const TipMenu = class SystemMonitor_TipMenu extends PopupMenu.PopupMenuBase {
    constructor(sourceActor) {
        // PopupMenu.PopupMenuBase.prototype._init.call(this, sourceActor, 'sm-tooltip-box');
        super(sourceActor, 'sm-tooltip-box');
        this.actor = new Clutter.Actor();
        // this.actor.connect('get-preferred-width',
        //     this._boxGetPreferredWidth).bind(this);
        // this.actor.connect('get-preferred-height',
        //     this._boxGetPreferredHeight.bind(this));
        this.actor.add_child(this.box);
    }
    // _boxGetPreferredWidth (actor, forHeight, alloc) {
    //     // let columnWidths = this.getColumnWidths();
    //     // this.setColumnWidths(columnWidths);
    //
    //     [alloc.min_size, alloc.natural_size] = this.box.get_preferred_width(forHeight);
    // }
    // _boxGetPreferredHeight (actor, forWidth, alloc) {
    //     [alloc.min_size, alloc.natural_size] = this.box.get_preferred_height(forWidth);
    // }
    // _boxAllocate (actor, box, flags) {
    //     this.box.allocate(box, flags);
    // }
    _shift() {
        // Probably old but works
        let node = this.sourceActor.get_theme_node();
        let contentbox = node.get_content_box(this.sourceActor.get_allocation_box());

        let sourceTopLeftX = 0;
        let sourceTopLeftY = 0;
        if (typeof this.sourceActor.get_transformed_extents === 'function') {
            let extents = this.sourceActor.get_transformed_extents();
            let sourceTopLeft = extents.get_top_left();
            sourceTopLeftY = sourceTopLeft.y;
            sourceTopLeftX = sourceTopLeft.x;
        } else {
            let allocation = Shell.util_get_transformed_allocation(this.sourceActor);
            sourceTopLeftY = allocation.y1;
            sourceTopLeftX = allocation.x1;
        }
        let monitor = Main.layoutManager.findMonitorForActor(this.sourceActor);
        let [x, y] = [sourceTopLeftX + contentbox.x1,
        sourceTopLeftY + contentbox.y1];
        let [cx, cy] = [sourceTopLeftX + (contentbox.x1 + contentbox.x2) / 2,
        sourceTopLeftY + (contentbox.y1 + contentbox.y2) / 2];
        let [xm, ym] = [sourceTopLeftX + contentbox.x2,
        sourceTopLeftY + contentbox.y2];
        let [width, height] = this.actor.get_size();
        let tipx = cx - width / 2;
        tipx = Math.max(tipx, monitor.x);
        tipx = Math.min(tipx, monitor.x + monitor.width - width);
        tipx = Math.floor(tipx);
        let tipy = Math.floor(ym);
        // Hacky condition to determine if the status bar is at the top or at the bottom of the screen
        if (sourceTopLeftY / monitor.height > 0.3) {
            tipy = sourceTopLeftY - height; // If it is at the bottom, place the tooltip above instead of below
        }
        this.actor.set_position(tipx, tipy);
    }
    open(animate) {
        if (this.isOpen) {
            return;
        }

        this.isOpen = true;
        this.actor.show();
        this._shift();
        this.actor.raise_top();
        this.emit('open-state-changed', true);
    }
    close(animate) {
        this.isOpen = false;
        this.actor.hide();
        this.emit('open-state-changed', false);
    }
}

const TipBox = class SystemMonitor_TipBox {
    constructor(extension) {
        this.extension = extension;
        this.actor = new St.BoxLayout({ reactive: true });
        this.actor._delegate = this;
        this.set_tip(new TipMenu(this.actor));
        this.in_to = this.out_to = 0;
        this.actor.connect('enter-event', this.on_enter.bind(this));
        this.actor.connect('leave-event', this.on_leave.bind(this));
    }
    set_tip(tipmenu) {
        if (this.tipmenu) {
            this.tipmenu.destroy();
        }
        this.tipmenu = tipmenu;
        if (this.tipmenu) {
            Main.uiGroup.add_child(this.tipmenu.actor);
            this.hide_tip();
        }
    }
    show_tip() {
        if (this.tipmenu)
            this.tipmenu.open();
        return GLib.SOURCE_REMOVE;
    }
    hide_tip() {
        if (!this.tipmenu) {
            return;
        }
        this.tipmenu.close();
        this.stop_out_timer();
        this.stop_in_timer();
    }
    on_enter() {
        let show_tooltip = this.extension._Schema.get_boolean('show-tooltip');

        if (!show_tooltip) {
            return;
        }

        this.stop_out_timer();
        this.start_in_timer();
    }
    on_leave() {
        this.stop_in_timer();
        this.start_out_timer();
    }
    start_in_timer() {
        if (!this.in_to) {
            this.in_to = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                this.extension._Schema.get_int('tooltip-delay-ms'),
                this.show_tip.bind(this),
            );
        }
    }
    stop_in_timer() {
        if (this.in_to) {
            GLib.Source.remove(this.in_to);
            this.in_to = 0;
        }
    }
    start_out_timer() {
        if (!this.out_to) {
            this.out_to = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                this.extension._Schema.get_int('tooltip-delay-ms'),
                this.hide_tip.bind(this),
            );
        }
    }
    stop_out_timer() {
        if (this.out_to) {
            GLib.Source.remove(this.out_to);
            this.out_to = 0;
        }
    }
    destroy() {
        this.stop_in_timer();
        this.stop_out_timer();
        this.actor.destroy();
    }
}

// This class swaps the vertical and horizontal dimensions of a child element,
// because rotating the child only changes how it is painted, not its geometry.
// It also moves the bounds on allocation so that the rotated child ends up in
// the right position.
const RotateBinLayout = GObject.registerClass(
    {
        GTypeName: 'RotateBinLayout'
    },
    class SystemMonitor_RotateBinLayout extends Clutter.BinLayout {
        vfunc_get_preferred_width(container, for_height) {
            return super.vfunc_get_preferred_height(container, for_height);
        }
        vfunc_get_preferred_height(container, for_width) {
            return super.vfunc_get_preferred_width(container, for_width);
        }
        vfunc_allocate(container, box) {
            const box2 = new Clutter.ActorBox({
                x1: box.x1,
                x2: box.x1 + box.y2 - box.y1,
                y1: box.y2,
                y2: box.y2 + box.x2 - box.x1,
            });
            return super.vfunc_allocate(container, box2);
        }
    }
);

const ElementBase = class SystemMonitor_ElementBase extends TipBox {
    constructor(extension, properties) {
        super(extension);
        this.elt = '';
        this.elt_short = '';
        this.item_name = _('');
        this.color_name = [];
        this.text_items = [];
        this.menu_items = [];
        this.menu_visible = true;
        this.menu_rows = 1;
        this.timeout = null;

        // Maximum value preserved during cooldown period
        this.graph_scale_max_including_cooldown = 0;
        this.graph_scale_cooldown_timer_id = null;
        this.graph_scale_cooldown_delay_minutes = 0;

        Object.assign(this, properties);

        //            TipBox.prototype._init.apply(this, arguments);
        this.vals = [];
        this.tip_labels = [];
        this.tip_vals = [];
        this.tip_unit_labels = [];

        const Schema = extension._Schema;
        const Style = extension._Style;
        const IconSize = extension._IconSize;

        this.colors = [];
        for (let color in this.color_name) {
            let name = this.elt + '-' + this.color_name[color] + '-color';
            let clutterColor = color_from_string(Schema.get_string(name));
            Schema.connect('changed::' + name, (schema, key) => {
                this.clutterColor = color_from_string(Schema.get_string(key));
            });
            Schema.connect('changed::' + name, () => {
                this.chart.actor.queue_repaint();
            });
            this.colors.push(clutterColor);
        }

        let element_width = Schema.get_int(this.elt + '-graph-width');
        if (Style.get('') === '-compact') {
            element_width = Math.round(element_width / 1.5);
        }
        this.chart = new Chart(this.extension, element_width, IconSize, this);

        Schema.connect('changed::background', () => {
            this.chart.actor.queue_repaint();
        });

        this.actor.visible = Schema.get_boolean(this.elt + '-display');
        Schema.connect(
            'changed::' + this.elt + '-display', (schema, key) => {
                this.actor.visible = Schema.get_boolean(key);
            });

        this.restart_update_timer(l_limit(Schema.get_int(this.elt + '-refresh-time')));

        Schema.connect(
            'changed::' + this.elt + '-refresh-time',
            (schema, key) => {
                this.restart_update_timer(l_limit(Schema.get_int(key)));
            });
        Schema.connect('changed::' + this.elt + '-graph-width', this.resize.bind(this));

        if (this.elt === 'thermal') {
            Schema.connect('changed::thermal-threshold',
                () => {
                    this.reset_style();
                    this.restart_update_timer();
                });
        }

        this.label = new St.Label({
            text: _(this.elt_short || this.elt),
            style_class: Style.get('sm-status-label')
        });
        change_text.call(this);
        Schema.connect('changed::' + this.elt + '-show-text', change_text.bind(this));

        this.menu_visible = Schema.get_boolean(this.elt + '-show-menu');
        Schema.connect('changed::' + this.elt + '-show-menu', change_menu.bind(this));

        this.label_bin = new St.Bin({ child: this.label });
        const default_layout = this.label_bin.layout_manager;
        const change_rotate_labels = () => {
            if (Schema.get_boolean('rotate-labels')) {
                this.label.set_rotation_angle(Clutter.RotateAxis.Z_AXIS, -90);
                this.label.add_style_class_name('rotated');
                this.label_bin.layout_manager = new RotateBinLayout();
                this.label_bin.y_align = Clutter.ActorAlign.CENTER;
            } else {
                this.label.set_rotation_angle(Clutter.RotateAxis.Z_AXIS, 0);
                this.label.remove_style_class_name('rotated');
                this.label_bin.layout_manager = default_layout;
                this.label_bin.y_align = Clutter.ActorAlign.START;
            }
        };
        change_rotate_labels();
        Schema.connect('changed::rotate-labels', change_rotate_labels);

        this.actor.add_child(this.label_bin);
        this.text_box = new St.BoxLayout();

        this.actor.add_child(this.text_box);
        this.text_items = this.create_text_items();
        for (let item in this.text_items) {
            this.text_box.add_child(this.text_items[item]);
        }
        this.actor.add_child(this.chart.actor);
        change_style.call(this);
        Schema.connect('changed::' + this.elt + '-style', change_style.bind(this));
        this.menu_items = this.create_menu_items();

        this.restart_cooldown_timer();
        Schema.connect('changed::graph-cooldown-delay-m', () => {
            this.restart_cooldown_timer();
        });
    }
    /**
     * Initializes or restarts the graph scale cooldown timer. The graph
     * scale won't downscale during the cooldown period.
     *
     * max - Maximum value to preserve during cooldown
     */
    restart_cooldown_timer(max = 0) {
        if (this.graph_scale_cooldown_timer_id) {
            GLib.Source.remove(this.graph_scale_cooldown_timer_id);
        }
        this.graph_scale_max_including_cooldown = max;
        this.graph_scale_cooldown_delay_minutes = this.extension._Schema.get_int('graph-cooldown-delay-m');
        if (this.graph_scale_cooldown_delay_minutes !== 0) {
            this.graph_scale_cooldown_timer_id = GLib.timeout_add_seconds(
                GLib.PRIORITY_DEFAULT,
                this.graph_scale_cooldown_delay_minutes * 60,
                () => {
                    this.restart_cooldown_timer();
                    return GLib.SOURCE_CONTINUE;
                });
        }
    }
    get _fontSize() {
        let size = this.extension._Schema.get_double(this.elt + '-font-size');
        if (this.extension._Style.get('') === '-compact')
            size = Math.max(6, size - 1);
        return size;
    }
    _applyFontSize(label, multiplier = 1, offset = 0) {
        if (!this._fontSizeLabels) {
            this._fontSizeLabels = [];
            this.extension._Schema.connect(
                `changed::${this.elt}-font-size`,
                () => {
                    for (const {label: lbl, mult, offs} of this._fontSizeLabels)
                        this._applyFontSizeAt(lbl, mult, offs);
                },
            );
        }
        this._fontSizeLabels.push({label, mult: multiplier, offs: offset});
        this._applyFontSizeAt(label, multiplier, offset);
    }
    _applyFontSizeAt(label, multiplier = 1, offset = 0) {
        const size = this._fontSize * multiplier;
        label.set_style(`font-size: ${size}pt !important;`);
    }

    restart_update_timer(interval = null) {
        interval = interval || this._lastInterval;
        if (!interval) {
            sm_log("Invalid call to restart_update_timer", 'error');
            return;
        }
        if (this.timeout) {
            GLib.Source.remove(this.timeout);
        }
        this.timeout = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT_IDLE,
            interval,
            this.update.bind(this),
        );
        this._lastInterval = interval;
    }
    tip_format(unit) {
        if (typeof (unit) === 'undefined') {
            unit = '%';
        }
        if (typeof (unit) === 'string') {
            let all_unit = unit;
            unit = [];
            for (let i = 0; i < this.color_name.length; i++) {
                unit.push(all_unit);
            }
        }
        for (let i = 0; i < this.color_name.length; i++) {
            let tipline = new TipItem();
            this.tipmenu.addMenuItem(tipline);
            tipline.actor.add_child(new St.Label({ text: _(this.color_name[i]) }));
            this.tip_labels[i] = new St.Label({ text: '' });
            tipline.actor.add_child(this.tip_labels[i]);

            this.tip_unit_labels[i] = new St.Label({ text: unit[i] });
            tipline.actor.add_child(this.tip_unit_labels[i]);
            this.tip_vals[i] = 0;
        }
    }
    //        set_tip_unit: function(unit) {
    //           for (let i = 0;i < this.tip_unit_labels.length;i++) {
    //           this.tip_unit_labels[i].text = unit[i];
    //           }
    //           }
    update() {
        if (!this.menu_visible && !this.actor.visible) {
            return false;
        }
        if (!this.actor.visible && this.menu_visible && !this.extension._menuIsOpen) {
            return GLib.SOURCE_CONTINUE;
        }
        this.refresh();
        this._apply();
        if (this.elt === 'thermal') {
            this.threshold();
        }
        this.chart.update();
        for (let i = 0; i < this.tip_vals.length; i++) {
            if (this.tip_labels[i]) {
                this.tip_labels[i].text = this.tip_vals[i].toString();
            }
        }
        return GLib.SOURCE_CONTINUE;
    }
    reset_style() {
        this.text_items[0].set_style('color: rgba(255, 255, 255, 1)');
    }
    threshold() {
        if (this.extension._Schema.get_int('thermal-threshold')) {
            if (this.temp_over_threshold) {
                this.text_items[0].set_style('color: rgba(255, 0, 0, 1)');
            } else {
                this.text_items[0].set_style('color: rgba(255, 255, 255, 1)');
            }
        }
    }
    resize(schema, key) {
        let width = this.extension._Schema.get_int(key);
        if (this.extension._Style.get('') === '-compact') {
            width = Math.round(width / 1.5);
        }
        this.chart.resize(width);
    }
    destroy() {
        TipBox.prototype.destroy.call(this);
        if (this.timeout) {
            GLib.Source.remove(this.timeout);
            this.timeout = null;
        }
        if (this.graph_scale_cooldown_timer_id) {
            GLib.Source.remove(this.graph_scale_cooldown_timer_id);
            this.graph_scale_cooldown_timer_id = null;
        }
    }
}

const Battery = class SystemMonitor_Battery extends ElementBase {
    constructor(extension) {
        super(extension, {
            elt: 'battery',
            item_name: _('Battery'),
            color_name: ['batt0'],
            icon: '. GThemedIcon battery-good-symbolic battery-good'
        });

        this.max = 100;
        this.icon_hidden = false;
        this.percentage = 0;
        this.timeString = '-- ';
        // TODO: Figure out when Main.panel.statusArea.quickSettings._system becomes available
        // It's defined while poking around in Looking Glass, but not here during enable when
        // starting a new GS session.
        this._proxy = Main.panel.statusArea.quickSettings._system._systemItem._powerToggle._proxy;
        this.powerSigID = this._proxy.connect('g-properties-changed', this.update_battery.bind(this));

        // need to specify a default icon, since the contructor completes before UPower callback
        this.gicon = Gio.icon_new_for_string(this.icon);

        this.tip_format('%');

        this.update_battery();
        this.update_tips();
        // this.hide_system_icon();
        this.update();

        // Schema.connect('changed::' + this.elt + '-hidesystem', this.hide_system_icon.bind(this));
        extension._Schema.connect('changed::' + this.elt + '-time', this.update_tips.bind(this));
    }
    refresh() {
        // do nothing here?
    }
    update_battery() {
        // callback function for when battery stats updated.
        let battery_found = false;
        let isBattery = false;
        if (typeof (this._proxy.GetDevicesRemote) === 'undefined') {
            let device_type = this._proxy.Type;
            isBattery = (device_type === UPower.DeviceKind.BATTERY);
            if (isBattery) {
                battery_found = true;
                let icon = this._proxy.IconName;
                let percentage = this._proxy.Percentage;
                let seconds = this._proxy.TimeToEmpty;
                this.update_battery_value(seconds, percentage, icon);
            } else {
                // log("[System monitor] No battery found");
                this.actor.hide();
                this.menu_visible = false;
                build_menu_info(this.extension);
            }
        } else {
            this._proxy.GetDevicesRemote((devices, error) => {
                if (error) {
                    sm_log('Power proxy error: ' + error, 'error');
                    this.actor.hide();
                    this.menu_visible = false;
                    build_menu_info(this.extension);
                    return;
                }

                let [result] = devices;
                for (let i = 0; i < result.length; i++) {
                    let [device_id, device_type, icon, percentage, state, seconds] = result[i];

                    isBattery = (device_type === UPower.DeviceKind.BATTERY);
                    if (isBattery) {
                        battery_found = true;
                        this.update_battery_value(seconds, percentage, icon);
                        break;
                    }
                }

                if (!battery_found) {
                    // log("[System monitor] No battery found");
                    this.actor.hide();
                    this.menu_visible = false;
                    build_menu_info(this.extension);
                }
            });
        }
    }
    update_battery_value(seconds, percentage, icon) {
        if (seconds > 60) {
            let time = Math.round(seconds / 60);
            let minutes = time % 60;
            let hours = Math.floor(time / 60);
            this.timeString = C_('battery time remaining', '%d:%02d').format(hours, minutes);
        } else {
            this.timeString = '-- ';
        }
        this.percentage = Math.ceil(percentage);
        this.gicon = Gio.icon_new_for_string(icon);

        if (this.extension._Schema.get_boolean(this.elt + '-display')) {
            this.actor.show()
        }
        if (this.extension._Schema.get_boolean(this.elt + '-show-menu') && !this.menu_visible) {
            this.menu_visible = true;
            build_menu_info(this.extension);
        }
    }
    hide_system_icon(override) {
        let value = this.extension._Schema.get_boolean(this.elt + '-hidesystem');
        if (!override) {
            value = false;
        }
        if (value && this.extension._Schema.get_boolean(this.elt + '-display')) {
            const StatusArea = Main.panel.statusArea;
            if (StatusArea.battery.actor.visible) {
                StatusArea.battery.destroy();
                this.icon_hidden = true;
            }
        } else if (this.icon_hidden) {
            // TODO: Figure out what to put here instead
            // (git blame for more info)
            // let Indicator = new Panel.PANEL_ITEM_IMPLEMENTATIONS.battery();
            // Main.panel.addToStatusArea('battery', Indicator, Main.sessionMode.panel.right.indexOf('battery'), 'right');
            this.icon_hidden = false;
            // Main.panel._updatePanel('right');
        }
    }
    get_battery_unit() {
        let unitString;
        let value = this.extension._Schema.get_boolean(this.elt + '-time');

        if (value) {
            unitString = 'h';
        } else {
            unitString = '%';
        }

        return unitString;
    }
    update_tips() {
        let unitString = this.get_battery_unit();

        if (this.extension._Schema.get_boolean(this.elt + '-display')) {
            this.text_items[2].text = unitString;
        }
        if (this.extension._Schema.get_boolean(this.elt + '-show-menu')) {
            this.menu_items[1].text = unitString;
        }

        this.update();
    }
    _apply() {
        let displayString;
        let value = this.extension._Schema.get_boolean(this.elt + '-time');
        if (value) {
            displayString = this.timeString;
        } else {
            displayString = this.percentage.toString()
        }
        if (this.extension._Schema.get_boolean(this.elt + '-display')) {
            this.text_items[0].gicon = this.gicon;
            this.text_items[1].text = displayString;
        }
        if (this.extension._Schema.get_boolean(this.elt + '-show-menu')) {
            this.menu_items[0].text = displayString;
        }
        this.vals = [this.percentage];
        this.tip_vals[0] = Math.round(this.percentage);
    }
    create_text_items() {
        const items = [
            new St.Icon({
                gicon: Gio.icon_new_for_string(this.icon),
                style_class: this.extension._Style.get('sm-status-icon')
            }),
            new St.Label({
                text: '',
                style_class: this.extension._Style.get('sm-status-value'),
                y_align: Clutter.ActorAlign.CENTER
            }),
            new St.Label({
                text: this.get_battery_unit(),
                style_class: this.extension._Style.get('sm-perc-label'),
                y_align: Clutter.ActorAlign.CENTER
            })
        ];
        this._applyFontSize(items[1]);
        this._applyFontSize(items[2], 1, -1);
        return items;
    }
    create_menu_items() {
        const items = [
            new St.Label({
                text: '',
                style_class: this.extension._Style.get('sm-value')
            }),
            new St.Label({
                text: this.get_battery_unit(),
                style_class: this.extension._Style.get('sm-label')
            })
        ];
        this._applyFontSize(items[0]);
        this._applyFontSize(items[1], 1, -1);
        return items;
    }
    destroy() {
        ElementBase.prototype.destroy.call(this);
        this._proxy.disconnect(this.powerSigID);
    }
}

const Cpu = class SystemMonitor_Cpu extends ElementBase {
    constructor(extension, cpuid) {
        super(extension, {
            elt: 'cpu',
            item_name: _('CPU'),
            color_name: ['user', 'system', 'nice', 'iowait', 'other'],
            cpuid: -1 // cpuid is -1 when all cores are displayed in the same graph
        });
        this.max = 100;

        this.cpuid = cpuid;
        this.gtop = new GTop.glibtop_cpu();
        this.last = [0, 0, 0, 0, 0];
        this.current = [0, 0, 0, 0, 0];
        try {
            this.total_cores = GTop.glibtop_get_sysinfo().ncpu;
            if (cpuid === -1) {
                this.max *= this.total_cores;
            }
        } catch (e) {
            this.total_cores = this.get_cores();
            console.error(e)
        }
        this.last_total = 0;
        this.usage = [0, 0, 0, 1, 0];
        this.item_name = _('CPU');
        if (cpuid !== -1) {
            this.item_name += ' ' + (cpuid + 1);
        } // append cpu number to cpu name in popup
        this.current_freq_ghz = '--';
        this.max_freq_ghz = '5.0';
        let max_file = Gio.file_new_for_path('/sys/devices/system/cpu/cpu0/cpufreq/scaling_max_freq');
        max_file.load_contents_async(null, (source, result) => {
            try {
                let as_r = source.load_contents_finish(result);
                let max_freq = parseInt(parse_bytearray(as_r[1]));
                if (!isNaN(max_freq)) {
                    this.max_freq_ghz = (max_freq / 1000 / 1000).toFixed(2);
                }
            } catch (e) {}
        });

        // ElementBase.prototype._init.call(this);
        this.tip_format();
        this.update();
    }
    refresh() {
        GTop.glibtop_get_cpu(this.gtop);
        // display global cpu usage on 1 graph
        if (this.cpuid === -1) {
            this.current[0] = this.gtop.user;
            this.current[1] = this.gtop.sys;
            this.current[2] = this.gtop.nice;
            this.current[3] = this.gtop.idle;
            this.current[4] = this.gtop.iowait;
            let delta = (this.gtop.total - this.last_total) / (100 * this.total_cores);

            if (delta > 0) {
                for (let i = 0; i < 5; i++) {
                    this.usage[i] = Math.round((this.current[i] - this.last[i]) / delta);
                    this.last[i] = this.current[i];
                }
                this.last_total = this.gtop.total;
            } else if (delta < 0) {
                this.last = [0, 0, 0, 0, 0];
                this.current = [0, 0, 0, 0, 0];
                this.last_total = 0;
                this.usage = [0, 0, 0, 1, 0];
            }
        } else {
            // display per cpu data
            this.current[0] = this.gtop.xcpu_user[this.cpuid];
            this.current[1] = this.gtop.xcpu_sys[this.cpuid];
            this.current[2] = this.gtop.xcpu_nice[this.cpuid];
            this.current[3] = this.gtop.xcpu_idle[this.cpuid];
            this.current[4] = this.gtop.xcpu_iowait[this.cpuid];
            let delta = (this.gtop.xcpu_total[this.cpuid] - this.last_total) / 100;

            if (delta > 0) {
                for (let i = 0; i < 5; i++) {
                    this.usage[i] = Math.round((this.current[i] - this.last[i]) / delta);
                    this.last[i] = this.current[i];
                }
                this.last_total = this.gtop.xcpu_total[this.cpuid];
            } else if (delta < 0) {
                this.last = [0, 0, 0, 0, 0];
                this.current = [0, 0, 0, 0, 0];
                this.last_total = 0;
                this.usage = [0, 0, 0, 1, 0];
            }
        }

        this.refresh_freq();
    }
    refresh_freq() {
        let total_frequency = 0;
        let num_cpus = this.total_cores;
        let i = 0;
        let file = Gio.file_new_for_path(`/sys/devices/system/cpu/cpu${i}/cpufreq/scaling_cur_freq`);
        let that = this;

        file.load_contents_async(null, function cb(source, result) {
            try {
                let as_r = source.load_contents_finish(result);
                let current_freq = parseInt(parse_bytearray(as_r[1]));
                if (!isNaN(current_freq)) {
                    total_frequency += current_freq;
                }
            } catch (e) {}

            if (++i >= num_cpus) {
                that.current_freq_ghz = (total_frequency / num_cpus / 1000 / 1000).toFixed(2);
            } else {
                file = Gio.file_new_for_path(`/sys/devices/system/cpu/cpu${i}/cpufreq/scaling_cur_freq`);
                file.load_contents_async(null, cb.bind(that));
            }
        });
    }
    _apply() {
        let percent = 0;
        if (this.cpuid === -1) {
            percent = Math.round(((100 * this.total_cores) - this.usage[3]) /
                this.total_cores);
        } else {
            percent = Math.round((100 - this.usage[3]));
        }

        this.text_items[0].text = this.menu_items[0].text = percent.toString();

        if (this.menu_items[3]) {
            this.menu_items[3].text = this.current_freq_ghz + '/' + this.max_freq_ghz;
        }

        let other = 100;
        for (let i = 0; i < this.usage.length; i++) {
            other -= this.usage[i];
        }
        // Not to be confusing
        other = Math.max(0, other);
        this.vals = [this.usage[0], this.usage[1],
        this.usage[2], this.usage[4], other];
        for (let i = 0; i < 5; i++) {
            this.tip_vals[i] = Math.round(this.vals[i]);
        }
    }

    get_cores() {
        // Getting xcpu_total makes gjs 1.29.18 segfault
        // let cores = 0;
        // GTop.glibtop_get_cpu(this.gtop);
        // let gtop_total = this.gtop.xcpu_total
        // for (let i = 0; i < gtop_total.length;i++) {
        //     if (gtop_total[i] > 0)
        //         cores++;
        // }
        // return cores;
        return 1;
    }
    create_text_items() {
        const items = [
            new St.Label({
                text: '',
                style_class: this.extension._Style.get('sm-status-value'),
                y_align: Clutter.ActorAlign.CENTER
            }),
            new St.Label({
                text: '%', style_class: this.extension._Style.get('sm-perc-label'),
                y_align: Clutter.ActorAlign.CENTER
            })
        ];
        this._applyFontSize(items[0]);
        this._applyFontSize(items[1], 1, -1);
        return items;
    }
    create_menu_items() {
        const items = [
            new St.Label({
                text: '',
                style_class: this.extension._Style.get('sm-value')
            }),
            new St.Label({
                text: '%',
                style_class: this.extension._Style.get('sm-label')
            }),
            new St.Label({
                text: '',
                style_class: this.extension._Style.get('sm-label')
            }),
            new St.Label({
                text: '',
                style_class: this.extension._Style.get('sm-value')
            }),
            new St.Label({
                text: 'GHz',
                style_class: this.extension._Style.get('sm-label')
            })
        ];
        this._applyFontSize(items[0]);
        this._applyFontSize(items[1], 1, -1);
        this._applyFontSize(items[3]);
        this._applyFontSize(items[4], 1, -1);
        return items;
    }
}

// Check if one graph per core must be displayed and create the
//    appropriate number of cpu items
function createCpus(extension) {
    let array = [];
    let numcores = 1;

    if (extension._Schema.get_boolean('cpu-individual-cores')) {
        // get number of cores
        let gtop = new GTop.glibtop_cpu();
        try {
            numcores = GTop.glibtop_get_sysinfo().ncpu;
        } catch (e) {
            console.error(e);
            numcores = 1;
        }
    }

    // there are several cores to display,
    // instantiate each cpu
    if (numcores > 1) {
        for (let i = 0; i < numcores; i++) {
            array.push(new Cpu(extension, i));
        }
    } else {
        // individual cores option is not set or we failed to
        // get the number of cores, create a global cpu item
        array.push(new Cpu(extension, -1));
    }

    return array;
}

const Disk = class SystemMonitor_Disk extends ElementBase {
    constructor(extension) {
        super(extension, {
            elt: 'disk',
            item_name: _('Disk'),
            color_name: ['read', 'write']
        });
        this.mounts = extension._MountsMonitor.get_mounts();
        extension._MountsMonitor.add_listener(this.update_mounts.bind(this));
        this.last = [0, 0];
        this.usage = [0, 0];
        this.last_time = 0;
        this.tip_format(_('MiB/s'));
        this.update();
    }
    update_mounts(mounts) {
        this.mounts = mounts;
    }
    refresh() {
        let accum = [0, 0];

        let file = Gio.file_new_for_path('/proc/diskstats');
        file.load_contents_async(null, (source, result) => {
            let as_r = source.load_contents_finish(result);
            let lines = parse_bytearray(as_r[1]).toString().split('\n');

            for (let i = 0; i < lines.length; i++) {
                let line = lines[i];
                let entry = line.trim().split(/[\s]+/);
                if (typeof (entry[1]) === 'undefined') {
                    break;
                }
                accum[0] += parseInt(entry[5]);
                accum[1] += parseInt(entry[9]);
            }

            let time = GLib.get_monotonic_time() / 1000;
            let delta = (time - this.last_time) / 1000;
            if (delta > 0) {
                for (let i = 0; i < 2; i++) {
                    this.usage[i] = ((accum[i] - this.last[i]) / delta / 1024 / 8);
                    this.last[i] = accum[i];
                }
            }
            this.last_time = time;
        });
    }
    _apply() {
        this.vals = this.usage.slice();
        for (let i = 0; i < 2; i++) {
            if (this.usage[i] < 10) {
                this.usage[i] = Math.round(10 * this.usage[i]) / 10;
            } else {
                this.usage[i] = Math.round(this.usage[i]);
            }
        }
        this.tip_vals = [this.usage[0], this.usage[1]];
        this.menu_items[0].text = this.text_items[1].text = this.tip_vals[0].toLocaleString(this.extension._Locale);
        this.menu_items[3].text = this.text_items[4].text = this.tip_vals[1].toLocaleString(this.extension._Locale);
    }
    create_text_items() {
        const Style = this.extension._Style;
        const items = [
            new St.Label({
                text: _('R'),
                style_class: Style.get('sm-status-label')
            }),
            new St.Label({
                text: '',
                style_class: Style.get('sm-disk-value'),
                y_align: Clutter.ActorAlign.CENTER
            }),
            new St.Label({
                text: Style.diskunits(),
                style_class: Style.get('sm-disk-unit-label'),
                y_align: Clutter.ActorAlign.CENTER
            }),
            new St.Label({
                text: _('W'),
                style_class: Style.get('sm-status-label')
            }),
            new St.Label({
                text: '',
                style_class: Style.get('sm-disk-value'),
                y_align: Clutter.ActorAlign.CENTER
            }),
            new St.Label({
                text: Style.diskunits(),
                style_class: Style.get('sm-disk-unit-label'),
                y_align: Clutter.ActorAlign.CENTER
            })
        ];
        this._applyFontSize(items[1]);
        this._applyFontSize(items[2], 1, -1);
        this._applyFontSize(items[4]);
        this._applyFontSize(items[5], 1, -1);
        return items;
    }
    create_menu_items() {
        const Style = this.extension._Style;
        const items = [
            new St.Label({
                text: '',
                style_class: Style.get('sm-value')
            }),
            new St.Label({
                text: Style.diskunits(),
                style_class: Style.get('sm-label')
            }),
            new St.Label({
                text: ' ' + _('R'),
                style_class: Style.get('sm-label')
            }),
            new St.Label({
                text: '',
                style_class: Style.get('sm-value')
            }),
            new St.Label({
                text: Style.diskunits(),
                style_class: Style.get('sm-label')
            }),
            new St.Label({
                text: ' ' + _('W'),
                style_class: Style.get('sm-label')
            })
        ];
        this._applyFontSize(items[0]);
        this._applyFontSize(items[1], 1, -1);
        this._applyFontSize(items[3]);
        this._applyFontSize(items[4], 1, -1);
        return items;
    }
}

const Freq = class SystemMonitor_Freq extends ElementBase {
    constructor(extension) {
        super(extension, {
            elt: 'freq',
            item_name: _('Freq'),
            color_name: ['freq']
        });
        this.freq = 0;
        this.tip_format('MHz');

        extension._Schema.connect('changed::freq-display-mode', this.update.bind(this));

        this.update();
    }
    refresh() {
        let total_frequency = 0;
        let max_frequency = 0;
        let num_cpus = GTop.glibtop_get_sysinfo().ncpu;
        let i = 0;
        let file = Gio.file_new_for_path(`/sys/devices/system/cpu/cpu${i}/cpufreq/scaling_cur_freq`);
        let that = this;
        let display_mode = this.extension._Schema.get_enum('freq-display-mode');

        file.load_contents_async(null, function cb(source, result) {
            let as_r = source.load_contents_finish(result);
            let current_freq = parseInt(parse_bytearray(as_r[1]));

            total_frequency += current_freq;
            max_frequency = Math.max(max_frequency, current_freq);

            if (++i >= num_cpus) {
                if (display_mode === 0) { // 'max' mode
                    that.freq = Math.round(max_frequency / 1000);
                } else { // 'average' mode
                    that.freq = Math.round(total_frequency / num_cpus / 1000);
                }
            } else {
                file = Gio.file_new_for_path(`/sys/devices/system/cpu/cpu${i}/cpufreq/scaling_cur_freq`);
                file.load_contents_async(null, cb.bind(that));
            }
        });
    }
    _apply() {
        let value = this.freq.toString();
        this.text_items[0].text = value + ' ';
        this.vals[0] = value;
        this.tip_vals[0] = value;
        if (this.extension._Style.get('') !== '-compact') {
            this.menu_items[0].text = value;
        } else {
            this.menu_items[0].text = this._pad(value, 4);
        }
    }
    // pad a string with leading spaces
    _pad(number, length) {
        let str = '' + number;
        while (str.length < length) {
            str = ' ' + str;
        }
        return str;
    }
    create_text_items() {
        const items = [
            new St.Label({
                text: '',
                style_class: this.extension._Style.get('sm-big-status-value'),
                y_align: Clutter.ActorAlign.CENTER
            }),
            new St.Label({
                text: 'MHz', style_class: this.extension._Style.get('sm-perc-label'),
                y_align: Clutter.ActorAlign.CENTER
            })
        ];
        this._applyFontSize(items[0]);
        this._applyFontSize(items[1], 1, -1);
        return items;
    }
    create_menu_items() {
        const items = [
            new St.Label({
                text: '',
                style_class: this.extension._Style.get('sm-value')
            }),
            new St.Label({
                text: 'MHz',
                style_class: this.extension._Style.get('sm-label')
            })
        ];
        this._applyFontSize(items[0]);
        this._applyFontSize(items[1], 1, -1);
        return items;
    }
}

const Mem = class SystemMonitor_Mem extends ElementBase {
    constructor(extension) {
        super(extension, {
            elt: 'memory',
            elt_short: 'mem',
            item_name: _('Memory'),
            color_name: ['program', 'buffer', 'cache']
        });
        this.max = 1;

        this.gtop = new GTop.glibtop_mem();
        this.mem = [0, 0, 0];

        GTop.glibtop_get_mem(this.gtop);
        this.total = Math.round(this.gtop.total / 1024 / 1024);
        let threshold = 4 * 1024; // In MiB
        this.useGiB = false;
        this._unitConversion = 1024 * 1024;
        this._decimals = 100;
        if (this.total > threshold) {
            this.useGiB = true;
            this._unitConversion *= 1024 / this._decimals;
        }

        this.tip_format();
        this.update();
    }
    refresh() {
        GTop.glibtop_get_mem(this.gtop);
        if (this.useGiB) {
            this.mem[0] = Math.round(this.gtop.user / this._unitConversion);
            this.mem[0] /= this._decimals;
            this.mem[1] = Math.round(this.gtop.buffer / this._unitConversion);
            this.mem[1] /= this._decimals;
            this.mem[2] = Math.round(this.gtop.cached / this._unitConversion);
            this.mem[2] /= this._decimals;
            this.total = Math.round(this.gtop.total / this._unitConversion);
            this.total /= this._decimals;
        } else {
            this.mem[0] = Math.round(this.gtop.user / this._unitConversion);
            this.mem[1] = Math.round(this.gtop.buffer / this._unitConversion);
            this.mem[2] = Math.round(this.gtop.cached / this._unitConversion);
            this.total = Math.round(this.gtop.total / this._unitConversion);
        }
    }
    _pad(number) {
        const Locale = this.extension._Locale;
        if (this.useGiB) {
            if (number < 1) {
                // examples: 0.01, 0.10, 0.88
                return number.toLocaleString(Locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            }
            // examples: 5.85, 16.0, 128
            return number.toLocaleString(Locale, { minimumSignificantDigits: 3, maximumSignificantDigits: 3 });
        }

        return number.toLocaleString(Locale);
    }
    _apply() {
        if (this.total === 0) {
            this.vals = this.tip_vals = [0, 0, 0];
        } else {
            for (let i = 0; i < 3; i++) {
                this.vals[i] = this.mem[i] / this.total;
                this.tip_vals[i] = Math.round(this.vals[i] * 100);
            }
        }
        this.text_items[0].text = this.tip_vals[0].toString();
        this.menu_items[0].text = this.tip_vals[0].toLocaleString(this.extension._Locale);
        if (this.extension._Style.get('') !== '-compact') {
            this.menu_items[3].text = this._pad(this.mem[0]) +
                ' / ' + this._pad(this.total);
        } else {
            this.menu_items[3].text = this._pad(this.mem[0]) +
                '/' + this._pad(this.total);
        }
    }
    create_text_items() {
        const items = [
            new St.Label({
                text: '',
                style_class: this.extension._Style.get('sm-status-value'),
                y_align: Clutter.ActorAlign.CENTER
            }),
            new St.Label({
                text: '%', style_class: this.extension._Style.get('sm-perc-label'),
                y_align: Clutter.ActorAlign.CENTER
            })
        ];
        this._applyFontSize(items[0]);
        this._applyFontSize(items[1], 1, -1);
        return items;
    }
    create_menu_items() {
        let unit = _('MiB');
        if (this.useGiB) {
            unit = _('GiB');
        }
        const items = [
            new St.Label({
                text: '',
                style_class: this.extension._Style.get('sm-value')
            }),
            new St.Label({
                text: '%',
                style_class: this.extension._Style.get('sm-label')
            }),
            new St.Label({
                text: '',
                style_class: this.extension._Style.get('sm-label')
            }),
            new St.Label({
                text: '',
                style_class: this.extension._Style.get('sm-value')
            }),
            new St.Label({
                text: unit,
                style_class: this.extension._Style.get('sm-label')
            })
        ];
        this._applyFontSize(items[0]);
        this._applyFontSize(items[1], 1, -1);
        this._applyFontSize(items[3]);
        this._applyFontSize(items[4], 1, -1);
        return items;
    }
}

const Net = class SystemMonitor_Net extends ElementBase {
    constructor(extension) {
        super(extension, {
            elt: 'net',
            item_name: _('Net'),
            color_name: ['down', 'downerrors', 'up', 'uperrors', 'collisions']
        });
        this.speed_in_bits = false;
        this.ifs = [];
        this.client = NM.Client.new(null);
        this.update_iface_list();

        if (!this.ifs.length) {
            let net_lines = Shell.get_file_contents_utf8_sync('/proc/net/dev').split('\n');
            for (let i = 2; i < net_lines.length - 1; i++) {
                let ifc = net_lines[i].replace(/^\s+/g, '').split(':')[0];
                if (Shell.get_file_contents_utf8_sync('/sys/class/net/' + ifc + '/operstate')
                    .replace(/\s/g, '') === 'up' &&
                    ifc.indexOf('br') < 0 &&
                    ifc.indexOf('lo') < 0) {
                    this.ifs.push(ifc);
                }
            }
        }
        this.gtop = new GTop.glibtop_netload();
        this.last = [0, 0, 0, 0, 0];
        this.usage = [0, 0, 0, 0, 0];
        this.last_time = 0;
        this.tip_format([_('KiB/s'), '/s', _('KiB/s'), '/s', '/s']);
        this.update_units();
        this.extension._Schema.connect('changed::' + this.elt + '-speed-in-bits', this.update_units.bind(this));
        try {
            let iface_list = this.client.get_devices();
            this.NMsigID = [];
            for (let j = 0; j < iface_list.length; j++) {
                this.NMsigID[j] = iface_list[j].connect('state-changed', this.update_iface_list.bind(this));
            }
        } catch (e) {
            console.error('Please install Network Manager Gobject Introspection Bindings: ' + e);
        }
        this.update();
    }
    update_units() {
        this.speed_in_bits = this.extension._Schema.get_boolean(this.elt + '-speed-in-bits');
    }
    update_iface_list() {
        try {
            this.ifs = [];
            let iface_list = this.client.get_devices();
            for (let j = 0; j < iface_list.length; j++) {
                if (iface_list[j].state === NetworkManager.DeviceState.ACTIVATED) {
                    this.ifs.push(iface_list[j].get_ip_iface() || iface_list[j].get_iface());
                }
            }
        } catch (e) {
            console.error('Please install Network Manager Gobject Introspection Bindings');
        }
    }
    refresh() {
        let accum = [0, 0, 0, 0, 0];

        for (let ifn in this.ifs) {
            GTop.glibtop_get_netload(this.gtop, this.ifs[ifn]);
            accum[0] += this.gtop.bytes_in;
            accum[1] += this.gtop.errors_in;
            accum[2] += this.gtop.bytes_out;
            accum[3] += this.gtop.errors_out;
            accum[4] += this.gtop.collisions;
        }

        let time = GLib.get_monotonic_time() * 0.001024;
        let delta = time - this.last_time;
        if (delta > 0) {
            for (let i = 0; i < 5; i++) {
                this.usage[i] = Math.round((accum[i] - this.last[i]) / delta);
                this.last[i] = accum[i];
                this.vals[i] = this.usage[i];
            }
        }
        this.last_time = time;
    }

    // pad a string with leading spaces
    _pad(number, length) {
        let str = '' + number;
        while (str.length < length) {
            str = ' ' + str;
        }
        return str;
    }

    _apply() {
        const Style = this.extension._Style;
        this.tip_vals = this.usage;
        if (this.speed_in_bits) {
            this.tip_vals[0] = Math.round(this.tip_vals[0] * 8.192);
            this.tip_vals[2] = Math.round(this.tip_vals[2] * 8.192);
            if (this.tip_vals[0] < 1000) {
                this.text_items[2].text = Style.netunits_kbits();
                this.menu_items[1].text = this.tip_unit_labels[0].text = _('kbit/s');
            } else if (this.tip_vals[0] < 1000000) {
                this.text_items[2].text = Style.netunits_mbits();
                this.menu_items[1].text = this.tip_unit_labels[0].text = _('Mbit/s');
                this.tip_vals[0] = (this.tip_vals[0] / 1000).toPrecision(3);
            } else {
                this.text_items[2].text = Style.netunits_gbits();
                this.menu_items[1].text = this.tip_unit_labels[0].text = _('Gbit/s');
                this.tip_vals[0] = (this.tip_vals[0] / 1000000).toPrecision(3);
            }
            if (this.tip_vals[2] < 1000) {
                this.text_items[5].text = Style.netunits_kbits();
                this.menu_items[4].text = this.tip_unit_labels[2].text = _('kbit/s');
            } else if (this.tip_vals[2] < 1000000) {
                this.text_items[5].text = Style.netunits_mbits();
                this.menu_items[4].text = this.tip_unit_labels[2].text = _('Mbit/s');
                this.tip_vals[2] = (this.tip_vals[2] / 1000).toPrecision(3);
            } else {
                this.text_items[5].text = Style.netunits_gbits();
                this.menu_items[4].text = this.tip_unit_labels[2].text = _('Gbit/s');
                this.tip_vals[2] = (this.tip_vals[2] / 1000000).toPrecision(3);
            }
        } else {
            if (this.tip_vals[0] < 1024) {
                this.text_items[2].text = Style.netunits_kbytes();
                this.menu_items[1].text = this.tip_unit_labels[0].text = _('KiB/s');
            } else if (this.tip_vals[0] < 1048576) {
                this.text_items[2].text = Style.netunits_mbytes();
                this.menu_items[1].text = this.tip_unit_labels[0].text = _('MiB/s');
                this.tip_vals[0] = (this.tip_vals[0] / 1024).toPrecision(3);
            } else {
                this.text_items[2].text = Style.netunits_gbytes();
                this.menu_items[1].text = this.tip_unit_labels[0].text = _('GiB/s');
                this.tip_vals[0] = (this.tip_vals[0] / 1048576).toPrecision(3);
            }
            if (this.tip_vals[2] < 1024) {
                this.text_items[5].text = Style.netunits_kbytes();
                this.menu_items[4].text = this.tip_unit_labels[2].text = _('KiB/s');
            } else if (this.tip_vals[2] < 1048576) {
                this.text_items[5].text = Style.netunits_mbytes();
                this.menu_items[4].text = this.tip_unit_labels[2].text = _('MiB/s');
                this.tip_vals[2] = (this.tip_vals[2] / 1024).toPrecision(3);
            } else {
                this.text_items[5].text = Style.netunits_gbytes();
                this.menu_items[4].text = this.tip_unit_labels[2].text = _('GiB/s');
                this.tip_vals[2] = (this.tip_vals[2] / 1048576).toPrecision(3);
            }
        }

        if (Style.get('') !== '-compact') {
            this.menu_items[0].text = this.text_items[1].text = this.tip_vals[0].toString();
            this.menu_items[3].text = this.text_items[4].text = this.tip_vals[2].toString();
        } else {
            this.menu_items[0].text = this.text_items[1].text = this._pad(this.tip_vals[0].toString(), 4);
            this.menu_items[3].text = this.text_items[4].text = this._pad(this.tip_vals[2].toString(), 4);
        }
    }
    create_text_items() {
        const Style = this.extension._Style;
        const IconSize = this.extension._IconSize;
        const MyIconScale = 1.3 * Style.iconsize();
        const items = [
            new St.Icon({
                icon_size: IconSize * MyIconScale,
                icon_name: 'go-down-symbolic',
                style_class: 'sm-net-unit-icon-down'
            }),
            new St.Label({
                text: '',
                style_class: Style.get('sm-net-value'),
                style: 'min-width: 80px; text-align: right;',
                y_align: Clutter.ActorAlign.CENTER
            }),
            new St.Label({
                text: _('KiB/s'),
                style_class: Style.get('sm-net-unit-label'),
                y_align: Clutter.ActorAlign.CENTER
            }),
            new St.Icon({
                icon_size: IconSize * MyIconScale,
                icon_name: 'go-up-symbolic',
                style_class: 'sm-net-unit-icon-up'
            }),
            new St.Label({
                text: '',
                style_class: Style.get('sm-net-value'),
                style: 'min-width: 80px; text-align: right;',
                y_align: Clutter.ActorAlign.CENTER
            }),
            new St.Label({
                text: _('KiB/s'),
                style_class: Style.get('sm-net-unit-label'),
                y_align: Clutter.ActorAlign.CENTER
            })
        ];
        this._applyFontSize(items[1]);
        this._applyFontSize(items[2], 1, -1);
        this._applyFontSize(items[4]);
        this._applyFontSize(items[5], 1, -1);
        return items;
    }
    create_menu_items() {
        const Style = this.extension._Style;
        const items = [
            new St.Label({
                text: '',
                style_class: Style.get('sm-value')
            }),
            new St.Label({
                text: _('KiB/s'),
                style_class: Style.get('sm-label')
            }),
            new St.Label({
                text: _(' ↓'),
                style_class: Style.get('sm-label')
            }),
            new St.Label({
                text: '',
                style_class: Style.get('sm-value')
            }),
            new St.Label({
                text: _(' KiB/s'),
                style_class: Style.get('sm-label')
            }),
            new St.Label({
                text: _(' ↑'),
                style_class: Style.get('sm-label')
            })
        ];
        this._applyFontSize(items[0]);
        this._applyFontSize(items[1], 1, -1);
        this._applyFontSize(items[3]);
        this._applyFontSize(items[4], 1, -1);
        return items;
    }
}

const Swap = class SystemMonitor_Swap extends ElementBase {
    constructor(extension) {
        super(extension, {
            elt: 'swap',
            item_name: _('Swap'),
            color_name: ['used']
        });
        this.max = 1;
        this.gtop = new GTop.glibtop_swap();

        GTop.glibtop_get_swap(this.gtop);
        this.total = Math.round(this.gtop.total / 1024 / 1024);
        let threshold = 4 * 1024; // In MiB
        this.useGiB = false;
        this._unitConversion = 1024 * 1024;
        this._decimals = 100;
        if (this.total > threshold) {
            this.useGiB = true;
            this._unitConversion *= 1024 / this._decimals;
        }

        this.tip_format();
        this.update();
    }
    refresh() {
        GTop.glibtop_get_swap(this.gtop);
        if (this.useGiB) {
            this.swap = Math.round(this.gtop.used / this._unitConversion);
            this.swap /= this._decimals;
            this.total = Math.round(this.gtop.total / this._unitConversion);
            this.total /= this._decimals;
        } else {
            this.swap = Math.round(this.gtop.used / this._unitConversion);
            this.total = Math.round(this.gtop.total / this._unitConversion);
        }
    }
    _pad(number) {
        if (this.useGiB) {
            if (number < 1) {
                // examples: 0.01, 0.10, 0.88
                return number.toLocaleString(this.extension._Locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            }
            // examples: 5.85, 16.0, 128
            return number.toLocaleString(this.extension._Locale, { minimumSignificantDigits: 3, maximumSignificantDigits: 3 });
        }

        return number.toLocaleString(this.extension._Locale);
    }
    _apply() {
        if (this.total === 0) {
            this.vals = this.tip_vals = [0];
        } else {
            this.vals[0] = this.swap / this.total;
            this.tip_vals[0] = Math.round(this.vals[0] * 100);
        }
        this.text_items[0].text = this.tip_vals[0].toString();
        this.menu_items[0].text = this.tip_vals[0].toString();
        if (this.extension._Style.get('') !== '-compact') {
            this.menu_items[3].text = this._pad(this.swap) +
                ' / ' + this._pad(this.total);
        } else {
            this.menu_items[3].text = this._pad(this.swap) +
                '/' + this._pad(this.total);
        }
    }

    create_text_items() {
        const items = [
            new St.Label({
                text: '',
                style_class: this.extension._Style.get('sm-status-value'),
                y_align: Clutter.ActorAlign.CENTER
            }),
            new St.Label({
                text: '%',
                style_class: this.extension._Style.get('sm-perc-label'),
                y_align: Clutter.ActorAlign.CENTER
            })
        ];
        this._applyFontSize(items[0]);
        this._applyFontSize(items[1], 1, -1);
        return items;
    }
    create_menu_items() {
        let unit = 'MiB';
        if (this.useGiB) {
            unit = 'GiB';
        }
        const items = [
            new St.Label({
                text: '',
                style_class: this.extension._Style.get('sm-value')
            }),
            new St.Label({
                text: '%',
                style_class: this.extension._Style.get('sm-label')
            }),
            new St.Label({
                text: '',
                style_class: this.extension._Style.get('sm-label')
            }),
            new St.Label({
                text: '',
                style_class: this.extension._Style.get('sm-value')
            }),
            new St.Label({
                text: _(unit),
                style_class: this.extension._Style.get('sm-label')
            })
        ];
        this._applyFontSize(items[0]);
        this._applyFontSize(items[1], 1, -1);
        this._applyFontSize(items[3]);
        this._applyFontSize(items[4], 1, -1);
        return items;
    }
}

const Thermal = class SystemMonitor_Thermal extends ElementBase {
    constructor(extension) {
        super(extension, {
            elt: 'thermal',
            elt_short: 'thrm',
            item_name: _('Thermal'),
            color_name: ['tz0']
        });
        this.menu_rows = 2;
        this.max = 100;
        this.sensors = check_sensors("temp");

        this.item_name = _('Thermal');
        this.temperature = '-- ';
        this.fahrenheit_unit = extension._Schema.get_boolean(this.elt + '-fahrenheit-unit');
        this.display_error = true;
        this.tip_format(this.temperature_symbol());

        this.menu_sensors = [];
        this.menu_temps = ['--', '--', '--', '--'];

        const Schema = extension._Schema;
        Schema.connect('changed::' + this.elt + '-sensor-label', this.refresh.bind(this));
        for (let i = 1; i <= 4; i++) {
            const key = this.elt + '-menu-sensor-label-' + i;
            Schema.connect('changed::' + key, this.refresh.bind(this));
        }

        this.update();
    }
    refresh() {
        if (this.sensors === undefined || Object.keys(this.sensors).length === 0) {
            return;
        }
        const Schema = this.extension._Schema;

        let label = Schema.get_string(this.elt + '-sensor-label');
        let sfile = this.sensors[label];
        if (sfile === undefined && this.display_error) {
            const validLabels = Object.keys(this.sensors).join(', ');
            sm_log(`Invalid thermal sensor label: "${label}" (valid choices: ${validLabels})`, 'error');
            this.display_error = false;
            return;
        }
        if (!try_read_int_file(sfile, value => this.temperature = Math.round(value / 1000)) && this.display_error) {
            sm_log(`Error reading thermal sensor file: ${sfile}`, 'error');
            this.display_error = false;
        }

        this.menu_sensors = [];
        for (let i = 1; i <= 4; i++) {
            const key = this.elt + '-menu-sensor-label-' + i;
            const ml = Schema.get_string(key);
            const mf = ml ? this.sensors[ml] : undefined;
            this.menu_sensors.push(mf || null);
        }

        this.read_menu_temps();

        this.fahrenheit_unit = Schema.get_boolean(this.elt + '-fahrenheit-unit');
    }
    read_menu_temps() {
        for (let i = 0; i < 4; i++) {
            const sfile = this.menu_sensors[i];
            if (sfile) {
                const idx = i;
                try_read_int_file(sfile, value => {
                    this.menu_temps[idx] = Math.round(value / 1000);
                });
            } else {
                this.menu_temps[i] = '--';
            }
        }
    }
    _apply() {
        this.text_items[0].text = this.temperature_text();
        this.temp_over_threshold = this.temperature > this.extension._Schema.get_int('thermal-threshold');
        this.vals = [this.temperature];
        this.tip_vals[0] = this.temperature_text();
        this.text_items[1].text = this.temperature_symbol();
        this.tip_unit_labels[0].text = _(this.temperature_symbol());

        const sym = this.temperature_symbol();
        const Schema = this.extension._Schema;
        for (let i = 0; i < 4; i++) {
            const t = this.menu_temps[i];
            const val = typeof t === 'number' ? this.temperature_text(t) : '--';
            const fullLabel = Schema.get_string(this.elt + '-menu-sensor-label-' + (i + 1));
            const sn = this._short_name(fullLabel);
            
            if (this.menu_item_labels && this.menu_item_labels[i]) {
                this.menu_item_labels[i].text = sn ? sn + ': ' + val : '--';
            }
            if (this.menu_item_symbols && this.menu_item_symbols[i]) {
                this.menu_item_symbols[i].text = typeof t === 'number' ? sym : '';
            }
        }
    }
    _short_name(fullLabel) {
        if (!fullLabel) return '';
        const parts = fullLabel.split(' - ');
        const last = parts[parts.length - 1];
        return last.length > 12 ? last.substring(0, 10) + '..' : last;
    }
    create_text_items() {
        const items = [
            new St.Label({
                text: '',
                style_class: this.extension._Style.get('sm-status-value'),
                y_align: Clutter.ActorAlign.CENTER
            }),
            new St.Label({
                text: this.temperature_symbol(),
                style_class: this.extension._Style.get('sm-temp-label'),
                y_align: Clutter.ActorAlign.CENTER
            })
        ];
        this._applyFontSize(items[0]);
        this._applyFontSize(items[1], 1, -1);
        return items;
    }
    create_menu_items() {
        const Style = this.extension._Style;
        const items = [];
        this.menu_item_labels = [];
        this.menu_item_symbols = [];

        const create_cell = () => {
            const valLabel = new St.Label({
                text: '',
                style_class: Style.get('sm-value')
            });
            this._applyFontSize(valLabel);

            const symLabel = new St.Label({
                text: '',
                style_class: Style.get('sm-label')
            });
            this._applyFontSize(symLabel, 1, -1);

            this.menu_item_labels.push(valLabel);
            this.menu_item_symbols.push(symLabel);

            return [valLabel, symLabel];
        };

        // Row 0
        let [v0, s0] = create_cell();
        let spacer0 = new St.Label({ text: '', style_class: Style.get('sm-label') });
        let [v1, s1] = create_cell();
        items.push(v0, s0, spacer0, v1, s1);

        // Row 1
        let [v2, s2] = create_cell();
        let spacer1 = new St.Label({ text: '', style_class: Style.get('sm-label') });
        let [v3, s3] = create_cell();
        items.push(v2, s2, spacer1, v3, s3);

        return items;
    }
    temperature_text(t) {
        let temperature = t !== undefined ? t : this.temperature;
        if (temperature === '-- ') temperature = '--';
        if (this.fahrenheit_unit && typeof temperature === 'number') {
            temperature = Math.round(temperature * 1.8 + 32);
        }
        return temperature.toString();
    }
    temperature_symbol() {
        return this.fahrenheit_unit ? '°F' : '°C';
    }
}

const Fan = class SystemMonitor_Fan extends ElementBase {
    constructor(extension) {
        super(extension, {
            elt: 'fan',
            item_name: _('Fan'),
            color_name: ['fan0']
        });
        this.sensors = check_sensors("fan");
        this.rpm = 0;
        this.display_error = true;
        this.tip_format(_('rpm'));

        this.menu_rpms = [0, 0];

        const Schema = extension._Schema;
        Schema.connect('changed::' + this.elt + '-sensor-label', this.refresh.bind(this));
        Schema.connect('changed::' + this.elt + '-menu-sensor-label-1', this.refresh.bind(this));
        Schema.connect('changed::' + this.elt + '-menu-sensor-label-2', this.refresh.bind(this));
        this.update();
    }
    refresh() {
        if (this.sensors === undefined || Object.keys(this.sensors).length === 0) {
            return;
        }
        const Schema = this.extension._Schema;

        let label = Schema.get_string(this.elt + '-sensor-label');
        let sfile = this.sensors[label];
        if (sfile === undefined && this.display_error) {
            const validLabels = Object.keys(this.sensors).join(', ');
            sm_log(`Invalid fan sensor label: "${label}" (valid choices: ${validLabels})`, 'error');
            this.display_error = false;
            return;
        }
        if (!try_read_int_file(sfile, value => this.rpm = value) && this.display_error) {
            sm_log(`Error reading fan sensor file: ${sfile}`, 'error');
            this.display_error = false;
        }
        if (sfile) {
            try_read_int_file(sfile.replace(/_input$/, '_min'), value => this.min = value);
            try_read_int_file(sfile.replace(/_input$/, '_max'), value => this.max = value);
        }

        for (let i = 1; i <= 2; i++) {
            const key = this.elt + '-menu-sensor-label-' + i;
            const ml = Schema.get_string(key);
            const mf = ml ? this.sensors[ml] : undefined;
            if (mf) {
                const idx = i - 1;
                try_read_int_file(mf, value => {
                    this.menu_rpms[idx] = value;
                });
            } else {
                this.menu_rpms[i - 1] = -1;
            }
        }
    }
    _apply() {
        this.text_items[0].text = this.rpm.toString();
        this.vals = [this.rpm];
        this.tip_vals[0] = this.rpm;

        const Schema = this.extension._Schema;
        for (let i = 0; i < 2; i++) {
            const rpm = this.menu_rpms[i];
            const val = rpm >= 0 ? rpm.toString() : '--';
            const fullLabel = Schema.get_string(this.elt + '-menu-sensor-label-' + (i + 1));
            const sn = fullLabel ? this._short_name(fullLabel) : '';
            
            if (this.menu_item_labels && this.menu_item_labels[i]) {
                this.menu_item_labels[i].text = sn ? sn + ': ' + val : '--';
            }
            if (this.menu_item_symbols && this.menu_item_symbols[i]) {
                this.menu_item_symbols[i].text = rpm >= 0 ? _('rpm') : '';
            }
        }
    }
    _short_name(fullLabel) {
        if (!fullLabel) return '';
        const parts = fullLabel.split(' - ');
        const last = parts[parts.length - 1];
        return last.length > 12 ? last.substring(0, 10) + '..' : last;
    }
    create_text_items() {
        const items = [
            new St.Label({
                text: '',
                style_class: this.extension._Style.get('sm-status-value'),
                y_align: Clutter.ActorAlign.CENTER
            }),
            new St.Label({
                text: _('rpm'), style_class: this.extension._Style.get('sm-unit-label'),
                y_align: Clutter.ActorAlign.CENTER
            })
        ];
        this._applyFontSize(items[0]);
        this._applyFontSize(items[1], 1, -1);
        return items;
    }
    create_menu_items() {
        const Style = this.extension._Style;
        const items = [];
        this.menu_item_labels = [];
        this.menu_item_symbols = [];

        const create_cell = () => {
            const valLabel = new St.Label({
                text: '',
                style_class: Style.get('sm-value')
            });
            this._applyFontSize(valLabel);

            const symLabel = new St.Label({
                text: '',
                style_class: Style.get('sm-label')
            });
            this._applyFontSize(symLabel, 1, -1);

            this.menu_item_labels.push(valLabel);
            this.menu_item_symbols.push(symLabel);

            return [valLabel, symLabel];
        };

        let [v0, s0] = create_cell();
        let spacer = new St.Label({ text: '', style_class: Style.get('sm-label') });
        let [v1, s1] = create_cell();
        items.push(v0, s0, spacer, v1, s1);

        return items;
    }
}

const Gpu = class SystemMonitor_Gpu extends ElementBase {
    constructor(extension) {
        super(extension, {
            elt: 'gpu',
            item_name: _('GPU'),
            color_name: ['used', 'memory']
        });
        this.max = 100;

        this.item_name = _('GPU');
        this.mem = 0;
        this.total = 0;
        this.tip_format();
        this.update();
    }
    _unit(total) {
        this.total = total;
        let threshold = 4 * 1024; // In MiB
        this.useGiB = false;
        this._unitConversion = 1;
        this._decimals = 100;
        if (this.total > threshold) {
            this.useGiB = true;
            this._unitConversion *= 1024 / this._decimals;
        }
    }
    refresh() {
        // Run asynchronously, to avoid shell freeze
        try {
            let path = this.extension.path;
            let script = ['/usr/bin/env', 'bash', path + '/gpu_usage.sh'];

            // Create subprocess and capture STDOUT
            let proc = new Gio.Subprocess({ argv: script, flags: Gio.SubprocessFlags.STDOUT_PIPE });
            proc.init(null);
            // Asynchronously call the output handler when script output is ready
            proc.communicate_utf8_async(null, null, this._handleOutput.bind(this));
        } catch (err) {
            console.error(err.message);
        }
    }
    _handleOutput(proc, result) {
        let [ok, output,] = proc.communicate_utf8_finish(result);
        if (ok) {
            this._readTemperature(output);
        } else {
            console.error('gpu_usage.sh invocation failed');
        }
    }
    _sanitizeUsageValue(val) {
        val = parseInt(val);
        if (isNaN(val)) {
            val = 0
        }
        return val;
    }
    _readTemperature(procOutput) {
        let usage = procOutput.split('\n');
        let memTotal = this._sanitizeUsageValue(usage[0]);
        let memUsed = this._sanitizeUsageValue(usage[1]);
        this.percentage = this._sanitizeUsageValue(usage[2]);
        if (typeof this.useGiB === 'undefined') {
            this._unit(memTotal);
            this._update_unit();
        }

        if (this.useGiB) {
            this.mem = Math.round(memUsed / this._unitConversion);
            this.mem /= this._decimals;
            this.total = Math.round(memTotal / this._unitConversion);
            this.total /= this._decimals;
        } else {
            this.mem = Math.round(memUsed / this._unitConversion);
            this.total = Math.round(memTotal / this._unitConversion);
        }
    }
    _pad(number) {
        if (this.useGiB) {
            if (number < 1) {
                // examples: 0.01, 0.10, 0.88
                return number.toFixed(2);
            }
            // examples: 5.85, 16.0, 128
            return number.toPrecision(3);
        }

        return number;
    }
    _update_unit() {
        let unit = _('MiB');
        if (this.useGiB) {
            unit = _('GiB');
        }
        this.menu_items[4].text = unit;
    }
    _apply() {
        const Style = this.extension._Style;
        const Locale = this.extension._Locale;
        this.tip_unit_labels[1].text = "/ " + this.total + " " + this.menu_items[4].text;
        if (this.total === 0) {
            this.vals = [0, 0];
            this.tip_vals = [0, 0];
        } else {
            // we subtract percentage from memory because we do not want memory to be
            // "accumulated" in the chart with utilization; these two measures should be
            // independent
            this.vals = [this.percentage, this.mem / this.total * 100 - this.percentage];
            this.tip_vals = [Math.round(this.vals[0]), this.mem];
        }
        this.text_items[0].text = this.tip_vals[0].toString();
        this.menu_items[0].text = this.tip_vals[0].toLocaleString(Locale);

        if (Style.get('') !== '-compact') {
            this.menu_items[3].text = this._pad(this.mem).toLocaleString(Locale) +
                '  /  ' + this._pad(this.total).toLocaleString(Locale);
        } else {
            this.menu_items[3].text = this._pad(this.mem).toLocaleString(Locale) +
                '/' + this._pad(this.total).toLocaleString(Locale);
        }
    }
    create_text_items() {
        const Style = this.extension._Style;
        const items = [
            new St.Label({
                text: '',
                style_class: Style.get('sm-status-value'),
                y_align: Clutter.ActorAlign.CENTER
            }),
            new St.Label({
                text: '%',
                style_class: Style.get('sm-perc-label'),
                y_align: Clutter.ActorAlign.CENTER
            })
        ];
        this._applyFontSize(items[0]);
        this._applyFontSize(items[1], 1, -1);
        return items;
    }
    create_menu_items() {
        const Style = this.extension._Style;
        let unit = _('MiB');
        if (this.useGiB) {
            unit = _('GiB');
        }
        const items = [
            new St.Label({
                text: '',
                style_class: Style.get('sm-value')
            }),
            new St.Label({
                text: '%',
                style_class: Style.get('sm-label')
            }),
            new St.Label({
                text: '',
                style_class: Style.get('sm-label')
            }),
            new St.Label({
                text: '',
                style_class: Style.get('sm-value')
            }),
            new St.Label({
                text: unit,
                style_class: Style.get('sm-label')
            })
        ];
        this._applyFontSize(items[0]);
        this._applyFontSize(items[1], 1, -1);
        this._applyFontSize(items[3]);
        this._applyFontSize(items[4], 1, -1);
        return items;
    }
}

const Icon = class SystemMonitor_Icon {
    constructor(extension) {
        this.extension = extension;
        this.actor = new St.Icon({
            icon_name: 'org.gnome.SystemMonitor-symbolic',
            style_class: 'system-status-icon'
        });
        this.actor.visible = this.extension._Schema.get_boolean('icon-display');
        this.extension._Schema.connect(
            'changed::icon-display',
            () => {
                this.actor.visible = this.extension._Schema.get_boolean('icon-display');
            }
        );
    }
}

export default class SystemMonitorExtension extends Extension {
    openSystemMonitor() {
        let _appSys = Shell.AppSystem.get_default();
        let _gsmApp = _appSys.lookup_app('org.gnome.SystemMonitor.desktop') || _appSys.lookup_app('gnome-system-monitor.desktop');
        let customCmd = this._Schema.get_string('custom-monitor-command');

        if (!customCmd || customCmd.trim() === '') {
            _gsmApp.activate();
            return;
        }

        sm_log("Executing custom system monitor command: " + customCmd);
        try {
            let [success, argv] = GLib.shell_parse_argv(customCmd);
            if (!success) {
                sm_log('Failed to parse custom monitor command: ' + customCmd, 'error');
                _gsmApp.activate();
                return;
            }

            let proc = new Gio.Subprocess({
                argv: argv,
                flags: Gio.SubprocessFlags.NONE
            });
            proc.init(null);
            proc.wait_async(null, (proc, result) => {
                try {
                    proc.wait_finish(result);
                    sm_log('Custom system monitor command completed with exit code: ' + proc.get_exit_status());
                } catch (e) {
                    sm_log('Error waiting for process completion: ' + e.message, 'error');
                }
            });
        } catch (e) {
            sm_log('Failed to execute custom monitor command: ' + e.message, 'error');
            _gsmApp.activate();
        }
    }

    enable() {
        sm_log('applet enable from ' + this.path);

        migrateSettings(this);

        // Get locale, needed as an argument for toLocaleString() since GNOME Shell 3.24
        // See: mozjs library bug https://bugzilla.mozilla.org/show_bug.cgi?id=999003
        this._Locale = GLib.get_language_names()[0];
        if (this._Locale.indexOf('_') !== -1) {
            this._Locale = this._Locale.split('_')[0];
        }

        // fallback to en for unsupported locale
        try {
            new Date().toLocaleString(this._Locale);
        } catch (e) {
            sm_log('fallback to EN: ' + e.message, 'warn')
            this._Locale = 'en'
        }

        this._IconSize = Math.round(PANEL_ICON_SIZE * 4 / 5);

        this._Schema = this.getSettings();

        this._Style = new smStyleManager(this);
        this._MountsMonitor = new smMountsMonitor(this);

        this._Background = color_from_string(this._Schema.get_string('background'));

        this._menuIsOpen = false;
        this.menuTimeout = null;


        this._MountsMonitor.connect();

        // Debug
        this.__sm = {
            tray: new PanelMenu.Button(0.5),
            icon: new Icon(this),
            pie: new Pie(this),
            bar: new Bar(this),
            elts: [],
        };

        // Items to Monitor
        let tray = this.__sm.tray;

        // Load the preferred position of the displays and insert them in said order.
        const positionList = {};
        // CPUs are inserted differently, so cpu-position is stored apart
        const cpuPosition = this._Schema.get_int('cpu-position');
        positionList[cpuPosition] = createCpus(this);
        positionList[this._Schema.get_int('freq-position')] = new Freq(this);
        positionList[this._Schema.get_int('memory-position')] = new Mem(this);
        positionList[this._Schema.get_int('swap-position')] = new Swap(this);
        positionList[this._Schema.get_int('net-position')] = new Net(this);
        positionList[this._Schema.get_int('disk-position')] = new Disk(this);
        positionList[this._Schema.get_int('gpu-position')] = new Gpu(this);
        positionList[this._Schema.get_int('thermal-position')] = new Thermal(this);
        positionList[this._Schema.get_int('fan-position')] = new Fan(this);
        // See TODO inside Battery
        // positionList[this._Schema.get_int('battery-position')] = new Battery(this);


        this._Schema.connect('changed::background', (schema, key) => {
            this._Background = color_from_string(this._Schema.get_string(key));
        });
        PanelHost.addPanelBoxItem('system-monitor', tray, 1, PanelHost.sideForIndex(
            this._Schema.get_int('system-monitor-box')));

        // The spacing adds a distance between the graphs/text on the top bar
        let spacing = this._Schema.get_boolean('compact-display') ? '6' : '12';
        let box = new St.BoxLayout({ style: 'spacing: ' + spacing + 'px;' });
        tray.add_child(box);
        box.add_child(this.__sm.icon.actor);

        // Need to convert the positionList object into an array
        // (sorted by object key) and then expand out the CPUs list
        const sortedPLEntries = Object.entries(positionList).sort((a, b) => a[0] - b[0]);
        const sortedPLValues = sortedPLEntries.map(([key, value]) => value);
        this.__sm.elts = sortedPLValues.flat();

        // Add items to panel box
        for (const elt of this.__sm.elts) {
            box.add_child(elt.actor);
        }

        // Build Menu Info Box Table
        let menu_info = new PopupMenu.PopupBaseMenuItem({ reactive: false });
        let menu_info_box = new St.BoxLayout();
        menu_info.actor.add_child(menu_info_box);
        this.__sm.tray.menu.addMenuItem(menu_info, 0);

        build_menu_info(this);

        tray.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        let pie_item = this.__sm.pie;
        pie_item.create_menu_item();
        tray.menu.addMenuItem(pie_item.menu_item);

        let bar_item = this.__sm.bar;
        bar_item.create_menu_item();
        tray.menu.addMenuItem(bar_item.menu_item);

        change_usage(this);
        this._Schema.connect('changed::disk-usage-style', change_usage);

        tray.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        tray.menu.connect(
            'open-state-changed',
            (menu, isOpen) => {
                this._menuIsOpen = isOpen;
                if (isOpen) {
                    this.__sm.pie.actor.queue_repaint();
                    this.__sm.bar.actor.queue_repaint();

                    this.menuTimeout = GLib.timeout_add_seconds(
                        GLib.PRIORITY_DEFAULT,
                        5,
                        () => {
                            this.__sm.pie.actor.queue_repaint();
                            this.__sm.bar.actor.queue_repaint();
                            return GLib.SOURCE_CONTINUE;
                        });
                } else {
                    GLib.Source.remove(this.menuTimeout);
                }
            }
        );

        let item;
        item = new PopupMenu.PopupMenuItem(_('System Monitoring'));
        item.label.x_expand = true;
        item.label.x_align = Clutter.ActorAlign.CENTER;
        item.connect('activate', () => {
            this.openSystemMonitor();
        });
        tray.menu.addMenuItem(item);

        // item = new PopupMenu.PopupMenuItem(_('Preferences...'));
        // item.connect('activate', () => {
        //     this.openPreferences();
        // });
        // tray.menu.addMenuItem(item);

        Main.panel.menuManager.addMenu(tray.menu);
    }

    disable() {
        if (this.menuTimeout) {
            GLib.Source.remove(this.menuTimeout);
            this.menuTimeout = null;
        }
        // restore system power icon if necessary
        // workaround bug introduced by multiple cpus init :
        // if (Schema.get_boolean('battery-hidesystem') && this.__sm.elts.battery.icon_hidden) {
        //    this.__sm.elts.battery.hide_system_icon(false);
        // }
        // for (let i in this.__sm.elts) {
        //    if (this.__sm.elts[i].elt == 'battery')
        //        this.__sm.elts[i].hide_system_icon(false);
        // }

        if (this._MountsMonitor) {
            this._MountsMonitor.disconnect();
            this._MountsMonitor = null;
        }

        if (this._Style) {
            this._Style = null;
        }

        for (let eltName in this.__sm.elts) {
            this.__sm.elts[eltName].destroy();
        }
        if (this.__sm.pie) {
            this.__sm.pie.destroy();
        }
        if (this.__sm.bar) {
            this.__sm.bar.destroy();
        }
        this.__sm.tray.destroy();
        this.__sm = null;

        sm_log('applet disable');
    }
}
