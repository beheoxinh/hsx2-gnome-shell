#!/usr/bin/env python3
"""Flag gnome-shell / St API calls that do not exist in the installed typelibs.

`St.CssProvider` and `St.ThemeContext.add_provider()` do not exist in GNOME Shell
50's St GIR. Using them throws on the first line of enable(), and GNOME then
disables the whole extension. No syntax check sees this, so it gets its own
check: decompile the installed typelibs once and verify the class and method
names the suite actually uses.

    python3 tools/check-shell-api.py
"""
import os
import re
import subprocess
import xml.etree.ElementTree as ET
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

# where the shell keeps its typelibs
SEARCH = ['/usr/lib64/gnome-shell', '/usr/lib64/mutter-18',
          '/usr/lib64/gnome-shell/girepository-1.0']


def typelib_dirs():
    out = []
    for d in SEARCH:
        if os.path.isdir(d) and os.path.exists(os.path.join(d, 'St-18.typelib')):
            out.append(d)
    # the typelibs cross-reference each other, so every dir holding one of the
    # namespaces we decompile has to be on the search path
    for d in SEARCH:
        if d not in out and os.path.isdir(d) and any(
                os.path.exists(os.path.join(d, f'{ns}-18.typelib'))
                for ns in ('St', 'Clutter', 'Meta', 'Shell')):
            out.append(d)
    return out


def load_known():
    """class name -> set of method names, for the namespaces we use from gi://"""
    dirs = typelib_dirs()
    if not dirs:
        return None
    env = dict(os.environ)
    env['GI_TYPELIB_PATH'] = ':'.join(dirs)
    known = {}
    for ns, ver in (('St', '18'), ('Clutter', '18'), ('Meta', '18'), ('Shell', '18')):
        for d in dirs:
            cand = os.path.join(d, f'{ns}-{ver}.typelib')
            if not os.path.exists(cand):
                continue
            with tempfile.TemporaryDirectory() as tmp:
                out = os.path.join(tmp, f'{ns}.gir')
                r = subprocess.run(['g-ir-generate', cand, '-o', out],
                                   env=env, capture_output=True)
                if r.returncode or not os.path.exists(out):
                    continue
                # ElementTree, not regex: g-ir-generate nests
                # <record name="FooClass"> inside <class name="Foo">, so a
                # backreference regex either stops early or runs past the end.
                root = ET.parse(out).getroot()
                classes = {}
                for elem in root.iter():
                    # the GIR carries an xmlns, so tags arrive namespaced
                    tag = elem.tag.rsplit('}', 1)[-1]
                    if tag not in ('class', 'record', 'union', 'struct'):
                        continue
                    name = elem.get('name')
                    if not name:
                        continue
                    methods = set()
                    # direct children only, so a nested FooClass does not leak
                    for child in elem:
                        ctag = child.tag.rsplit('}', 1)[-1]
                        if ctag in ('method', 'function', 'property',
                                    'signal', 'field'):
                            methods.add(child.get('name'))
                    methods.update(('new', 'copy'))
                    classes[name] = methods
            known[ns] = classes
            break
    return known or None


# gi:// namespace -> typelib namespace
NS = {'St': 'St', 'Clutter': 'Clutter', 'Meta': 'Meta', 'Shell': 'Shell',
      'GObject': None, 'Gio': None, 'GLib': None, 'Gtk': None}

CALL = re.compile(r'\b(St|Clutter|Meta|Shell)\.([A-Z]\w*)\.(\w+)\s*\(')
CLASS_USE = re.compile(r'\bnew\s+(St|Clutter|Meta|Shell)\.([A-Z]\w*)\b')
STATIC_USE = re.compile(r'\b(St|Clutter|Meta|Shell)\.([A-Z]\w*)\.(?=[A-Z_])')

SKIP = ('.git', '.bak', 'tools', 'node_modules')

# Code this refactor owns. Upstream ports predate it and already carry whatever
# API rot they have; reporting those is noise, but anything in the suite's own
# files is a real regression because that code is new or newly moved.
OWNED_PREFIXES = (
    './extension.js',
    './prefs.js',
    './migrations.js',
    # the module this refactor created
    './modules/alienware-topbar@hsx2coder/',
    # the subsystem the refactor moved into the customizer
    './modules/alienware-gnome-customizer-manager@hsx2coder/subsystems/',
    # the engine files the refactor carved up
    './modules/alienware-gnome-customizer-manager@hsx2coder/lib/API.js',
    './modules/alienware-dash-to-panel@hsx2coder/lib/api.js',
    './modules/alienware-advanced-alt-tab@hsx2coder/lib/api.js',
)


def owned(path):
    return path.startswith(OWNED_PREFIXES)


def main():
    known = load_known()
    if not known:
        print('SKIP: could not decompile St/Clutter/Meta typelibs here')
        return 0

    problems = []
    for base, dirs, files in os.walk('.'):
        dirs[:] = [d for d in dirs if d not in SKIP]
        for f in files:
            if not f.endswith('.js'):
                continue
            path = os.path.join(base, f)
            text = open(path, encoding='utf-8', errors='replace').read()
            if text.lstrip().startswith('#!'):
                continue
            for m in CALL.finditer(text):
                ns, cls, meth = m.group(1), m.group(2), m.group(3)
                classes = known.get(NS.get(ns))
                if not classes or cls not in classes:
                    continue
                if meth not in classes[cls] and meth not in ('get', 'set', 'vfunc'):
                    line = text[:m.start()].count('\n') + 1
                    problems.append(f'{path}:{line}: {ns}.{cls}.{meth}() '
                                    f'is not in the {ns} typelib')
            for m in CLASS_USE.finditer(text):
                ns, cls = m.group(1), m.group(2)
                classes = known.get(NS.get(ns))
                if not classes:
                    continue
                if cls not in classes:
                    line = text[:m.start()].count('\n') + 1
                    problems.append(f'{path}:{line}: new {ns}.{cls}() '
                                    f'- {ns} has no such class')

    blocking = [p for p in problems if owned(p.split(':')[0])]
    upstream = [p for p in problems if not owned(p.split(':')[0])]

    if blocking:
        print(f'FAIL: {len(blocking)} shell API call(s) in code this refactor '
              f'owns do not exist\n')
        for p in blocking:
            print(f'  {p}')
        print()
    if upstream:
        print(f'note: {len(upstream)} pre-existing call(s) in upstream ports '
              f'use removed APIs (out of scope, reported not enforced)')
        print()
    if blocking:
        sys.exit(1)
    print(f'OK: every St/Clutter/Meta/Shell class and method used exists '
          f'in the installed typelibs ({sum(len(v) for v in known.values())} classes checked)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
