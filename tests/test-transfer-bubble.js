// Transfer bubble API compat: FileProgressManager keeps its public API and
// exposes external-op queue hooks used by the AutoAr bridge. Static checks
// only (no Gtk display needed).
const Gio = await import('gi://Gio').then(m => m.default).catch(() => null);

function readFile(path) {
    const f = Gio.File.new_for_path(path);
    const [, bytes] = f.load_contents(null);
    return new TextDecoder().decode(bytes);
}

const DM = 'modules/alienware-desktop-enable-gnome@hsx2coder/app/desktopManager.js';
const LFO = 'modules/alienware-desktop-enable-gnome@hsx2coder/app/localFileOps.js';
const AAR = 'modules/alienware-desktop-enable-gnome@hsx2coder/app/autoAr.js';
const FPM = 'modules/alienware-desktop-enable-gnome@hsx2coder/app/fileProgressManager.js';
const CSS = 'modules/alienware-desktop-enable-gnome@hsx2coder/app/stylesheet.css';

export default [
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
    ['remote ops delegate to Nautilus: no DING card, refresh after dispatch', () => {
        const s = readFile(DM);
        for (const m of ['Remote ops are owned end-to-end by Nautilus', '_updateDesktop().catch']) {
            if (!s.includes(m))
                throw new Error(`missing remote-delegate invariant: ${m}`);
        }
        // doTrash/doDelete/doEmptyTrash must not create cards anymore
        const dmBody = s.slice(s.indexOf('    doTrash()'), s.indexOf('    checkIfSpecialFilesAreSelected'));
        if (dmBody.includes('addOperation'))
            throw new Error('remote delete/trash still creates a premature card');
        // stale TRASH/DELETE labels must be gone from FPM defaults
        const fpm = readFile(FPM);
        for (const m of ["TRASH: _('Moving to Trash", "DELETE: _('Deleting", 'EMPTY_TRASH:']) {
            if (fpm.includes(m))
                throw new Error(`stale remote label still present: ${m}`);
        }
    }],
    ['local paste confirms overwrite before card (no silent OVERWRITE)', () => {
        const s = readFile(DM);
        for (const m of ['_confirmOverwrite(conflicts)', 'query_exists(null)',
            'Replace %d existing files', 'destructive-action']) {
            if (!s.includes(m))
                throw new Error(`missing overwrite-confirm invariant: ${m}`);
        }
        // confirm must run BEFORE addOperation in _doPaste
        const paste = s.slice(s.indexOf('async _doPaste()'), s.indexOf('_parseClipboardText'));
        if (paste.indexOf('_confirmOverwrite') > paste.indexOf('addOperation'))
            throw new Error('overwrite confirm runs after card creation');
    }],
    ['autoAr bubble registers lazily after password + first progress', () => {
        const s = readFile(AAR);
        if (!s.includes('Deferred register'))
            throw new Error('autoAr eager register back');
        if (!s.includes('if (this._waitingForPassword)\n            return;'))
            throw new Error('password gate missing in _syncBubble');
        const fpm = readFile(FPM);
        if (!fpm.includes('if (!op || this._queue.includes(op))'))
            throw new Error('registerExternal not idempotent');
    }],
    ['indeterminate bars pulse on a timer (never freeze)', () => {
        const s = readFile(FPM);
        if (!s.includes('_armPulseTimer'))
            throw new Error('pulse timer missing');
    }],
    ['transfer prefs wiring: schema keys + FPM config + prefs tab', () => {
        const schema = readFile('modules/alienware-desktop-enable-gnome@hsx2coder/schemas/org.gnome.shell.extensions.ding.gschema.xml');
        for (const k of ['transfer-show-detail', 'transfer-show-rate',
            'transfer-show-elapsed', 'transfer-position', 'transfer-margin',
            'transfer-card-width', 'transfer-hide-delay', 'transfer-animation']) {
            if (!schema.includes(`name="${k}"`))
                throw new Error(`schema key missing: ${k}`);
        }
        const s = readFile(FPM);
        for (const m of ['_bubbleConfig', '_applyBubbleLayout', '_transferGet',
            'TRANSFER_POSITIONS', 'showRate = true', 'cardWidth']) {
            if (!s.includes(m))
                throw new Error(`missing FPM prefs invariant: ${m}`);
        }
        const prefs = readFile('modules/alienware-desktop-enable-gnome@hsx2coder/prefs.js');
        for (const m of ["title: 'Transfers'", 'transferPosition', 'transferMargin',
            'transferCardWidth', 'transferHideDelay', '#spin', '#connectInt',
            '#connectPosition', 'transfer-progress-symbolic']) {
            if (!prefs.includes(m))
                throw new Error(`missing prefs tab invariant: ${m}`);
        }
    }],
    ['cut+paste uses fast rename path, copy fallback preserves Moving label', () => {
        const s = readFile(LFO);
        if (!s.includes('moveItemsWithProgress'))
            throw new Error('moveItemsWithProgress missing in localFileOps');
        if (!s.includes('move_async_promise'))
            throw new Error('same-disk Gio.move fast path missing');
        // the MOVE branch must route to the rename path, not the Copy painter
        const dm = readFile(DM);
        const mvStart = dm.indexOf('if (this._isCut) {');
        const mvElse = dm.indexOf('} else {', mvStart);
        const mvBranch = dm.slice(mvStart, mvElse);
        if (!mvBranch.includes('LocalFileOps.moveItemsWithProgress'))
            throw new Error('MOVE branch does not use moveItemsWithProgress');
        if (mvBranch.includes('copyItemsWithProgress'))
            throw new Error('MOVE branch still routes to copy painter');
        // source-delete failure must surface an error card, not silent print
        if (!s.includes('could not remove the source'))
            throw new Error('partial-move error message missing');
        if (dm.includes('Error deleting source after move'))
            throw new Error('silent print loop still in _doPaste');
    }],
    ['dead transfer CSS removed (no orphan classes)', () => {
        const s = readFile(FPM);
        for (const dead of ['ding-transfer-row-status', 'ding-transfer-spinner']) {
            if (s.includes(dead))
                throw new Error(`JS still references dead class ${dead}`);
        }
        const css = readFile(CSS);
        for (const dead of ['.ding-transfer-row-status', '.ding-transfer-spinner']) {
            if (css.includes(dead))
                throw new Error(`CSS still defines dead class ${dead}`);
        }
    }],
];
