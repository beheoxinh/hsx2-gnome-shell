/* DING: Desktop Icons New Generation for GNOME Shell
 *
 * Copyright (C) 2025 Alienware Suite contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, version 3 of the License.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
'use strict';
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;

const FileUtils = imports.fileUtils;

const Gettext = imports.gettext.domain('ding');

const _ = Gettext.gettext;

const DEFAULT_COPY_FLAGS = Gio.FileCopyFlags.OVERWRITE | Gio.FileCopyFlags.ALLOW_METADATA_COPY;

async function calculateTotalSize(uriList, cancellable) {
    let totalBytes = 0;
    for (const uri of uriList) {
        if (cancellable && cancellable.is_cancelled())
            return -1;
        const file = Gio.File.new_for_uri(uri);
        try {
            const info = await file.query_info_async_promise(
                Gio.FILE_ATTRIBUTE_STANDARD_SIZE + ',' + Gio.FILE_ATTRIBUTE_STANDARD_TYPE,
                Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, cancellable);
            if (info.get_file_type() === Gio.FileType.DIRECTORY) {
                const dirSize = await _calculateDirSize(file, cancellable);
                if (dirSize < 0)
                    return -1;
                totalBytes += dirSize;
            } else {
                totalBytes += Math.max(info.get_size(), 0);
            }
        } catch (e) {
            if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                return -1;
            print(`Warning: cannot calculate size for ${uri}: ${e.message}`);
        }
    }
    return totalBytes;
}

async function _calculateDirSize(dir, cancellable) {
    let totalBytes = 0;
    try {
        const children = await FileUtils.enumerateDir(dir, cancellable);
        for (const info of children) {
            if (cancellable && cancellable.is_cancelled())
                return -1;
            const child = dir.get_child(info.get_name());
            if (info.get_file_type() === Gio.FileType.DIRECTORY) {
                const subSize = await _calculateDirSize(child, cancellable);
                if (subSize < 0)
                    return -1;
                totalBytes += subSize;
            } else {
                totalBytes += Math.max(info.get_size(), 0);
            }
        }
    } catch (e) {
        if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
            return -1;
        print(`Warning: skipping size calc for ${dir.get_path()}: ${e.message}`);
    }
    return totalBytes;
}

async function moveItemsWithProgress(uriList, destDirUri, progressItem) {
    /* Same-disk rename fast path (Nautilus parity: instant move, no byte
     * copy): try Gio.move per item first. Fall back to copy+delete only
     * when move fails (cross-device). progressItem label must stay
     * "Moving" — copyItemsWithProgress would paint "Copying". */
    const destDir = Gio.File.new_for_uri(destDirUri);
    const cancellable = progressItem.cancellable;

    progressItem.setLabel(
        _('Moving %d item(s)…').replace('%d', String(uriList.length)));

    let completedItems = 0;
    for (let i = 0; i < uriList.length; i++) {
        if (cancellable.is_cancelled()) {
            progressItem.setCancelled();
            return false;
        }
        const sourceFile = Gio.File.new_for_uri(uriList[i]);
        const destFile = destDir.get_child(sourceFile.get_basename());
        progressItem.setSecondaryLabel(
            _('[%d/%d] %s').replace('%d', String(i + 1)).replace('%d', String(uriList.length))
                .replace('%s', sourceFile.get_basename()));
        try {
            await sourceFile.move_async_promise(destFile,
                Gio.FileCopyFlags.OVERWRITE | Gio.FileCopyFlags.ALLOW_METADATA_COPY,
                GLib.PRIORITY_DEFAULT, cancellable, null);
        } catch (e) {
            if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)) {
                progressItem.setCancelled();
                return false;
            }
            /* Cross-device or unsupported: fall back to copy+delete for
             * this one item only, keeping the "Moving" headline.
             * copyItemsWithProgress repaints "Copying…" — restore "Moving"
             * right after so the card never lies mid-op. */
            const oneOk = await copyItemsWithProgress([uriList[i]], destDirUri, progressItem);
            progressItem.setLabel(
                _('Moving %d item(s)…').replace('%d', String(uriList.length)));
            if (!oneOk)
                return false;
            try {
                await _deleteSourceTree(sourceFile, cancellable);
            } catch (delErr) {
                throw new Error(_('Moved %s but could not remove the source: %s')
                    .replace('%s', sourceFile.get_basename())
                    .replace('%s', delErr.message));
            }
        }
        completedItems++;
        progressItem.incrementCompleted();
        progressItem.setProgress(completedItems, uriList.length);
    }
    return true;
}

async function _deleteSourceTree(sourceFile, cancellable) {
    const info = await sourceFile.query_info_async_promise(
        Gio.FILE_ATTRIBUTE_STANDARD_TYPE,
        Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, cancellable);
    if (info.get_file_type() === Gio.FileType.DIRECTORY)
        await FileUtils.recursivelyDeleteDir(sourceFile, true, cancellable);
    else
        await sourceFile.delete_async_promise(GLib.PRIORITY_DEFAULT, cancellable);
}

async function copyItemsWithProgress(uriList, destDirUri, progressItem) {
    const destDir = Gio.File.new_for_uri(destDirUri);
    const cancellable = progressItem.cancellable;

    progressItem.setLabel(
        _('Preparing to copy %d item(s)…').replace('%d', String(uriList.length)));

    const totalBytes = await calculateTotalSize(uriList, cancellable);
    if (totalBytes < 0) {
        progressItem.setCancelled();
        return false;
    }

    progressItem.setLabel(_('Copying %d item(s)…').replace('%d', String(uriList.length)));

    let completedBytes = 0;

    for (let i = 0; i < uriList.length; i++) {
        if (cancellable.is_cancelled()) {
            progressItem.setCancelled();
            return false;
        }

        const sourceFile = Gio.File.new_for_uri(uriList[i]);
        const baseName = sourceFile.get_basename();
        const destFile = destDir.get_child(baseName);

        progressItem.setSecondaryLabel(
            _('[%d/%d] %s').replace('%d', String(i + 1)).replace('%d', String(uriList.length))
                .replace('%s', baseName));

        try {
            const info = await sourceFile.query_info_async_promise(
                Gio.FILE_ATTRIBUTE_STANDARD_TYPE,
                Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, cancellable);

            let itemBytes;
            if (info.get_file_type() === Gio.FileType.DIRECTORY) {
                itemBytes = await _copyDirRecursive(sourceFile, destFile, progressItem, cancellable,
                    completedBytes, totalBytes);
            } else {
                await _copyFileWithProgress(sourceFile, destFile, progressItem, cancellable,
                    completedBytes, totalBytes);
                itemBytes = await _getFileSize(sourceFile, cancellable);
            }

            completedBytes += Math.max(itemBytes, 0);
            progressItem.incrementCompleted();
            progressItem.setProgress(completedBytes, totalBytes);

            if (i < uriList.length - 1)
                progressItem.setSecondaryLabel(
                    _('[%d/%d] %s - done').replace('%d', String(i + 1))
                        .replace('%d', String(uriList.length)).replace('%s', baseName));
        } catch (e) {
            if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)) {
                progressItem.setCancelled();
                return false;
            }
            progressItem.setError(
                _('Error copying %s: %s').replace('%s', baseName).replace('%s', e.message));
            return false;
        }
    }

    return true;
}

async function _copyFileWithProgress(source, dest, progressItem, cancellable,
    baseCompletedBytes, totalBytes) {
    try {
        await new Promise((resolve, reject) => {
            source.copy_async(dest, DEFAULT_COPY_FLAGS, GLib.PRIORITY_DEFAULT,
                cancellable,
                (currentNumBytes, totalNumBytes) => {
                    const completed = baseCompletedBytes + Math.max(currentNumBytes, 0);
                    const total = Math.max(totalBytes, 1);
                    progressItem.setProgress(completed, total);
                },
                (source_, result) => {
                    try {
                        source_.copy_finish(result);
                        resolve();
                    } catch (e) {
                        reject(e);
                    }
                });
        });
    } catch (e) {
        if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)) {
            return;
        }
        throw e;
    }
}

async function _copyDirRecursive(sourceDir, destDir, progressItem, cancellable,
    baseCompletedBytes, totalBytes) {
    if (cancellable.is_cancelled())
        return 0;

    try {
        await destDir.make_directory_async_promise(GLib.PRIORITY_DEFAULT, cancellable);
    } catch (e) {
        if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS)) {
            if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                return 0;
            throw e;
        }
    }

    const children = await FileUtils.enumerateDir(sourceDir, cancellable);
    let dirBytes = 0;

    for (const info of children) {
        if (cancellable.is_cancelled())
            return dirBytes;

        const childName = info.get_name();
        const childSource = sourceDir.get_child(childName);
        const childDest = destDir.get_child(childName);

        const label = destDir.get_basename() + '/' + childName;
        progressItem.setSecondaryLabel(label);

        let childBytes;
        if (info.get_file_type() === Gio.FileType.DIRECTORY) {
            childBytes = await _copyDirRecursive(childSource, childDest, progressItem, cancellable,
                baseCompletedBytes, totalBytes);
        } else {
            await _copyFileWithProgress(childSource, childDest, progressItem, cancellable,
                baseCompletedBytes, totalBytes);
            childBytes = await _getFileSize(childSource, cancellable);
        }

        dirBytes += Math.max(childBytes, 0);
        const newBase = baseCompletedBytes + dirBytes;
        if (newBase > 0 && totalBytes > 0)
            progressItem.setProgress(newBase, totalBytes);
    }

    return dirBytes;
}

async function _getFileSize(file, cancellable) {
    try {
        const info = await file.query_info_async_promise(
            Gio.FILE_ATTRIBUTE_STANDARD_SIZE,
            Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, cancellable);
        return Math.max(info.get_size(), 0);
    } catch (_e) {
        return 0;
    }
}



function _trashOrDeleteOne(file, mode, cancellable) {
    /* Gio.File.trash_async / delete_async as a promise — the trash delete is
     * the same call the trash backend uses, so progress here is real. */
    return new Promise((resolve, reject) => {
        const done = (f, res) => {
            try {
                f.trash_finish(res);
                resolve();
            } catch (e) {
                reject(e);
            }
        };
        if (mode === 'trash')
            file.trash_async(GLib.PRIORITY_DEFAULT, cancellable, done);
        else
            _deleteTreeRecursive(file, cancellable).then(resolve, reject);
    });
}

/* Query a file's type without ever following a symbolic link. */
function _queryInfoNoFollow(file, cancellable, priority) {
    return new Promise((resolve, reject) => {
        file.query_info_async(`${Gio.FILE_ATTRIBUTE_STANDARD_NAME},${Gio.FILE_ATTRIBUTE_STANDARD_TYPE}`,
            Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, priority, cancellable, (source, res) => {
                try {
                    resolve(source.query_info_finish(res));
                } catch (e) {
                    reject(e);
                }
            });
    });
}

/* Permanent removal of exactly one entry: file, symlink or empty directory. */
function _unlinkOne(file, cancellable, priority) {
    return new Promise((resolve, reject) => {
        file.delete_async(priority, cancellable, (source, res) => {
            try {
                source.delete_finish(res);
                resolve();
            } catch (e) {
                reject(e);
            }
        });
    });
}

function _closeEnumerator(enumerator, cancellable, priority) {
    return new Promise((resolve, reject) => {
        if (enumerator.is_closed()) {
            resolve();
            return;
        }
        enumerator.close_async(priority, cancellable, (source, res) => {
            try {
                source.close_finish(res);
                resolve();
            } catch (e) {
                reject(e);
            }
        });
    });
}

/* Child names of a directory, queried with NOFOLLOW_SYMLINKS so that a
 * symlink is reported as a symlink and never resolved to its target. */
async function _listChildrenNoFollow(dir, cancellable, priority) {
    const enumerator = await new Promise((resolve, reject) => {
        dir.enumerate_children_async(
            `${Gio.FILE_ATTRIBUTE_STANDARD_NAME},${Gio.FILE_ATTRIBUTE_STANDARD_TYPE}`,
            Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, priority, cancellable, (source, res) => {
                try {
                    resolve(source.enumerate_children_finish(res));
                } catch (e) {
                    reject(e);
                }
            });
    });

    const names = [];
    try {
        for (;;) {
            if (cancellable && cancellable.is_cancelled())
                throw new GLib.Error(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED, 'Operation cancelled');

            const batch = await new Promise((resolve, reject) => {
                enumerator.next_files_async(64, priority, cancellable, (source, res) => {
                    try {
                        resolve(source.next_files_finish(res));
                    } catch (e) {
                        reject(e);
                    }
                });
            });
            if (!batch.length)
                break;

            for (const info of batch) {
                if (info)
                    names.push(info.get_name());
            }
        }
    } finally {
        try {
            await _closeEnumerator(enumerator, cancellable, priority);
        } catch (closeError) {
            /* The listing is done; report the close failure to the journal
             * without masking the real error that may be in flight. */
            console.error('Failed to close directory enumerator:', closeError);
        }
    }
    return names;
}

/* Permanent delete of `file` and everything below it, bottom-up.
 * Gio.File.delete_async is only unlink()/rmdir(): a directory that still has
 * children fails with G_IO_ERROR_NOT_EMPTY, so the children go first. Symbolic
 * links are unlinked themselves and never traversed, so a link pointing out of
 * the tree cannot drag its target's contents with it. */
async function _deleteTreeRecursive(file, cancellable, priority = GLib.PRIORITY_DEFAULT) {
    if (cancellable && cancellable.is_cancelled())
        throw new GLib.Error(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED, 'Operation cancelled');

    const info = await _queryInfoNoFollow(file, cancellable, priority);
    if (info.get_file_type() === Gio.FileType.DIRECTORY) {
        const children = await _listChildrenNoFollow(file, cancellable, priority);
        for (const childName of children) {
            if (cancellable && cancellable.is_cancelled())
                throw new GLib.Error(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED, 'Operation cancelled');
            await _deleteTreeRecursive(file.get_child(childName), cancellable, priority);
        }
    }
    await _unlinkOne(file, cancellable, priority);
}

async function removeItemsWithProgress(uriList, mode, progressItem, tolerate = false) {
    /* mode 'trash' -> Gio trash, 'delete' -> permanent recursive unlink. Same contract
     * as copy/move helpers: per-item secondary + counter, setCancelled() on
     * cancel, throw on failures (caller setError). Failures on some items do
     * not abort the rest — Nautilus reports and continues too. */
    const cancellable = progressItem.cancellable;
    let completedItems = 0;
    const failures = [];
    const failureReasons = [];
    for (const uri of uriList) {
        if (cancellable.is_cancelled()) {
            progressItem.setCancelled();
            return false;
        }
        const file = Gio.File.new_for_uri(uri);
        progressItem.setSecondaryLabel(
            _('[%d/%d] %s').replace('%d', String(completedItems + 1))
                .replace('%d', String(uriList.length))
                .replace('%s', file.get_basename()));
        try {
            await _trashOrDeleteOne(file, mode, cancellable);
        } catch (e) {
            if (cancellable.is_cancelled() ||
                (e.matches && e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))) {
                progressItem.setCancelled();
                return false;
            }
            failures.push(file.get_basename() || uri);
            failureReasons.push(e.message || String(e));
        }
        completedItems++;
        progressItem.incrementCompleted();
        progressItem.setProgress(completedItems, uriList.length);
    }
    if (failures.length) {
        if (tolerate) {
            /* Best-effort (empty trash): entries from foreign mounts or
             * locked files can stay; report the count, do not fail the op. */
            progressItem.setSecondaryLabel(
                _('%d item(s) could not be removed').replace('%d', String(failures.length)));
        } else {
            const reason = failureReasons.length ? ` (${failureReasons[0]})` : '';
            throw new Error(_('Could not remove %d item(s): %s')
                .replace('%d', String(failures.length))
                .replace('%s', failures.slice(0, 3).join(', ')) + reason);
        }
    }
    return true;
}
