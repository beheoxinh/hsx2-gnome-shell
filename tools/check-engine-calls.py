#!/usr/bin/env python3
"""Every this.x() call inside one of the four engine classes must resolve.

The 3700-line shell-tweak engine was split into PanelApi / DashApi / AltTabApi /
API by moving method bodies verbatim. Verbatim moves break when a body references
a helper that stayed behind, and the damage is invisible: a TypeError thrown
inside a try/catch means the feature silently never applies. Eight such methods
went missing that way.

Scoped to the four engine classes on purpose. A general version cannot work:
`this` inside a function assigned to a shell prototype is the *patched* object,
not the JS class, so a name like `_initOld` or `showOld` legitimately belongs to
another object and cannot be resolved from the source. GObject/Clutter actor
methods (`add_child`, `connect`, `destroy`) are the same problem.
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

CLASSES = [
    'modules/alienware-topbar@hsx2coder/subsystems/panel/api.js',
    'modules/alienware-advanced-alt-tab@hsx2coder/lib/api.js',
    'modules/alienware-dash-to-panel@hsx2coder/lib/api.js',
    'modules/alienware-gnome-customizer-manager@hsx2coder/lib/API.js',
]

# GObject/Clutter/St methods reached on an actor that happens to be `this`
ACTOR = {
    'add', 'addAction', 'add_actor', 'add_child', 'add_style_class_name',
    'add_style_pseudo_class', 'ancestor', 'bind_property', 'clear', 'close',
    'connect', 'connectObject', 'destroy', 'disconnect', 'disconnectAll',
    'disconnectObject', 'emit', 'get', 'get_accessible_name', 'get_allocated_width',
    'get_children', 'get_clutter_text', 'get_hover', 'get_index', 'get_n_children',
    'get_parent', 'get_position', 'get_stage', 'get_style', 'get_theme_node',
    'get_transformed_position', 'get_visible', 'grab_key_focus', 'hide',
    'insert_child_at_index', 'notify', 'queue_draw', 'queue_relayout',
    'remove', 'remove_all', 'remove_child', 'remove_style_class_name',
    'set', 'set_accessible_name', 'set_allocation', 'set_cached_property',
    'set_child', 'set_easing_duration', 'set_height', 'set_offscreen_redirect',
    'set_pivot_point', 'set_position', 'set_size', 'set_style', 'set_width',
    'set_x', 'set_x_align', 'set_y', 'set_y_align', 'show', 'show_all',
    'toString', 'valueOf',
}

# `this` inside a function assigned to a shell prototype, or a shell object that
# happens to be the receiver (MetaWorkspaceInfo.index)
PROTO_BORROWED = {
    'showOld', 'overlapHeightsOld', '_initOld', '_oldShow', '_oldBuildMenu',
    'index',
}

problems = []
for path in CLASSES:
    if not os.path.isfile(path):
        problems.append(f'{path} is missing')
        continue
    src = open(path, encoding='utf-8').read()
    defined = set(re.findall(
        r'^    (?:static\s+|get\s+|set\s+|async\s+)*([A-Za-z]\w*)\s*\(', src, re.M))
    defined |= set(re.findall(r'^    (#\w+)\s*\(', src, re.M))
    called = set(re.findall(r'this\.([A-Za-z]\w*)\s*\(', src))
    called |= set(re.findall(r'this\.(#\w+)\s*\(', src))

    for name in sorted(called - defined):
        if name.startswith('_') or name in ACTOR or name in PROTO_BORROWED:
            continue
        if re.search(r'this\.' + re.escape(name) + r'\s*=', src):
            continue
        line = src[:src.index(f'this.{name}(')].count('\n') + 1
        problems.append(f'{path}:{line}: this.{name}() is not defined in this class')

# consumers: the instance each module holds must expose what it calls
CONSUMERS = [
    ('modules/alienware-advanced-alt-tab@hsx2coder/extension.js', 'lib/api.js', r'this\.#api\.(\w+)\('),
    ('modules/alienware-dash-to-panel@hsx2coder/extension.js', 'lib/api.js', r'this\.#api\.(\w+)\('),
    ('modules/alienware-gnome-customizer-manager@hsx2coder/extension.js', 'lib/API.js', r'this\.#api\.(\w+)\('),
    ('modules/alienware-gnome-customizer-manager@hsx2coder/subsystems/workspace-control.js', 'lib/API.js', r'this\.#jpApi\.(\w+)\('),
    ('modules/alienware-topbar@hsx2coder/subsystems/panel/extension.js', 'subsystems/panel/api.js', r'\ba\.(\w+)\('),
]
for consumer, engine, pat in CONSUMERS:
    engine_path = os.path.join(os.path.dirname(consumer), engine)
    if not (os.path.isfile(consumer) and os.path.isfile(engine_path)):
        continue
    have = set(re.findall(
        r'^    (?:static\s+|get\s+|set\s+|async\s+)*([A-Za-z]\w*)\s*\(',
        open(engine_path, encoding='utf-8').read(), re.M))
    used = set(re.findall(pat, open(consumer, encoding='utf-8').read()))
    for name in sorted(used - have - {'open', 'close'}):
        problems.append(f'{consumer}: calls {name}() which {engine} does not define')

if problems:
    print(f'FAIL: {len(problems)} unresolved engine call(s)\n')
    for p in problems:
        print(f'  {p}')
    sys.exit(1)

print(f'OK: all {len(CLASSES)} engine classes resolve every this.x() call')
