/**
 * Workspace Control preferences, folded into alienware-gnome-customizer-manager.
 *
 * The keys now live in the customizer schema, so this only builds pages and is
 * handed the host module's Gio.Settings.
 */

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

class WorkspaceSettings {
    static getTabDefs(s) {
        return [
            {title: _('Workspace'), iconName: 'preferences-system-symbolic',   groups: [s.workspaceG]},
            {title: _('Behaviour'), iconName: 'input-keyboard-symbolic',       groups: [s.behaviour]},
            {title: _('Appearance'), iconName: 'applications-graphics-symbolic',      groups: [s.appearance]},
        ];
    }

    constructor(schema) {
        this.schema = schema;

        // ── Workspace ──
        this.workspace = new Adw.SwitchRow({
            title: _('Workspace Switcher'),
            subtitle: _('Show the workspace switcher in the overview.'),
        });
        this.workspacePopup = new Adw.SwitchRow({
            title: _('Workspace Popup'),
            subtitle: _('Show the workspace popup when switching workspaces.'),
        });
        this.workspaceSwitcherSize = new Adw.SpinRow({
            title: _('Switcher Size'),
            subtitle: _('Workspace switcher size in percent (0=default).'),
            adjustment: new Gtk.Adjustment({lower: 0, upper: 30, step_increment: 1}),
        });
        this.alwaysShowSwitcher = new Adw.SwitchRow({
            title: _('Always Show Switcher'),
            subtitle: _('Keep the workspace switcher visible at all times.'),
        });
        this.workspaceWrap = new Adw.SwitchRow({
            title: _('Wrap Around'),
            subtitle: _('Allow wrapping from last to first workspace.'),
        });
        this.workspacePeek = new Adw.SwitchRow({
            title: _('Workspace Peek'),
            subtitle: _('Show workspace preview when switching.'),
        });
        this.workspacesInAppGrid = new Adw.SwitchRow({
            title: _('Workspaces in App Grid'),
            subtitle: _('Show workspace thumbnails in the app grid.'),
        });
        this.workspaceThumbnailToMain = new Adw.SwitchRow({
            title: _('Thumbnail Goes to Main View'),
            subtitle: _('Clicking a workspace thumbnail always goes to the main overview view.'),
        });
        this.workspaceG = new Adw.PreferencesGroup({title: _('Workspace'), description: 'Switcher, popup, peek, wrapping, and thumbnail behaviour.'});

        // ── Behaviour ──
        this.overlayKey = new Adw.SwitchRow({
            title: _('Overlay Key'),
            subtitle: _('Super key opens the overview.'),
        });
        this.doubleSuper = new Adw.SwitchRow({
            title: _('Double Super to App Grid'),
            subtitle: _('Press Super twice quickly to open the app grid.'),
        });
        this.rippleBox = new Adw.SwitchRow({
            title: _('Ripple Box'),
            subtitle: _('Show ripple animation on workspace/overlay elements.'),
        });
        this.startupStatus = new Adw.ComboRow({
            title: _('Startup Status'),
            subtitle: _('Default workspace state after login.'),
            model: this.#strList(['Default', 'Empty Workspace', 'Windows']),
        });
        this.controlsManagerSpacing = new Adw.SpinRow({
            title: _('Overview Spacing'),
            subtitle: _('Spacing between elements in the overview (0=default).'),
            adjustment: new Gtk.Adjustment({lower: 0, upper: 150, step_increment: 1}),
        });
        this.behaviour = new Adw.PreferencesGroup({title: _('Behaviour'), description: 'Super key, app grid, ripple animation, startup mode, and overview spacing.'});

        // ── Appearance ──
        this.workspaceCornerSize = new Adw.SpinRow({
            title: _('Workspace Corner Radius'),
            subtitle: _('Rounded corners on workspace backgrounds (0=default).'),
            adjustment: new Gtk.Adjustment({lower: 0, upper: 61, step_increment: 1}),
        });
        this.appearance = new Adw.PreferencesGroup({title: _('Appearance'), description: 'Visual styling for workspace thumbnails and backgrounds.'});

        // ── Assemble ──
        for (const w of [
            this.workspace, this.workspacePopup, this.workspaceSwitcherSize,
            this.alwaysShowSwitcher, this.workspaceWrap, this.workspacePeek,
            this.workspacesInAppGrid, this.workspaceThumbnailToMain,
        ]) this.workspaceG.add(w);

        for (const w of [
            this.overlayKey, this.doubleSuper, this.rippleBox,
            this.startupStatus, this.controlsManagerSpacing,
        ]) this.behaviour.add(w);

        this.appearance.add(this.workspaceCornerSize);

        // ── Bind ──
        this.schema.bind('workspace', this.workspace, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('workspace-popup', this.workspacePopup, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('workspace-switcher-size', this.workspaceSwitcherSize, 'value', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('workspace-switcher-should-show', this.alwaysShowSwitcher, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('workspace-wrap-around', this.workspaceWrap, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('workspace-peek', this.workspacePeek, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('workspaces-in-app-grid', this.workspacesInAppGrid, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('workspace-background-corner-size', this.workspaceCornerSize, 'value', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('workspace-thumbnail-to-main-view', this.workspaceThumbnailToMain, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('overlay-key', this.overlayKey, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('double-super-to-appgrid', this.doubleSuper, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('ripple-box', this.rippleBox, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('startup-status', this.startupStatus, 'selected', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('controls-manager-spacing-size', this.controlsManagerSpacing, 'value', Gio.SettingsBindFlags.DEFAULT);
    }

    #strList(items) {
        const store = new Gtk.StringList();
        items.forEach(i => store.append(i));
        return store;
    }
}

export function addWorkspaceControlPages(window, settings) {
    const s = new WorkspaceSettings(settings);
    window._settingsRef = s;
    for (const {title, iconName, groups} of WorkspaceSettings.getTabDefs(s)) {
        const page = new Adw.PreferencesPage({title, icon_name: iconName});
        groups.forEach(g => page.add(g));
        window.add(page);
    }
}
