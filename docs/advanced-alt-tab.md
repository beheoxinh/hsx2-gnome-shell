# Advanced Alt-Tab Window Switcher (AATWS) — Module Documentation

> **Vai trò:** Thay thế hoàn toàn Alt+Tab mặc định của GNOME Shell với khả năng tuỳ biến cao, type-to-search, filtering, sorting, workspace/monitor navigation.

---

## 1. Tổng quan

AATWS cung cấp một popup switcher hiện đại thay thế cho Alt+Tab, Alt+` và Super+Tab của GNOME. Hỗ trợ cả chế độ window-switching và app-switching, kèm theo tính năng tìm kiếm, lọc, hotkeys, workspace switching, và thumbnails.

**Kế thừa từ:** `advanced-alt-tab@G-dH.github.com`

### 1.1 Tính năng chính

- Window switcher (Alt+Tab) với preview thumbnails
- App switcher (Alt+`) với grid hiển thị window thuộc app
- Type-to-search: gõ tên window/app để lọc
- Workspace thumbnails
- Hotkeys: close, minimize, maximize, sticky, move-to-monitor, group-workspace
- Multi-monitor support
- Switcher themes (0=auto, 1=modern, 2=classic)
- `remember-input`: restore last input source per window

### 1.2 Module integration

- **Class:** `AATWS extends Extension`
- **Imports:** Gio, GLib, Meta, Shell, GObject, altTab.js, layout.js
- **Module type:** headless (không panel widget, popup khi Alt+Tab)
- **Schema keys:** 108 keys (nhiều nhất trong tất cả modules)

---

## 2. GSchema Keys (subset quan trọng)

### 2.1 Activation modes

| Key | Type | Range | Default | Mô tả |
|-----|------|-------|---------|-------|
| `super-key-mode` | i | 0=Alt+Tab only, 1=Super enabled, 2=Super only | 1 | Super key activation |
| `enable-super` | b | true/false | false | Enable super key for switcher |
| `super-double-press-action` | i | 0=none, 1=launcher, 2=app-grid, 3=all | 1 | Double-press Super action |

### 2.2 Hot edges

| Key | Type | Default | Mô tả |
|-----|------|---------|-------|
| `hot-edge-position` | i | 0 | Screen edge (0=top, 1=bottom, 2=left, 3=right) |
| `hot-edge-fullscreen` | b | true | Enable in fullscreen |
| `hot-edge-mode` | i | 0 | 0=switcher, 1=dash, 2=none |
| `hot-edge-width` | i | 50 | Activation zone width (px) |
| `hot-edge-pressure` | i | 100 | Pressure threshold |

### 2.3 Popup layout

| Key | Type | Default | Mô tả |
|-----|------|---------|-------|
| `switcher-popup-position` | i | 2 | 0=panel, 1=center, 2=bottom-center, 3=pointer, 4=current window |
| `switcher-popup-monitor` | i | 3 | 0=active, 1=primary, 2=pointer, 3=current-window, 4=all |
| `show-dash` | i | 0 | 0=never, 1=always, 2=in-overview |
| `animation-time-factor` | i | 200% | Animation speed (%) |

### 2.4 Window filtering & sorting

| Key | Type | Default | Mô tả |
|-----|------|---------|-------|
| `win-switcher-popup-sorting` | i | 1 | 0=none, 1=app+ws, 2=ws+app, 3=monitor, 4=title |
| `win-switcher-popup-filter` | i | 1 | 0=none, 1=active-ws, 2=active-monitor, 3=combine |
| `win-switch-skip-minimized` | b | false | Skip minimized windows |
| `win-switch-include-modals` | b | true | Include modal dialogs |

### 2.5 Hotkeys (in-switcher)

| Key | Default | Mô tả |
|-----|---------|-------|
| `hotkey-close-quit` | 'W' | Close/quit window |
| `hotkey-search` | 'E' | Focus search/type-to-filter |
| `hotkey-sticky` | 'S' | Toggle sticky on all workspaces |
| `hotkey-fs-on-new-ws` | 'F' | Fullscreen on new workspace |
| `hotkey-group-ws` | 'G' | Move to new workspace / group |
| `hotkey-left/right/up/down` | H/L/J/K | Navigation keys |
| `hotkey-switcher-mode` | 'Z' | Toggle window/app switcher mode |

### 2.6 Multi-monitor

| Key | Type | Default | Mô tả |
|-----|------|---------|-------|
| `switcher-popup-monitor` | i | 3 | Monitor selection for popup |
| `hotkey-move-win-to-monitor` | 'X' | Move window to another monitor |

---

## 3. Luồng nghiệp vụ

### 3.1 Alt+Tab activation

```
User presses Alt+Tab
  → AATWS intercepts via Shell.ActionMode
  → Create popup window (switcher popup)
  → Query windows via Shell.WindowTracker
  → Apply filter: workspace, monitor, minimized, modals
  → Apply sort: group, order
  → Render: thumbnail + title + workspace indicator
  → User navigates: Tab/arrows/hotkeys/type-to-search
  → User releases Alt → activate selected window
```

### 3.2 Type-to-search

```
User types while popup is open
  → Filter windows by title
  → Realtime narrowing
  → Selected item follows filter results
  → ESC clears search → back to full list
```

---

## 4. Dependencies

- **GNOME Shell:** Alt+Tab interception qua `AltTab` module
- **Layout manager:** Switcher popup position phụ thuộc vào `layout.js`
- **Keybinding:** Ghi đè keybinding của GNOME mặc định

---

## 5. Cấu hình mặc định

- Super key mode: `1` (Super enabled alongside Alt+Tab)
- Switcher position: bottom-center
- Sorting: app + workspace
- Filter: active workspace only
- Animation time: 200%
- Popup timeout: 100ms
- Hotkeys: enabled với 20 shortcut keys
- Remember input: disabled

---

## 6. Lưu ý kỹ thuật

- **Hardcoded schema:** Không — dùng `this.getSettings()` từ metadata
- **Popup transparency:** Sử dụng Clutter shader effects
- **Multi-monitor connection:** Qua `LayoutManager.connect('monitors-changed')`
- **Workspace tracking:** Qua `WorkspaceManager` signals

---

## 7. References

- Dconf path: `/org/gnome/shell/extensions/advanced-alt-tab-window-switcher/`
- Schema ID: `org.gnome.shell.extensions.advanced-alt-tab-window-switcher`
