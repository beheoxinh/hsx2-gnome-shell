// Transfer bubble API compat: FileProgressManager keeps its public API and
// exposes external-op queue hooks used by the AutoAr bridge. Static checks
// only (no Gtk display needed).
const Gio = await import('gi://Gio').then(m => m.default).catch(() => null);

function readFile(path) {
    const f = Gio.File.new_for_path(path);
    const [, bytes] = f.load_contents(null);
    return new TextDecoder().decode(bytes);
}

const FPM = 'modules/alienware-desktop-enable-gnome@hsx2coder/app/fileProgressManager.js';
const AAR = 'modules/alienware-desktop-enable-gnome@hsx2coder/app/autoAr.js';
const CSS = 'modules/alienware-desktop-enable-gnome@hsx2coder/app/stylesheet.css';

export const tests = [
    ['fpm keeps legacy FileProgressItem API', () => {
        const s = readFile(FPM);
        for (const m of ['setLabel(', 'setSecondaryLabel(', 'setProgress(',
            'setCompleted(', 'setError(', 'setCancelled(',
            'incrementCompleted(', 'get completedItems()', 'get totalItems()',
            'get cancellable()', 'get cancelled()', 'get cancelledByUser()']) {
            if (!s.includes(m))
                throw new Error(`missing FileProgressItem API: ${m}`);
        }
    }],
    ['fpm keeps manager add/removeOperation + inhibit/notify', () => {
        const s = readFile(FPM);
        for (const m of ['addOperation(id, type, totalItems, message)',
            'removeOperation()', '_inhibitCookie', '_notify(']) {
            if (!s.includes(m))
                throw new Error(`missing manager API: ${m}`);
        }
    }],
    ['fpm no longer uses centered Gtk.Window popup', () => {
        const s = readFile(FPM);
        if (s.includes('CENTER_ALWAYS') || s.includes('_ensureWindow'))
            throw new Error('centered popup remnants present');
        for (const m of ['Gtk.Revealer', 'Gtk.Overlay', 'SLIDE_UP',
            'halign: Gtk.Align.START', 'valign: Gtk.Align.END']) {
            if (!s.includes(m))
                throw new Error(`missing bubble construct: ${m}`);
        }
    }],
    ['fpm exposes external queue hooks for autoAr', () => {
        const s = readFile(FPM);
        for (const m of ['registerExternal(op)', 'unregisterExternal(op)',
            '_refreshBubbleVisibility()']) {
            if (!s.includes(m))
                throw new Error(`missing external hook: ${m}`);
        }
    }],
    ['autoAr bridges progress into bubble, keeps password prompt', () => {
        const s = readFile(AAR);
        for (const m of ['_bubbleOp', '_hookBubbleMirror()',
            '_finishBubble(', 'registerExternal', 'unregisterExternal',
            '_passEntry', '_updateLegacyWindowVisibility()']) {
            if (!s.includes(m))
                throw new Error(`missing autoAr bridge piece: ${m}`);
        }
        // legacy window never presented for plain progress
        if (s.includes('this._progressWindow.present()') &&
            !s.includes('_updateLegacyWindowVisibility'))
            throw new Error('legacy window still presented unconditionally');
    }],
    ['stylesheet has transfer card classes', () => {
        const s = readFile(CSS);
        for (const m of ['.ding-transfer-pill', '.ding-transfer-bar',
            '.ding-transfer-stack', '.ding-transfer-stop',
            '.ding-transfer-done']) {
            if (!s.includes(m))
                throw new Error(`missing stylesheet piece: ${m}`);
        }
        // dead popover styles must be gone
        for (const m of ['.ding-transfer-queue', '.ding-transfer-row-v']) {
            if (s.includes(m))
                throw new Error(`dead popover style still present: ${m}`);
        }
        // opaque card background, no translucent pill
        if (!s.includes('background-color: #1e1e22'))
            throw new Error('card background is not opaque');
    }],
    ['card stack: one card per op, no popover', () => {
        const s = readFile(FPM);
        for (const m of ['_paintStack(b)', '_buildCard(op)',
            'ding-transfer-stack', 'requestCancel()']) {
            if (!s.includes(m))
                throw new Error(`missing invariant: ${m}`);
        }
        // no expand/popover machinery may remain
        for (const m of ['_toggleExpanded', '_expanded', '_paintQueueCard',
            'queueCard', '_pointerInCard', 'Terminal state: collapse']) {
            if (s.includes(m))
                throw new Error(`popover remnant still present: ${m}`);
        }
    }],
    ['cancel paints terminal state immediately (no async wait)', () => {
        const s = readFile(FPM);
        for (const m of ['requestCancel()', "_('Cancelling…')"]) {
            if (!s.includes(m))
                throw new Error(`missing invariant: ${m}`);
        }
    }],
    ['error cards styled distinctly, no duplicate status label', () => {
        const s = readFile(FPM);
        if (!s.includes("add_class('ding-transfer-error')"))
            throw new Error('error card class missing');
        if (s.includes("add_class('ding-transfer-row-status')"))
            throw new Error('duplicate finished status label still present');
        const css = readFile(CSS);
        if (!css.includes('.ding-transfer-pill.ding-transfer-error'))
            throw new Error('error CSS missing');
    }],
    ['detail merges filename + bytes/time/rate', () => {
        const s = readFile(FPM);
        if (!s.includes("detailParts.join(' — ')"))
            throw new Error('secondary label no longer merged into detail');
    }],
    ['setCancelled single body, honors late message', () => {
        const s = readFile(FPM);
        if (s.includes('mgr._stopPulse();\n        mgr._stopPulse();'))
            throw new Error('duplicate stopPulse still present');
        if (!s.includes('still honor the'))
            throw new Error('late cancel message not honored');
    }],
    ['status icon per state + dismiss + tooltip', () => {
        const s = readFile(FPM);
        for (const m of ['emblem-ok-symbolic', 'dialog-error-symbolic',
            '_dismissOp', '_tooltipText', 'set_tooltip_text',
            'ding-transfer-status-icon', "_('Dismiss')"]) {
            if (!s.includes(m))
                throw new Error(`missing invariant: ${m}`);
        }
        if (s.includes('buildQueueRow') || s.includes('queueCard'))
            throw new Error('popover remnant back');
    }],
    ['single-item ops never show bare counts', () => {
        const s = readFile(FPM);
        if (!s.includes('this._totalItems > 1'))
            throw new Error('meaningless 0/1 guard missing');
    }],
];
