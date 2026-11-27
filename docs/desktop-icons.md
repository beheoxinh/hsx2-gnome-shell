# Desktop Icons NG (DING) — Module Documentation

> **Vai trò:** Hiển thị icon files/folders/apps trên desktop GNOME, thay thế hoàn toàn Desktop Icons mặc định.

---

## 1. Tổng quan

Cung cấp desktop icons với các tính năng: drag & drop, right-click menu, auto-arrange, file operations (copy/paste/rename/delete), external drives, trash, home folder shortcuts, thumbnails, và integration với Nautilus.

**Kế thừa từ:** `ding@rastersoft.com` (Desktop Icons NG)

### 1.1 Tính năng chính

- Desktop icons cho files, folders, applications, external drives
- Auto-arrange theo nhiều tiêu chí: name, modified time, kind, size
- Drag & drop reorder (khi tắt auto-arrange)
- Right-click menu: new folder, new document, paste, terminal, properties
- File operations: rename, delete, copy, move, trash
- External drives: mount/unmount icons
- Trash: show trash icon + count
- Home: show home directory icon
- Thumbnails: generate previews for images, videos, documents
- Nemo integration: dùng Nemo file operations thay vì GNOME (optional)

### 1.2 Module integration

- **Class:** `DING extends Extension`
- **Process model:** extension.js trong GNOME Shell process + app/ding.js process cho file ops
- **DBus communication:** Giữa shell process và file ops process qua DBus

---

## 2. GSchema Keys

Schema: `org.gnome.shell.extensions.ding` (22 keys)

### 2.1 Display

| Key | Type | Default | Mô tả |
|-----|------|---------|-------|
| `icon-size` | s | 'small' | Icon size: tiny(36), small(48), standard(64), large(96) |
| `show-home` | b | false | Show home folder icon |
| `show-trash` | b | false | Show trash icon |
| `show-volumes` | b | false | Show mounted volumes |
| `show-network-volumes` | b | false | Show network volumes |
| `show-drop-place` | b | true | Show drop placeholder |
| `show-link-emblem` | b | true | Show link emblem on symlinks |
| `dark-text-in-labels` | b | false | Use dark text labels (for light wallpaper) |

### 2.2 Arrangement

| Key | Type | Default | Mô tả |
|-----|------|---------|-------|
| `keep-arranged` | b | false | Enable auto-arrange |
| `arrangeorder` | s | 'MODIFIEDTIME' | Sort: NAME, MODIFIEDTIME, KIND, SIZE, DESCENDINGNAME |
| `sort-special-folders` | b | false | Sort special folders first |
| `start-corner` | s | 'top-left' | Arrange start corner |
| `keep-stacked` | b | false | Keep icons stacked (for external drives) |

### 2.3 Integration

| Key | Type | Default | Mô tả |
|-----|------|---------|-------|
| `open-with-enabled` | b | true | Show "Open with..." context menu |
| `open-with-label` | s | 'IDE' | Custom label for open-with |
| `open-with-command` | s | 'antigravity' | Custom command for open-with |
| `terminal-command` | s | 'ptyxis' | Default terminal emulator |
| `use-native-progress` | b | false | Show native progress dialogs |
| `use-nemo` | b | false | Use Nemo for file operations |
| `check-x11wayland` | b | true | Check for X11/Wayland compatibility |

### 2.4 Nautilus Context (dùng chung desktop + Nautilus)

Mỗi key bật/tắt một mục ở **cả hai nơi cùng lúc**: menu desktop (`app/fileItemMenu.js`) và plugin Nautilus (`nautilus/*.py`) đều đọc trực tiếp cùng một key, nên đổi xong có hiệu lực ngay, không cần restart Nautilus.

| Key | Type | Default | Mô tả |
|-----|------|---------|-------|
| `nautilus-integration` | b | false | Cài/gỡ snapshot plugin vào `~/.local/share/nautilus-python/extensions` |
| `context-copy-content` | b | true | "Copy file content" (1 file, tối đa 50 MB) |
| `context-copy-path` | b | true | "Copy file path" / "Copy folder path" |
| `context-duplicate` | b | true | "Duplicate ..." → `name (Duplicate N).ext`, chạy `cp -a --reflink=auto` |
| `open-with-enabled` | b | true | "Open with {open-with-label}" chạy `open-with-command` (parse kiểu shell) |
| `context-git-emblems` | b | true | Emblem trạng thái git, chỉ có ở Nautilus |

### 2.5 Stacking

| Key | Type | Default | Mô tả |
|-----|------|---------|-------|
| `unstackedtypes` | as | ['text/x-ms-regedit', ...] | MIME types that should NOT be stacked |

---

## 3. Luồng nghiệp vụ

### 3.1 Desktop rendering

```
enable()
  → GnomeShellOverride: override layoutManager để resize desktop
  → EmulateX11: mock X11 _NET_WINDOW_TYPE_DESKTOP
  → innerEnable():
       → spawn DING process (app/ding.js) via GLib.spawn
       → DBus connection between shell & process
       → process renders desktop icons
       → desktop icons respond to file system changes (inotify)
```

### 3.2 User interaction

```
User right-click on desktop
  → context menu: New Folder, Terminal, Paste, Arrange
  → action sent to DING process via DBus
  → process thực hiện file operations
  → icons update on screen
```

---

### 3.3 Nautilus Context sync

```
prefs › Nautilus Context › "Install into Nautilus" (nautilus-integration)
  → nautilusSync.reconcile()
       on  → install(): render nautilus/<plugin>.py + _common.py (điền schema dir)
              → ghi atomic vào ~/.local/share/nautilus-python/extensions/
              → file trùng tên không có marker (plugin cũ của user) và
                open_with_antigravity.py → chuyển sang extensions-backup/
       off → uninstall(): chỉ xoá file có marker "alienware-nautilus-context"
  → nút "Restart Nautilus" (nautilus -q): Nautilus chỉ load plugin lúc khởi động
extension.js innerEnable() → 5 giây sau: nautilusSync.syncIfEnabled()
  nautilus-integration = true → install() lại để đẩy snapshot mới (sau khi cập nhật extension)
  nautilus-integration = false → không làm gì (không bao giờ tự gỡ)
```

Quy tắc giống nhau ở desktop và Nautilus (kiểm bằng `bash tests/e2e/run-all.sh [--window]`, xem `tests/e2e/README.md`):

- "Open with …" ẩn khi `open-with-command` rỗng hoặc không parse được (`GLib.shell_parse_argv`); label rỗng → `IDE`; mỗi item chạy một lần với cwd là thư mục chứa nó.
- Duplicate chọn nhiều item: tên đã "hứa" cho item trước được giữ lại, nên `a.txt` + `a (Duplicate).txt` ra `(Duplicate 2)` và `(Duplicate 3)`, không ghi đè nhau. Symlink tới folder được coi là folder.
- Backup trùng giây không ghi đè nhau (thêm hậu tố `-N`).

Ràng buộc của nautilus-python (đã gặp khi debug):

- Không dùng thread Python trong plugin: thread không chạy ổn định, và lock dùng chung với UI có thể làm Nautilus treo. Clipboard đưa dữ liệu qua stdin của `wl-copy`/`xclip` (`Popen`, không chờ). Git emblems refresh nền bằng `Gio.Subprocess.communicate_async` trên main loop.
- `Nautilus.FileInfo.lookup_for_uri`/`create_for_uri` gọi một function pointer mà Nautilus chỉ gán khi class `NautilusFile` đã tồn tại; gọi sớm hơn là **segfault**. Plugin chỉ gọi sau khi `update_file_info` đã nhận một `Nautilus.FileInfo` thật.
- Tắt `context-git-emblems` vẫn ghi nhớ URI (không chạy git, không monitor), nên bật lại hiện emblem ngay, không cần F5.

- Thiếu `nautilus-python` (không tìm thấy `libnautilus-python.so`): tab hiện cảnh báo kèm lệnh cài theo distro.
- Plugin bị mồ côi (extension bị gỡ, không đọc được schema): mọi mục tự ẩn.
- Muốn thêm plugin: thêm file vào `nautilus/`, khai báo trong `PLUGINS` (`nautilusSync.js`), thêm key vào schema, tăng `SNAPSHOT_VERSION`.

---

## 4. Cấu hình mặc định

- Icon size: small (48px)
- Auto-arrange: disabled
- Home icon: hidden
- Trash icon: hidden
- Volumes: hidden
- Open with: enabled
- Terminal: ptyxis
- Start corner: top-left

---

## 5. Lưu ý kỹ thuật

- **Hardcoded schema:** `enums.js` line 109: `SCHEMA = 'org.gnome.shell.extensions.ding'` — hardcoded
- **Dual process:** extension.js lightweight, heavy lifting qua DING subprocess
- **X11/Wayland:** Cần emulate X11 desktop window type trên Wayland
- **Dependencies:** Cần `nautilus` hoặc `nemo` cho file operations

---

## 6. References

- Dconf path: `/org/gnome/shell/extensions/ding/`
- Source: https://gitlab.com/rastersoft/desktop-icons-ng
