import Gio from 'gi://Gio';

export const SUITE_UUID = 'alienware-hsx2coder-gnome@hsx2coder.github.com';
export const SUITE_SCHEMA = 'org.gnome.shell.extensions.alienware-suite';

export const MODULES = [
    // GCM first — WC and TPC depend on its _api at startup
    {
        key: 'gnomeCustomizerManager',
        enableKey: 'enable-gnome-customizer-manager',
        title: 'Gnome Customizer Manager',
        iconName: 'applications-system-symbolic',
        uuid: 'alienware-gnome-customizer-manager@hsx2coder',
        entry: 'extension.js',
        prefsEntry: 'prefs.js',
        sessionMode: 'user',
        hasStylesheet: false,
    },
    {
        key: 'workspaceControl',
        enableKey: 'enable-workspace-control',
        title: 'Workspace Control',
        iconName: 'video-display-symbolic',
        uuid: 'alienware-workspace-control@hsx2coder',
        entry: 'extension.js',
        prefsEntry: 'prefs.js',
        sessionMode: 'user',
        hasStylesheet: false,
    },
    {
        key: 'topbarPanelControls',
        enableKey: 'enable-topbar-panel-controls',
        title: 'Topbar Panel Controls',
        iconName: 'video-display-symbolic',
        uuid: 'alienware-topbar-panel-controls@hsx2coder',
        entry: 'extension.js',
        prefsEntry: 'prefs.js',
        sessionMode: 'user',
        hasStylesheet: false,
    },
    {
        key: 'dashToPanel',
        enableKey: 'enable-dash-to-panel',
        title: 'Dash to Panel',
        iconName: 'view-app-grid-symbolic',
        uuid: 'alienware-dash-to-panel@hsx2coder',
        entry: 'extension.js',
        prefsEntry: 'prefs.js',
        sessionMode: 'user',
        hasStylesheet: true,
    },
    {
        key: 'systemMonitor',
        enableKey: 'enable-system-monitor',
        title: 'System Monitor',
        iconName: 'utilities-system-monitor-symbolic',
        uuid: 'alienware-monitor@hsx2coder',
        entry: 'extension.js',
        prefsEntry: 'prefs.js',
        sessionMode: 'user',
        hasStylesheet: true,
    },
    {
        key: 'topbarWidgets',
        enableKey: 'enable-topbar-widgets',
        title: 'Topbar Widgets',
        iconName: 'video-display-symbolic',
        uuid: 'alienware-topbar-widgets@hsx2coder',
        entry: 'extension.js',
        prefsEntry: 'prefs.js',
        sessionMode: 'user',
        hasStylesheet: true,
    },
    {
        key: 'indicators',
        enableKey: 'enable-indicators',
        title: 'Indicators',
        iconName: 'application-x-addon-symbolic',
        uuid: 'alienware-indicators@hsx2coder',
        entry: 'extension.js',
        prefsEntry: 'prefs.js',
        sessionMode: 'user',
        hasStylesheet: false,
    },
    {
        key: 'desktopIcons',
        enableKey: 'enable-desktop-icons',
        title: 'Desktop Icons NG',
        iconName: 'user-desktop-symbolic',
        uuid: 'alienware-desktop-enable-gnome@hsx2coder',
        entry: 'extension.js',
        prefsEntry: 'prefs.js',
        sessionMode: 'user',
        hasStylesheet: false,
    },
    {
        key: 'advancedAltTab',
        enableKey: 'enable-advanced-alt-tab',
        title: 'Window Switcher Control',
        iconName: 'view-dual-symbolic',
        uuid: 'alienware-advanced-alt-tab@hsx2coder',
        entry: 'extension.js',
        prefsEntry: 'prefs.js',
        sessionMode: 'user',
        hasStylesheet: true,
    },
    {
        key: 'notificationConfigurator',
        enableKey: 'enable-notification-configurator',
        title: 'Notification Configurator',
        iconName: 'preferences-system-notifications-symbolic',
        uuid: 'alienware-notification-configurator@hsx2coder',
        entry: 'extension.js',
        prefsEntry: 'prefs.js',
        sessionMode: 'user',
        hasStylesheet: false,
    },
];

export function buildSubMetadata(suiteExtension, moduleDef) {
    const moduleDir = suiteExtension.dir
        .get_child('modules')
        .get_child(moduleDef.uuid);
    const modulePath = moduleDir.get_path();

    const original = JSON.parse(_readText(moduleDir.get_child('metadata.json')));

    return {
        ...original,
        uuid: moduleDef.uuid,
        dir: moduleDir,
        path: modulePath,
        url: `file://${modulePath}/`,
    };
}

function _readText(file) {
    const [ok, bytes] = file.load_contents(null);
    if (!ok)
        throw new Error(`Cannot read ${file.get_path()}`);
    return new TextDecoder('utf-8').decode(bytes);
}

export function moduleEntryURL(suiteExtension, moduleDef, entryFile) {
    const file = suiteExtension.dir
        .get_child('modules')
        .get_child(moduleDef.uuid)
        .get_child(entryFile);
    return file.get_uri();
}
