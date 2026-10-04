const DEFAULT_ROW_LABEL = '(Default)';

export function collectThemeNames(dirs, existsFn) {
    const names = new Set(['']);
    for (const dir of dirs) {
        let entries;
        try {
            entries = existsFn(dir);
        } catch {
            continue;
        }
        if (!entries)
            continue;
        for (const [name, hasCss] of entries) {
            if (hasCss)
                names.add(name);
        }
    }
    return [...names].sort();
}

export function themeNameToRowLabel(name) {
    return name ? name : DEFAULT_ROW_LABEL;
}

export function rowLabelToThemeName(label) {
    return label === DEFAULT_ROW_LABEL ? '' : (label ?? '');
}

export function selectedIndexForTheme(list, current) {
    if (!current)
        return 0;
    const idx = list.indexOf(current);
    return idx >= 0 ? idx : 0;
}
