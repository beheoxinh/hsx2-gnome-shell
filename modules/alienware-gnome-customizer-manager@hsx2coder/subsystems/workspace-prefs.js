/**
 * Workspace Control preferences, folded into alienware-gnome-customizer-manager.
 *
 * The keys now live in the customizer schema, so this only builds pages and is
 * handed the host module's Gio.Settings.
 */

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

class WorkspaceSettings {
    static getTabDefs(s) {
        return [
            {title: 'Workspace', iconName: 'preferences-system-symbolic',   groups: [s.workspaceG]},
            {title: 'Behaviour', iconName: 'input-keyboard-symbolic',       groups: [s.behaviour]},
            {title: 'Appearance', iconName: 'avatar-default-symbolic',      groups: [s.appearance]},
        ];
    }

    constructor(schema) {
        this.schema = schema;

        // ── Workspace ──
        this.workspace = new Adw.SwitchRow({
            title: 'Workspace Switcher',
            subtitle: 'Show the workspace switcher in the overview.',
        });
        this.workspacePopup = new Adw.SwitchRow({
            title: 'Workspace Popup',
            subtitle: 'Show the workspace popup when switching workspaces.',
        });
        this.workspaceSwitcherSize = new Adw.SpinRow({
            title: 'Switcher Size',
            subtitle: 'Workspace switcher size in percent (0=default).',
            adjustment: new Gtk.Adjustment({lower: 0, upper: 30, step_increment: 1}),
        });
        this.alwaysShowSwitcher = new Adw.SwitchRow({
            title: 'Always Show Switcher',
            subtitle: 'Keep the workspace switcher visible at all times.',
        });
        this.workspaceWrap = new Adw.SwitchRow({
            title: 'Wrap Around',
            subtitle: 'Allow wrapping from last to first workspace.',
        });
        this.workspacePeek = new Adw.SwitchRow({
            title: 'Workspace Peek',
            subtitle: 'Show workspace preview when switching.',
        });
        this.workspacesInAppGrid = new Adw.SwitchRow({
            title: 'Workspaces in App Grid',
            subtitle: 'Show workspace thumbnails in the app grid.',
        });
        this.workspaceThumbnailToMain = new Adw.SwitchRow({
            title: 'Thumbnail Goes to Main View',
            subtitle: 'Clicking a workspace thumbnail always goes to the main overview view.',
        });
        this.workspaceG = new Adw.PreferencesGroup({title: 'Workspace', description: 'Switcher, popup, peek, wrapping, and thumbnail behaviour.'});

        // ── Behaviour ──
        this.overlayKey = new Adw.SwitchRow({
            title: 'Overlay Key',
            subtitle: 'Super key opens the overview.',
        });
        this.doubleSuper = new Adw.SwitchRow({
            title: 'Double Super to App Grid',
            subtitle: 'Press Super twice quickly to open the app grid.',
        });
        this.rippleBox = new Adw.SwitchRow({
            title: 'Ripple Box',
            subtitle: 'Show ripple animation on workspace/overlay elements.',
        });
        this.startupStatus = new Adw.SwitchRow({
            title: 'Start to Overview',
            subtitle: 'Start in the overview instead of the desktop (off=desktop, on=overview).',
        });
        this.controlsManagerSpacing = new Adw.SpinRow({
            title: 'Overview Spacing',
            subtitle: 'Spacing between elements in the overview (0=default).',
            adjustment: new Gtk.Adjustment({lower: 0, upper: 150, step_increment: 1}),
        });
        this.behaviour = new Adw.PreferencesGroup({title: 'Behaviour', description: 'Super key, app grid, ripple animation, startup mode, and overview spacing.'});

        // ── Appearance ──
        this.workspaceCornerSize = new Adw.SpinRow({
            title: 'Workspace Corner Radius',
            subtitle: 'Rounded corners on workspace backgrounds (0=default).',
            adjustment: new Gtk.Adjustment({lower: 0, upper: 61, step_increment: 1}),
        });
        this.appearance = new Adw.PreferencesGroup({title: 'Appearance', description: 'Visual styling for workspace thumbnails and backgrounds.'});

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
        this.schema.bind('startup-status', this.startupStatus, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('controls-manager-spacing-size', this.controlsManagerSpacing, 'value', Gio.SettingsBindFlags.DEFAULT);
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
