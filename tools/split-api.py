#!/usr/bin/env python3
"""Generate the domain-split API classes and strip the moved methods out of the
original GCM API.js.

    python3 tools/split-api.py            # dry run, prints the plan
    python3 tools/split-api.py --write    # actually rewrite the files

The moved method bodies are copied VERBATIM, so behaviour is unchanged; only the
owning module changes. Field declarations the moved methods rely on are emitted
with `= undefined` where the original only assigned them lazily.
"""
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = 'modules/alienware-gnome-customizer-manager@hsx2coder/lib/API.js'

PANEL_OUT = 'modules/alienware-topbar@hsx2coder/subsystems/panel/api.js'
DASH_OUT = 'modules/alienware-dash-to-panel@hsx2coder/lib/api.js'
ALTTAB_OUT = 'modules/alienware-advanced-alt-tab@hsx2coder/lib/api.js'

PANEL_EXACT = {
    'panelSetDefaultSize', 'panelSetSize', 'panelGetSize', 'panelShow', 'panelHide',
    'isPanelVisible', 'panelSetPosition', 'panelGetPosition',
    'backgroundMenuEnable', 'backgroundMenuDisable',
    'searchEntryShow', 'searchEntryHide', 'startSearchEnable', 'startSearchDisable',
    'setMaxDisplayedSearchResultToDefault', 'setMaxDisplayedSearchResult',
    'activitiesButtonShow', 'activitiesButtonHide',
    'dateMenuShow', 'dateMenuHide',
    'keyboardLayoutShow', 'keyboardLayoutHide',
    'accessibilityMenuShow', 'accessibilityMenuHide',
    'quickSettingsMenuShow', 'quickSettingsMenuHide',
    'powerIconShow', 'powerIconHide',
    'panelNotificationIconEnable', 'panelNotificationIconDisable',
    'screenSharingIndicatorEnable', 'screenSharingIndicatorDisable',
    'screenRecordingIndicatorEnable', 'screenRecordingIndicatorDisable',
    'panelButtonHpaddingSetDefault', 'panelButtonHpaddingSizeSet',
    'panelIndicatorPaddingSetDefault', 'panelIndicatorPaddingSizeSet',
    'panelIconSetSize', 'panelIconSetDefaultSize',
    'showAppsButtonEnable', 'showAppsButtonDisable',
    'weatherShow', 'weatherHide', 'worldClocksShow', 'worldClocksHide',
    'eventsButtonShow', 'eventsButtonHide', 'calendarShow', 'calendarHide',
    'clockMenuPositionSetDefault', 'clockMenuPositionSet',
    'chromeAdd', 'chromeRemove',
    'UIStyleClassAdd', 'UIStyleClassRemove', 'UIStyleClassContain',
    'quickSettingsDarkStyleToggleShow', 'quickSettingsDarkStyleToggleHide',
    'quickSettingsNightLightToggleShow', 'quickSettingsNightLightToggleHide',
    'quickSettingsDoNotDisturbToggleShow', 'quickSettingsDoNotDisturbToggleHide',
    'quickSettingsBacklightToggleShow', 'quickSettingsBacklightToggleHide',
    'quickSettingsAirplaneModeToggleShow', 'quickSettingsAirplaneModeToggleHide',
    'accentColorIconEnable', 'accentColorIconDisable',
    'invertCalendarColumnItems',
}

DASH_EXACT = {
    'isDashVisible', 'dashShow', 'dashHide',
    'dashSeparatorShow', 'dashSeparatorHide',
    'dashIconSizeSet', 'dashIconSizeSetDefault',
}

ALT_TAB_EXACT = {
    'altTabIconSetSize', 'altTabIconSetDefaultSize',
    'altTabSmallIconSetSize', 'altTabSmallIconSetDefaultSize',
    'altTabWindowPreviewSetSize', 'altTabWindowPreviewSetDefaultSize',
    'windowPreviewCaptionEnable', 'windowPreviewCaptionDisable',
    'windowPreviewCloseButtonEnable', 'windowPreviewCloseButtonDisable',
    'switcherPopupDelaySetDefault', 'removeSwitcherPopupDelay',
}

PANEL_CONSTS = """const PANEL_POSITION = {
    TOP: 0,
    BOTTOM: 1,
};

const PANEL_BOX_POSITION = {
    CENTER: 0,
    RIGHT: 1,
    LEFT: 2,
};

const PANEL_HIDE_MODE = {
    ALL: 0,
    DESKTOP: 1,
};
"""

DASH_CONSTS = """const DASH_ICON_SIZES = [16, 22, 24, 32];
"""

ALTTAB_CONSTS = """const APP_ICON_SIZE = 64;
const WINDOW_PREVIEW_SIZE = 106;
"""

# dependency key -> instance field, matching the original API constructor
DEP_FIELD = {
    'Main': '_main', 'BackgroundMenu': '_backgroundMenu', 'Search': '_search',
    'SearchController': '_searchController', 'InterfaceSettings': '_interfaceSettings',
    'Panel': '_panel', 'PanelMenu': '_panelMenu', 'St': '_st', 'GLib': '_glib',
    'Clutter': '_clutter', 'Meta': '_meta', 'GObject': '_gobject',
    'OverviewControls': '_overviewControls', 'WindowPreview': '_windowPreview',
    'SwitcherPopup': '_switcherPopup',
}

PANEL_DEPS = ['Main', 'BackgroundMenu', 'Search', 'SearchController', 'InterfaceSettings',
              'Panel', 'PanelMenu', 'OverviewControls', 'St', 'GLib', 'Clutter', 'Meta',
              'GObject']
DASH_DEPS = ['Main', 'WindowPreview', 'St', 'Clutter', 'GLib']
ALTTAB_DEPS = ['Main', 'SwitcherPopup', 'St', 'Clutter', 'GLib']

PANEL_STATE = ['_panelSize', '_panelPosition', '_panelVisibility', '_panelHideMode',
               '_panelIconSize', '_panelButtonHpaddingSize', '_panelIndicatorPaddingSize',
               '_searchEntryVisibility', '_isCalendarColumnInverted',
               '_hidePanelHeightSignal', '_hidePanelWorkareasChangedSignal',
               '_workareasChangedSignal', '_panelHeightSignal',
               '_clockMenuPositionSignals', '_clocksItemShowSignal',
               '_backlightToggleShowSignal', '_rfkillToggleShowSignal']
DASH_STATE = ['_dashVisibility', '_dashSeparatorVisibility', '_dashIconSize']
ALTTAB_STATE = ['_altTabIconSize', '_altTabWindowPreviewSize', '_switcherPopupDelay']

HEADER = """/**
 * {title}
 *
 * Split out of alienware-gnome-customizer-manager@hsx2coder lib/API.js by
 * tools/split-api.py. Method bodies are verbatim copies: the only change is
 * that each domain now lives with the module that owns its GSettings keys.
 *
 * @license GPL-3.0-only
 */
"""


def parse(text):
    lines = text.splitlines(keepends=True)
    starts = []
    for i, l in enumerate(lines):
        m = re.match(r'^    ([A-Za-z_#]\w*)\s*\(', l)
        if m and i + 1 < len(lines) and lines[i + 1].strip() == '{':
            starts.append((i, m.group(1)))
    blocks = []
    for idx, (i, name) in enumerate(starts):
        end = starts[idx + 1][0] if idx + 1 < len(starts) else len(lines)
        start = i
        j = i - 1
        while j >= 0 and (lines[j].strip().startswith(('*', '/*', '*/')) or lines[j].strip() == ''):
            if lines[j].strip() == '' and i - j > 1:
                break
            start = j
            j -= 1
        blocks.append((name, start, end))
    return lines, blocks


def body_of(lines, blocks, name):
    for n, s, e in blocks:
        if n == name:
            return ''.join(lines[s:e])
    return ''


def render(cls_name, consts, deps, state, methods, title, privates='', lifecycle=''):
    out = [HEADER.format(title=title), consts, '\nexport class %s\n{\n' % cls_name]
    blob = ''.join(methods) + privates + lifecycle
    out.append('    #shellVersion = null;\n\n')
    if 'this.#originals' in blob:
        out.append('    #originals = {};\n\n')
    if 'this.#timeoutIds' in blob:
        out.append('    #timeoutIds = {};\n\n')
    for f in state:
        out.append('    %s = undefined;\n' % f)
    out.append('\n    constructor(dependencies)\n    {\n')
    for d in deps:
        out.append("        this.%s = dependencies['%s'] || null;\n" % (DEP_FIELD[d], d))
    out.append("        this._searchEntryVisibility = true;\n")
    out.append('    }\n\n')
    out.append(lifecycle.rstrip('\n') + '\n\n')
    out.append(privates.rstrip('\n') + '\n\n')
    for m in methods:
        out.append(m.rstrip('\n') + '\n\n')
    out.append('}\n')
    return ''.join(out)


# Symmetric open()/close() so every domain can undo exactly the shell patches
# its own methods install. Before the split a single close() did this for the
# whole engine, which is why the two class-wide restores could clobber each
# other.
PANEL_OPEN = """    open()
    {
        this.UIStyleClassAdd(this.#getAPIClassname('shell-version'));
    }

    close()
    {
        this.UIStyleClassRemove(this.#getAPIClassname('shell-version'));
        this.#startSearchSignal(false);
        this.#computeWorkspacesBoxForStateSetDefault();
        this.panelSetDefaultSize();
    }
"""

DASH_OPEN = """    open()
    {
        this.UIStyleClassAdd(this.#getAPIClassname('shell-version'));
    }

    close()
    {
        this.UIStyleClassRemove(this.#getAPIClassname('shell-version'));
        this.dashShow();
    }
"""

ALTTAB_OPEN = """    open()
    {
        this.UIStyleClassAdd(this.#getAPIClassname('shell-version'));
    }

    close()
    {
        this.UIStyleClassRemove(this.#getAPIClassname('shell-version'));
        this.#altTabSizesSetDefault();
    }
"""

SHARED_WSBOX_PANEL = """    #computeWorkspacesBoxForStateChanged()
    {
        if (!this._wsBoxPatch) {
            this._wsBoxPatch = {searchEntryVisible: this._searchEntryVisibility};
            this._wsBoxPatchOff = addWorkspacesBoxPatch(this._wsBoxPatch);
        }
        this._wsBoxPatch.searchEntryVisible = this._searchEntryVisibility;
    }

    #computeWorkspacesBoxForStateSetDefault()
    {
        this._wsBoxPatchOff?.();
        this._wsBoxPatchOff = null;
        this._wsBoxPatch = null;
    }
"""

SHARED_WSBOX_GCM = """    #computeWorkspacesBoxForStateChanged()
    {
        if (!this._wsBoxPatch) {
            this._wsBoxPatch = {appGridHeight: this._workspacesInAppGridHeight};
            this._wsBoxPatchOff = addWorkspacesBoxPatch(this._wsBoxPatch);
        }
        this._wsBoxPatch.appGridHeight = this._workspacesInAppGridHeight;
    }

    #computeWorkspacesBoxForStateSetDefault()
    {
        this._wsBoxPatchOff?.();
        this._wsBoxPatchOff = null;
        this._wsBoxPatch = null;
    }
"""


def swap_wsbox(body, replacement):
    """Replace the private _computeWorkspacesBoxForState patch pair with the
    shared refcounted patch in lib/workspacesBoxLayout.js."""
    i = body.find('    #computeWorkspacesBoxForStateChanged()')
    if i < 0:
        return body, False
    j = body.find('\n    /**', i)
    if j < 0:
        j = len(body)
    return body[:i] + replacement + body[j:], True


def drop_private(body, name):
    """Delete a private method plus the JSDoc block above it."""
    lines = body.splitlines(keepends=True)
    for i, l in enumerate(lines):
        if l.strip() == f'{name}()':
            st = i
            j = i - 1
            while j >= 0 and (lines[j].strip().startswith(('*', '/*', '*/')) or lines[j].strip() == ''):
                st = j
                j -= 1
            e = i
            while e < len(lines) and lines[e].rstrip() != '    }':
                e += 1
            del lines[st:e + 1]
            return ''.join(lines)
    print('WARN: private %s not found, nothing dropped' % name)
    return body


def drop_now_dead_public(body):
    """Remove public methods that only existed to feed moved private helpers."""
    for name in ('altTabSmallIconSetSize', 'altTabSmallIconSetDefaultSize'):
        body = drop_private(body, name)
    return body


def init_wsbox_fields(body):
    return body.replace(
        "        this._searchEntryVisibility = true;\n",
        "        this._searchEntryVisibility = true;\n"
        "        this._wsBoxPatch = null;\n"
        "        this._wsBoxPatchOff = null;\n", 1)


def auto_state(lines, spans, names, state, deps, privs=()):
    """Every this._field the moved bodies touch that the deps do not provide."""
    assigned = set(state) | {DEP_FIELD[d] for d in deps}
    used = set()
    for n in list(names) + list(privs):
        if n not in spans:
            continue
        s, e = spans[n]
        used |= set(re.findall(r'this\.(_[A-Za-z]\w*)\b', ''.join(lines[s:e])))
    return sorted(used - assigned)


def main():
    write = '--write' in sys.argv
    os.chdir(REPO)
    text = open(SRC, encoding='utf-8').read()
    lines, blocks = parse(text)
    names = {n for n, _, _ in blocks}

    unknown = (PANEL_EXACT | DASH_EXACT | ALT_TAB_EXACT) - names
    if unknown:
        print('ERROR: these names do not exist in API.js:')
        for n in sorted(unknown):
            print('   ', n)
        return 2

    spans = {n: (s, e) for n, s, e in blocks}

    def ordered(exact):
        return [body_of(lines, blocks, n)
                for n in sorted(exact, key=lambda x: next(b[1] for b in blocks if b[0] == x))]

    # private members the moved bodies reference. The only one is a pure helper
    # that must travel with the code that calls it.
    MOVED_PRIVATE = {
        'panel': ['#addToAnimationDuration', '#changeDateMenuIndicatorIconSize',
                  '#computeWorkspacesBoxForStateChanged',
                  '#disconnectClockMenuPositionSignals', '#emitRefreshStyles',
                  '#fixPanelMenuSide', '#getAPIClassname',
                  '#onQuickSettingsPropertyCall', '#startSearchSignal'],
        'dash': ['#getAPIClassname', '#updateWindowPreviewOverlap'],
        'alttab': ['#altTabSizesSet', '#altTabSizesSetDefault', '#getAPIClassname',
                   '#windowPreviewGetPrototype'],
    }
    src_of = lambda S: ''.join(ordered(S))
    known = {k: set(v) for k, v in MOVED_PRIVATE.items()}
    used = {
        'panel': set(re.findall(r'this\.(#\w+)\b', src_of(PANEL_EXACT))),
        'dash': set(re.findall(r'this\.(#\w+)\b', src_of(DASH_EXACT))),
        'alttab': set(re.findall(r'this\.(#\w+)\b', src_of(ALT_TAB_EXACT))),
    }
    # class-level private fields are re-declared by render(), not moved as code
    FIELDS = {'#originals', '#timeoutIds', '#shellVersion'}
    bad = False
    for bucket, used_names in used.items():
        for p in sorted(used_names - known[bucket] - FIELDS):
            print(f'ERROR: {bucket} code uses private member {p}; split is not verbatim-safe')
            bad = True
    # a helper may also need another helper; close the set transitively
    for bucket, known_names in known.items():
        src = src_of({'panel': PANEL_EXACT, 'dash': DASH_EXACT, 'alttab': ALT_TAB_EXACT}[bucket])
        changed = True
        while changed:
            changed = False
            for p in list(known_names):
                extra = set(re.findall(r'this\.(#\w+)\b', body_of(lines, blocks, p)))
                if extra - known_names:
                    known_names |= extra
                    changed = True
    if bad:
        return 2
    priv_src = {k: ''.join(body_of(lines, blocks, p) for p in v) for k, v in known.items()}

    panel_state = PANEL_STATE + auto_state(lines, spans, PANEL_EXACT, PANEL_STATE, PANEL_DEPS, known['panel'])
    dash_state = DASH_STATE + auto_state(lines, spans, DASH_EXACT, DASH_STATE, DASH_DEPS, known['dash'])
    alttab_state = ALTTAB_STATE + auto_state(lines, spans, ALT_TAB_EXACT, ALTTAB_STATE, ALTTAB_DEPS, known['alttab'])
    print('auto state fields: panel=%d dash=%d alttab=%d' % (
        len(panel_state), len(dash_state), len(alttab_state)))
    panel_src = render('PanelApi', PANEL_CONSTS, PANEL_DEPS, panel_state,
                       ordered(PANEL_EXACT), 'Panel API: top bar geometry, clock, panel items.',
                       priv_src['panel'], PANEL_OPEN)
    dash_src = render('DashApi', DASH_CONSTS, DASH_DEPS, dash_state,
                      ordered(DASH_EXACT), 'Dash API: dash-to-panel visibility and sizing.',
                      priv_src['dash'], DASH_OPEN)
    alttab_src = render('AltTabApi', ALTTAB_CONSTS, ALTTAB_DEPS, alttab_state,
                        ordered(ALT_TAB_EXACT), 'Alt-tab API: switcher icon and preview sizing.',
                        priv_src['alttab'], ALTTAB_OPEN)

    if not write:
        moved = len(PANEL_EXACT | DASH_EXACT | ALT_TAB_EXACT)
        public = len([n for n in names if not n.startswith('#')])
        print('DRYRUN panel=%d dash=%d alttab=%d helpers=%d public_total=%d stays=%d' % (
            len(PANEL_EXACT), len(DASH_EXACT), len(ALT_TAB_EXACT),
            len(set().union(*MOVED_PRIVATE.values())), public, public - moved))
        return 0

    # both classes patched the same shell function independently; route them
    # through the refcounted shared patch instead
    panel_src, ok1 = swap_wsbox(panel_src, SHARED_WSBOX_PANEL)
    panel_src = init_wsbox_fields(panel_src)
    gcm_src, ok2 = swap_wsbox(text, SHARED_WSBOX_GCM)
    gcm_src = init_wsbox_fields(gcm_src)
    # alt-tab and quick-settings internals no longer belong to the customizer
    for gone in ('#altTabSizesSet', '#altTabSizesSetDefault', '#stopAllOnQuickSettingsPropertyCalls'):
        gcm_src = drop_private(gcm_src, gone)
    gcm_src = gcm_src.replace('        this.#altTabSizesSetDefault();\n', '')
    gcm_src = gcm_src.replace('        this.#stopAllOnQuickSettingsPropertyCalls();\n', '')
    gcm_src = drop_now_dead_public(gcm_src)
    panel_src = drop_private(panel_src, '#isWorkspacesInAppGridEnabled')
    print('workspacesBox patch shared: panel=%s gcm=%s' % (ok1, ok2))

    for path, body in ((PANEL_OUT, panel_src), (DASH_OUT, dash_src), (ALTTAB_OUT, alttab_src), (SRC, gcm_src)):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'w', encoding='utf-8') as fh:
            fh.write(body)
        print('wrote', path)

    # strip moved methods (and the JSDoc above them) from the original
    # a private helper is only STRIPPED from the original when no kept method
    # still needs it; shared helpers are copied into the new class and stay.
    moved_public = PANEL_EXACT | DASH_EXACT | ALT_TAB_EXACT
    kept_src = ''.join(body_of(lines, blocks, n) for n, _, _ in blocks
                       if n not in moved_public and not n.startswith('#'))
    strip_privates = {p for names in MOVED_PRIVATE.values() for p in names
                      if not re.search(r'this\.' + re.escape(p) + r'\b', kept_src)}
    print('private helpers stripped from original:', len(strip_privates),
          '| kept because the remaining API.js still calls them:',
          len(set().union(*MOVED_PRIVATE.values()) - strip_privates))
    drop = moved_public | strip_privates
    out = []
    skip = set()
    for n, s, e in blocks:
        if n in drop:
            skip.update(range(s, e))
    for i, l in enumerate(lines):
        if i not in skip:
            out.append(l)
    open(SRC, 'w', encoding='utf-8').write(''.join(out))
    print('stripped', len(drop), 'methods from', SRC)
    return 0


if __name__ == '__main__':
    sys.exit(main())
