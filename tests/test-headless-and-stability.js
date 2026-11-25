import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {isHeadlessSession} from '../lib/headless.js';

function readText(relPath) {
    const file = Gio.File.new_for_path(`${GLib.get_current_dir()}/${relPath}`);
    const [, bytes] = file.load_contents(null);
    return new TextDecoder().decode(bytes);
}

export function run({assert}) {
    const cases = [];

    cases.push([
        'isHeadlessSession dynamically switches between Meta-* RDP and physical monitors',
        () => {
            const hadGlobal = Object.hasOwn(globalThis, 'global');
            const prevGlobal = globalThis.global;
            let connectors = ['Meta-0'];

            globalThis.global = {
                backend: {
                    get_monitor_manager: () => ({
                        get_monitors: () => connectors.map(c => ({get_connector: () => c})),
                    }),
                },
            };

            try {
                assert(isHeadlessSession() === true, 'Meta-0 alone should be headless');
                connectors = ['HDMI-1'];
                assert(isHeadlessSession() === false, 'HDMI-1 should immediately switch to non-headless');
                connectors = ['Meta-0'];
                assert(isHeadlessSession() === true, 'switching back to Meta-0 should be headless again');
            } finally {
                if (hadGlobal)
                    globalThis.global = prevGlobal;
                else
                    delete globalThis.global;
            }
        },
    ]);

    cases.push([
        'DING fileItemMenu uses let chooser and destroys dialog on response',
        () => {
            const src = readText('modules/alienware-desktop-enable-gnome@hsx2coder/app/fileItemMenu.js');
            assert(src.includes('let chooser = Gtk.AppChooserDialog.new_for_content_type('),
                'chooser must be declared with let');
            assert(src.includes('chooser.destroy();'),
                'chooser dialog must be destroyed on response');
        },
    ]);

    cases.push([
        'PanelManager preserves _desktopIconsUsableArea across reset()',
        () => {
            const src = readText('modules/alienware-dash-to-panel@hsx2coder/panelManager.js');
            const disableIdx = src.indexOf('disable(reset) {');
            const resetReturnIdx = src.indexOf('if (reset) return', disableIdx);
            const destroyUsableIdx = src.indexOf('this._desktopIconsUsableArea?.destroy()', disableIdx);
            assert(disableIdx >= 0 && resetReturnIdx > disableIdx, 'disable(reset) must have early reset return');
            assert(destroyUsableIdx > resetReturnIdx,
                '_desktopIconsUsableArea.destroy() must run only after if (reset) return');
        },
    ]);

    cases.push([
        'stylesheets do not use comma-separated box-shadow unsupported by St',
        () => {
            for (const cssPath of [
                'stylesheet.css',
                'modules/alienware-topbar@hsx2coder/stylesheet.css',
                'modules/alienware-dash-to-panel@hsx2coder/stylesheet.css',
                'modules/alienware-advanced-alt-tab@hsx2coder/stylesheet.css',
            ]) {
                const css = readText(cssPath);
                const multiShadow = /box-shadow\s*:[^;{}]*rgba?\([^)]*\)\s*,/;
                assert(!multiShadow.test(css), `${cssPath} must not contain comma-separated box-shadow`);
            }
        },
    ]);

    return cases;
}
