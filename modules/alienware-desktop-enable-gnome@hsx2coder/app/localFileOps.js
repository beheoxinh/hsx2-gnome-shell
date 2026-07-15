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


