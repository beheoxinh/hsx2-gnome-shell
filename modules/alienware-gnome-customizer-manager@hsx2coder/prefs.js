import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {SplitPreferencesView} from '../../lib/ui/splitPrefsView.js';

import NotificationConfiguratorPreferences from './subsystems/notification-configurator/prefs.js';
import {buildShellThemeGroup} from './subsystems/user-shell-theme/theme-prefs.js';
import {buildClockPage, buildQuickSettingsPage} from './subsystems/panel-menus/prefs.js';

const FLAGS = Gio.SettingsBindFlags.DEFAULT;

export default class GnomeCustomizerManagerPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        // Set up subpage push/pop shim so subpages (e.g. Pattern Details) open in a modal dialog
        let currentSubWindow = null;
        window.push_subpage = (navPage) => {
            const rootWin = (window && typeof window.get_root === 'function') ? window.get_root() : (window instanceof Gtk.Window ? window : null);
            currentSubWindow = new Adw.PreferencesWindow({
                transient_for: rootWin,
                modal: true,
                title: navPage.title || 'Details',
                default_width: 700,
                default_height: 650,
            });
            const child = navPage.get_child();
            navPage.set_child(null);
            if (child instanceof Adw.ToolbarView) {
                const page = child.get_content();
                child.set_content(null);
                if (page instanceof Adw.PreferencesPage) {
                    currentSubWindow.add(page);
                } else {
                    currentSubWindow.set_content(child);
                }
            } else {
                currentSubWindow.set_content(child);
            }
            currentSubWindow.connect('close-request', () => {
                try {
                    navPage.emit('hidden');
                } catch (_) {}
                return false;
            });
            currentSubWindow.present();
        };
        window.pop_subpage = () => {
            if (currentSubWindow) {
                currentSubWindow.close();
                currentSubWindow = null;
            }
        };

        // one declarative table per page, so a row can never be shown without
        // a key behind it (the old Windows page had two unbound switches)
        const settings = this.getSettings();
        const sections = [];
        for (const def of PAGES) {
            sections.push({
                id: def.id,
                title: _(def.title),
                iconName: def.icon,
                // buildShellThemeGroup takes the module path (string), not a Gio.File
                buildContent: () => buildPage(settings, def, this.path),
            });
        }

        // GNOME's own top bar menus (moved from the Topbar module)
        sections.push({
            id: 'clock-calendar',
            title: _('Clock & Calendar'),
            iconName: 'preferences-system-time-symbolic',
            buildContent: () => buildClockPage(settings, this.dir),
        });
        sections.push({
            id: 'quick-settings',
            title: _('Quick Settings'),
            iconName: 'preferences-system-network-symbolic',
            buildContent: () => buildQuickSettingsPage(settings),
        });

        // Add Notification section to left sidebar with 2 sub-tabs (Global and Patterns)
        sections.push({
            id: 'notifications',
            title: _('Notifications'),
            iconName: 'preferences-system-notifications-symbolic',
            buildContent: () => {
                const notifMeta = {
                    uuid: this.uuid,
                    dir: this.dir,
                    path: this.path,
                    metadata: this.metadata,
                    'settings-schema': 'org.gnome.shell.extensions.notification-configurator',
                };
                const notifPrefs = new NotificationConfiguratorPreferences(notifMeta);
                if (!notifPrefs.gettext) {
                    notifPrefs.gettext = str => this.gettext ? this.gettext(str) : str;
                    notifPrefs.ngettext = (str, p, n) => this.ngettext ? this.ngettext(str, p, n) : (n === 1 ? str : p);
                }

                notifPrefs.settings = this.getSettings('org.gnome.shell.extensions.notification-configurator');
                notifPrefs.loadData();

                const globalPage = new Adw.PreferencesPage({
                    title: _('Global'),
                    icon_name: 'preferences-system-symbolic',
                });
                notifPrefs.buildGlobalPage(globalPage);

                const patternsPage = new Adw.PreferencesPage({
                    title: _('Patterns'),
                    icon_name: 'view-list-symbolic',
                });
                notifPrefs.buildPatternsPage(window, patternsPage);

                const stack = new Adw.ViewStack();
                stack.add_titled_with_icon(globalPage, 'notif_global', 'Global', 'preferences-system-symbolic');
                stack.add_titled_with_icon(patternsPage, 'notif_patterns', 'Patterns', 'view-list-symbolic');

                const switcher = new Adw.ViewSwitcher({
                    stack,
                    policy: Adw.ViewSwitcherPolicy.WIDE,
                });

                const box = new Gtk.Box({
                    orientation: Gtk.Orientation.VERTICAL,
                    spacing: 12,
                });
                box.append(switcher);
                box.append(stack);
                return box;
            },
        });

        const split = new SplitPreferencesView({
            title: _('Gnome Customizer Manager'),
            sections,
        });
        split.attachToWindow(window);
        window.set_default_size(1000, 750);
    }
}


const ANIMATION_CHOICES = ['Off', 'GNOME default', 'Almost none', 'Fastest', 'Faster',
    'Fast', 'Slow', 'Slower', 'Slowest'];
const OSD_POSITIONS = ['GNOME default', 'Top left', 'Top center', 'Top right',
    'Bottom left', 'Bottom center', 'Bottom right', 'Center left', 'Center', 'Center right'];

/**
 * [key, title, subtitle, kind]; kind is 'b', 'spin:<min>:<max>' or
 * 'combo:<choices>' (index stored in an int key). `special` groups are built
 * by code instead (the shell theme picker reads another schema).
 */
const PAGES = [
    {
        id: 'appearance', title: 'Appearance', icon: 'applications-graphics-symbolic',
        groups: [
            {special: 'shell-theme'},
            {
                title: 'Style',
                rows: [
                    ['theme', 'Flat popup style', 'Flat look for the OSD, Alt+Tab, the workspace popup and window snapping previews', 'b'],
                    ['ripple-box', 'Hot corner ripple', 'Ripple drawn when the top-left hot corner fires', 'b'],
                ],
            },
            {
                title: 'Animation',
                rows: [
                    ['animation', 'Animation speed', 'Off lasts for this session only; the system "Animations" setting is not changed', 'combo:animation'],
                ],
            },
        ],
    },
    {
        id: 'windows', title: 'Windows', icon: 'window-duplicate-symbolic',
        groups: [
            {
                title: 'Behaviour',
                rows: [
                    ['window-demands-attention-focus', 'Focus windows that ask for attention', 'Bring the window forward instead of showing a "is ready" notification', 'b'],
                    ['window-maximized-on-create', 'Open new windows maximized', null, 'b'],
                    ['fullscreen-unredirect', 'Unredirect fullscreen windows', 'GNOME default. Turn off if fullscreen apps flicker or tear, or if the OSD and notifications do not show over them', 'b'],
                ],
            },
            {
                title: 'Window menu',
                rows: [
                    ['window-menu', 'Window menu', 'Right-click on the title bar and Alt+Space', 'b'],
                    ['window-menu-take-screenshot-button', 'Take Screenshot entry', null, 'b'],
                ],
            },
        ],
    },
    {
        id: 'overview', title: 'Overview & Workspaces', icon: 'view-grid-symbolic',
        groups: [
            {
                title: 'Overview',
                rows: [
                    ['startup-status', 'After login show', 'Dash to Panel has its own "hide overview on startup"; use only one of them', 'combo:Desktop|Overview (GNOME default)'],
                    ['window-picker-icon', 'App icon on window previews', null, 'b'],
                    ['controls-manager-spacing-size', 'Overview spacing', 'Pixels between the overview\'s parts (0 = default)', 'spin:0:150'],
                    ['workspaces-in-app-grid', 'Workspaces above the app grid', null, 'b'],
                ],
            },
            {
                title: 'Workspace switcher (thumbnails)',
                rows: [
                    ['workspace', 'Show the workspace switcher', null, 'b'],
                    ['workspace-switcher-should-show', 'Always show it', 'Even with a single workspace', 'b'],
                    ['workspace-switcher-size', 'Size', 'Percent of the screen (0 = default)', 'spin:0:30'],
                    ['workspace-thumbnail-to-main-view', 'Clicking a thumbnail leaves the overview', null, 'b'],
                ],
            },
            {
                title: 'Workspaces',
                rows: [
                    ['workspace-popup', 'Popup when switching workspace', null, 'b'],
                    ['workspace-wrap-around', 'Wrap around', 'Going past the last workspace returns to the first', 'b'],
                    ['workspace-peek', 'Peek at neighbouring workspaces', 'Edges of the next and previous workspace in the overview', 'b'],
                    ['workspace-background-corner-size', 'Workspace corner radius', '0 = default, 1 = square, 2 and up = radius + 1 px', 'spin:0:61'],
                ],
            },
            {
                title: 'Super key',
                rows: [
                    ['overlay-key', 'Super opens the overview', null, 'b'],
                    ['double-super-to-appgrid', 'Press Super twice for the app grid', null, 'b', 'overlay-key'],
                ],
            },
        ],
    },
    {
        id: 'osd', title: 'On-Screen Display', icon: 'video-display-symbolic',
        groups: [
            {
                title: 'Volume and brightness popups',
                rows: [
                    ['osd', 'Show the OSD', null, 'b'],
                    ['osd-position', 'Position', null, 'combo:osd', 'osd'],
                ],
            },
        ],
    },
    {
        id: 'screenshot', title: 'Screenshot', icon: 'camera-photo-symbolic',
        groups: [
            {
                title: 'Area selection',
                rows: [
                    ['remove-preselected-box', 'Start without a preselected area', null, 'b'],
                    ['screenshot-on-release', 'Capture on mouse release', 'Take the shot as soon as the area is drawn', 'b'],
                ],
            },
        ],
    },
];

function stringList(items) {
    const list = new Gtk.StringList();
    for (const item of items)
        list.append(_(item));
    return list;
}

function makeRow(title, subtitle, kind) {
    const props = {title: _(title), subtitle: subtitle ? _(subtitle) : ''};
    if (kind === 'b')
        return [new Adw.SwitchRow(props), 'active'];
    if (kind.startsWith('spin:')) {
        const [, lower, upper] = kind.split(':').map(Number);
        props.adjustment = new Gtk.Adjustment({lower, upper, step_increment: 1, page_increment: 10});
        return [new Adw.SpinRow(props), 'value'];
    }
    const name = kind.slice('combo:'.length);
    const choices = name === 'animation' ? ANIMATION_CHOICES
        : name === 'osd' ? OSD_POSITIONS : name.split('|');
    return [new Adw.ComboRow({...props, model: stringList(choices)}), 'selected'];
}

function buildPage(settings, def, moduleDir) {
    const page = new Adw.PreferencesPage({title: _(def.title), icon_name: def.icon});
    for (const group of def.groups) {
        if (group.special === 'shell-theme') {
            try {
                const themeGroup = buildShellThemeGroup(moduleDir);
                if (themeGroup)
                    page.add(themeGroup);
            } catch (e) {
                logError(e, 'GCM shell theme prefs failed');
            }
            continue;
        }
        const pg = new Adw.PreferencesGroup({title: _(group.title)});
        for (const [key, title, subtitle, kind, dependsOn] of group.rows) {
            const [row, prop] = makeRow(title, subtitle, kind);
            settings.bind(key, row, prop, FLAGS);
            if (dependsOn)
                settings.bind(dependsOn, row, 'sensitive', Gio.SettingsBindFlags.GET);
            pg.add(row);
        }
        page.add(pg);
    }
    return page;
}
