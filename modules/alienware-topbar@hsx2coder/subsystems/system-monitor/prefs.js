/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */

'use strict';

import GObject from "gi://GObject";
import Gtk from "gi://Gtk";
import Gio from "gi://Gio";
import Gdk from "gi://Gdk";
import Adw from "gi://Adw";

import { ExtensionPreferences, gettext as _ } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

import { check_sensors } from './common.js';

// Order of the widgets when no position has been saved yet.
const WIDGET_TYPES = ['cpu', 'freq', 'memory', 'swap', 'net', 'disk', 'gpu', 'thermal', 'fan', 'battery'];

String.prototype.capitalize = function () {
    return this.replace(/(^|\s)([a-z])/g, function (m, p1, p2) {
        return p1 + p2.toUpperCase();
    });
};

function color_to_hex(color) {
    const hex = channel => Math.round(255 * channel).toString(16).padStart(2, '0');
    return `#${hex(color.red)}${hex(color.green)}${hex(color.blue)}${hex(color.alpha)}`;
}

// Builds a combo row whose selection is stored as an enum/string setting.
function comboFromList(title, labels, selected, onChange) {
    const model = new Gtk.StringList();
    labels.forEach(label => model.append(label));
    const row = new Adw.ComboRow({ title, model, selected: Math.max(0, selected) });
    row.connect('notify::selected', widget => onChange(widget.selected));
    return row;
}

// ** General Preferences Page **
const SMGeneralPrefsPage = GObject.registerClass({
    GTypeName: 'SMGeneralPrefsPage',
    Template: import.meta.url.replace('prefs.js', 'ui/prefsGeneralSettings.ui'),
    InternalChildren: ['background', 'icon_display', 'show_tooltip',
        'compact_display', 'rotate_labels',
        'tooltip_delay_ms', 'graph_delay_m', 'custom_monitor_switch', 'custom_monitor_command'],
}, class SMGeneralPrefsPage extends Adw.PreferencesPage {
    constructor(settings, params = {}) {
        super(params);

        this._settings = settings;

        const color = new Gdk.RGBA();
        color.parse(this._settings.get_string('background'));
        this._background.set_rgba(color);
        this._background.set_dialog(new Gtk.ColorDialog({ modal: true, with_alpha: true }));

        this._background.connect('notify::rgba', colorButton => {
            this._settings.set_string('background', color_to_hex(colorButton.get_rgba()));
        });
        this._settings.connect('changed::background', () => {
            color.parse(this._settings.get_string('background'));
            this._background.set_rgba(color);
        });

        this._settings.bind('icon-display', this._icon_display, 'active', Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('show-tooltip', this._show_tooltip, 'active', Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('compact-display', this._compact_display, 'active', Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('rotate-labels', this._rotate_labels, 'active', Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('tooltip-delay-ms', this._tooltip_delay_ms, 'value', Gio.SettingsBindFlags.DEFAULT);
        this._settings.bind('graph-cooldown-delay-m', this._graph_delay_m, 'value', Gio.SettingsBindFlags.DEFAULT);

        const hasCommand = this._settings.get_string('custom-monitor-command').trim() !== '';
        this._custom_monitor_switch.active = hasCommand;
        this._custom_monitor_command.visible = hasCommand;

        this._custom_monitor_switch.connect('notify::active', () => {
            this._custom_monitor_command.visible = this._custom_monitor_switch.active;
            if (!this._custom_monitor_switch.active)
                this._settings.set_string('custom-monitor-command', '');
        });

        this._settings.bind('custom-monitor-command', this._custom_monitor_command,
            'text', Gio.SettingsBindFlags.DEFAULT);
    }
});

// ** One widget: position, visibility and appearance in a single row **
const SMWidgetRow = GObject.registerClass({
    GTypeName: 'SMWidgetRow',
}, class SMWidgetRow extends Adw.ExpanderRow {
    constructor(page, settings, widgetType, colorDialog) {
        super({ title: _(widgetType.capitalize()) });
        this._page = page;
        this._settings = settings;
        this._type = widgetType;
        this._colorDialog = colorDialog;
        this._signalIds = [];

        this._buildPositionControls();
        this._buildVisibility();
        this._buildAppearance();
        this._buildWidgetOptions();

        this._watch(`changed::${widgetType}-display`, () => this._updateSummary());
        this._watch(`changed::${widgetType}-style`, () => this._updateSummary());
        this._updateSummary();

        this.connect('destroy', () => {
            for (const id of this._signalIds)
                this._settings.disconnect(id);
            this._signalIds = [];
        });
    }

    _watch(signal, callback) {
        this._signalIds.push(this._settings.connect(signal, callback));
    }

    get widgetType() {
        return this._type;
    }

    _buildPositionControls() {
        const box = new Gtk.Box({ spacing: 0, valign: Gtk.Align.CENTER, css_classes: ['linked'] });
        this._upButton = new Gtk.Button({
            icon_name: 'go-up-symbolic',
            tooltip_text: _('Move left'),
            css_classes: ['flat'],
        });
        this._downButton = new Gtk.Button({
            icon_name: 'go-down-symbolic',
            tooltip_text: _('Move right'),
            css_classes: ['flat'],
        });
        this._upButton.connect('clicked', () => this._page.moveWidget(this._type, -1));
        this._downButton.connect('clicked', () => this._page.moveWidget(this._type, 1));
        box.append(this._upButton);
        box.append(this._downButton);
        this.add_prefix(box);
    }

    _buildVisibility() {
        const s = this._settings;
        const t = this._type;

        const display = new Adw.SwitchRow({ title: _('Display') });
        s.bind(`${t}-display`, display, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.add_row(display);

        const showMenu = new Adw.SwitchRow({ title: _('Show in Menu') });
        s.bind(`${t}-show-menu`, showMenu, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.add_row(showMenu);

        const showText = new Adw.SwitchRow({ title: _('Show Text') });
        s.bind(`${t}-show-text`, showText, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.add_row(showText);
    }

    _buildAppearance() {
        const s = this._settings;
        const t = this._type;

        const styleLabels = [_('digit'), _('graph'), _('both')];
        const style = comboFromList(_('Display Style'), styleLabels,
            s.get_enum(`${t}-style`), index => s.set_enum(`${t}-style`, index));
        this._watch(`changed::${t}-style`, () => {
            style.selected = s.get_enum(`${t}-style`);
        });
        this.add_row(style);

        const graphWidth = this._spinRow(_('Graph Width'), _('Width in pixels of the graph'), 1, 1000, 1, 10);
        s.bind(`${t}-graph-width`, graphWidth, 'value', Gio.SettingsBindFlags.DEFAULT);
        this.add_row(graphWidth);

        const fontSize = this._spinRow(_('Font Size'), _('Font size in pt for value text'), 1, 72, 1, 5);
        fontSize.digits = 1;
        s.bind(`${t}-font-size`, fontSize, 'value', Gio.SettingsBindFlags.DEFAULT);
        this.add_row(fontSize);

        const refresh = this._spinRow(_('Refresh Time'), _('Milliseconds between two updates'), 1, 100000, 100, 1000);
        s.bind(`${t}-refresh-time`, refresh, 'value', Gio.SettingsBindFlags.DEFAULT);
        this.add_row(refresh);

        if (t === 'net') {
            const digitValue = this._spinRow(_('Digit Value Width'),
                _('Fixed width in pixels for digit mode, 0 = automatic'), 0, 200, 1, 10);
            s.bind('net-digit-value-width', digitValue, 'value', Gio.SettingsBindFlags.DEFAULT);
            this.add_row(digitValue);

            const digitUnit = this._spinRow(_('Digit Unit Width'),
                _('Fixed width in pixels for digit mode, 0 = automatic'), 0, 200, 1, 10);
            s.bind('net-digit-unit-width', digitUnit, 'value', Gio.SettingsBindFlags.DEFAULT);
            this.add_row(digitUnit);
        }
    }

    _spinRow(title, subtitle, lower, upper, step, page) {
        const row = new Adw.SpinRow({
            title,
            subtitle,
            adjustment: new Gtk.Adjustment({ lower, upper, step_increment: step, page_increment: page }),
        });
        row.set_numeric(true);
        return row;
    }

    _buildWidgetOptions() {
        const t = this._type;
        const s = this._settings;

        switch (t) {
            case 'cpu': {
                this._addColorsItem(['cpu-user-color', 'cpu-iowait-color', 'cpu-nice-color',
                    'cpu-system-color', 'cpu-other-color']);
                const individual = new Adw.SwitchRow({ title: _('Display Individual Cores') });
                s.bind('cpu-individual-cores', individual, 'active', Gio.SettingsBindFlags.DEFAULT);
                this.add_row(individual);
                break;
            }
            case 'freq': {
                this._addColorsItem(['freq-freq-color']);
                const mode = comboFromList(_('Value'),
                    [_('Max across all cores'), _('Average across all cores')],
                    s.get_enum('freq-display-mode'),
                    index => s.set_enum('freq-display-mode', index));
                this.add_row(mode);
                break;
            }
            case 'memory':
                this._addColorsItem(['memory-program-color', 'memory-buffer-color', 'memory-cache-color']);
                break;
            case 'swap':
                this._addColorsItem(['swap-used-color']);
                break;
            case 'net': {
                this._addColorsItem(['net-down-color', 'net-up-color', 'net-downerrors-color',
                    'net-uperrors-color', 'net-collisions-color']);
                const bits = new Adw.SwitchRow({ title: _('Show network speed in bits') });
                s.bind('net-speed-in-bits', bits, 'active', Gio.SettingsBindFlags.DEFAULT);
                this.add_row(bits);
                break;
            }
            case 'disk': {
                this._addColorsItem(['disk-read-color', 'disk-write-color']);
                const usage = comboFromList(_('Usage Style'), [_('pie'), _('bar'), _('none')],
                    s.get_enum('disk-usage-style'),
                    index => s.set_enum('disk-usage-style', index));
                this.add_row(usage);
                break;
            }
            case 'gpu':
                this._addColorsItem(['gpu-used-color', 'gpu-memory-color']);
                break;
            case 'thermal':
                this._buildSensorRows({
                    kind: 'temp',
                    sensorKey: 'thermal-sensor-label',
                    emptyText: _('No temperature sensors found'),
                    colors: ['thermal-tz0-color'],
                    menuKeyPrefix: 'thermal-menu-sensor-label-',
                    menuCount: 4,
                    menuTitle: _('Menu Sensor %d'),
                });
                this._addThermalExtras();
                break;
            case 'fan':
                this._buildSensorRows({
                    kind: 'fan',
                    sensorKey: 'fan-sensor-label',
                    emptyText: _('No fan sensors found'),
                    colors: ['fan-fan0-color'],
                    menuKeyPrefix: 'fan-menu-sensor-label-',
                    menuCount: 2,
                    menuTitle: _('Menu Fan %d'),
                });
                break;
            case 'battery': {
                this._addColorsItem(['battery-batt0-color']);
                const time = new Adw.SwitchRow({ title: _('Show Time Remaining') });
                s.bind('battery-time', time, 'active', Gio.SettingsBindFlags.DEFAULT);
                this.add_row(time);
                break;
            }
            default:
                break;
        }
    }

    // Sensor picker plus the optional menu sensors (shown in the info panel).
    _buildSensorRows({ kind, sensorKey, emptyText, colors, menuKeyPrefix, menuCount, menuTitle }) {
        const s = this._settings;
        this._addColorsItem(colors);

        const labels = Object.keys(check_sensors(kind));
        if (labels.length === 1)
            s.set_string(sensorKey, labels[0]);

        const sensor = comboFromList(_('Sensor:'),
            labels.length ? labels : [emptyText],
            labels.indexOf(s.get_string(sensorKey)),
            index => {
                if (labels[index] !== undefined)
                    s.set_string(sensorKey, labels[index]);
            });
        this.add_row(sensor);

        const none = _('(none)');
        for (let i = 1; i <= menuCount; i++) {
            const key = `${menuKeyPrefix}${i}`;
            const options = [none, ...labels];
            const current = s.get_string(key);
            const row = comboFromList(menuTitle.replace('%d', String(i)), options,
                current ? options.indexOf(current) : 0,
                index => s.set_string(key, index > 0 ? options[index] : ''));
            this.add_row(row);
        }
    }

    _addThermalExtras() {
        const s = this._settings;
        const threshold = new Adw.SpinRow({
            title: _('Temperature threshold (0 to disable)'),
            adjustment: new Gtk.Adjustment({ value: 0, lower: 0, upper: 300, step_increment: 5, page_increment: 10 }),
        });
        threshold.set_numeric(true);
        s.bind('thermal-threshold', threshold, 'value', Gio.SettingsBindFlags.DEFAULT);
        this.add_row(threshold);

        const fahrenheit = new Adw.SwitchRow({ title: _('Display temperature in Fahrenheit') });
        s.bind('thermal-fahrenheit-unit', fahrenheit, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.add_row(fahrenheit);
    }

    _addColorsItem(colors) {
        for (const key of colors) {
            const row = new Adw.ActionRow({ title: key.split('-')[1].capitalize() });
            const button = new Gtk.ColorDialogButton({ valign: Gtk.Align.CENTER, dialog: this._colorDialog });

            const rgba = new Gdk.RGBA();
            rgba.parse(this._settings.get_string(key));
            button.set_rgba(rgba);

            const notifyId = button.connect('notify::rgba',
                b => this._settings.set_string(key, color_to_hex(b.get_rgba())));
            const changedId = this._settings.connect(`changed::${key}`, () => {
                rgba.parse(this._settings.get_string(key));
                button.set_rgba(rgba);
            });
            button.connect('destroy', () => {
                button.disconnect(notifyId);
                this._settings.disconnect(changedId);
            });

            row.add_suffix(button);
            this.add_row(row);
        }
    }

    _updateSummary() {
        const shown = this._settings.get_boolean(`${this._type}-display`);
        const styleLabel = [_('digit'), _('graph'), _('both')][this._settings.get_enum(`${this._type}-style`)] ?? '';
        this.subtitle = `${shown ? _('Shown') : _('Hidden')} · ${styleLabel}`;
    }
});

// ** Widgets Page: order, visibility and appearance together **
const SMWidgetsPrefsPage = GObject.registerClass({
    GTypeName: 'SMWidgetsPrefsPage',
}, class SMWidgetsPrefsPage extends Adw.PreferencesPage {
    constructor(settings) {
        super({ title: _('Widgets'), icon_name: 'view-grid-symbolic', name: 'widgets_page' });
        this._settings = settings;
        this._colorDialog = new Gtk.ColorDialog({ modal: true, with_alpha: true });

        const group = new Adw.PreferencesGroup({
            title: _('Widgets'),
            description: _('Order the widgets with the arrows; they appear in the top bar from left to right.'),
        });
        this._list = new Gtk.ListBox({ selection_mode: Gtk.SelectionMode.NONE, css_classes: ['boxed-list'] });
        group.add(this._list);
        this.add(group);

        this._order = this._savedOrder();
        this._rows = new Map();
        for (const type of this._order) {
            const row = new SMWidgetRow(this, settings, type, this._colorDialog);
            this._rows.set(type, row);
            this._list.append(row);
        }
        this._refreshMoveButtons();
    }

    // Saved positions sorted into a full, gap-free order.
    _savedOrder() {
        return [...WIDGET_TYPES].sort((a, b) =>
            (this._settings.get_int(`${a}-position`) - this._settings.get_int(`${b}-position`)) ||
            (WIDGET_TYPES.indexOf(a) - WIDGET_TYPES.indexOf(b)));
    }

    moveWidget(type, delta) {
        const from = this._order.indexOf(type);
        const to = from + delta;
        if (from < 0 || to < 0 || to >= this._order.length)
            return;

        [this._order[from], this._order[to]] = [this._order[to], this._order[from]];

        const row = this._rows.get(type);
        this._list.remove(row);
        this._list.insert(row, to);

        this._order.forEach((widgetType, index) => {
            this._settings.set_int(`${widgetType}-position`, index);
        });
        this._refreshMoveButtons();
    }

    _refreshMoveButtons() {
        this._order.forEach((type, index) => {
            const row = this._rows.get(type);
            row._upButton.sensitive = index > 0;
            row._downButton.sensitive = index < this._order.length - 1;
        });
    }
});

// ** Extension Preferences **
export default class SystemMonitorExtensionPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        window.add(new SMGeneralPrefsPage(settings));
        window.add(new SMWidgetsPrefsPage(settings));

        window.set_title(_('System Monitor Next Preferences'));
        window.search_enabled = true;
        window.set_default_size(645, 745);
    }
}
