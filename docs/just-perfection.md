# Just Perfection — Module Documentation

> **Vai trò:** Công cụ tuỳ biến toàn diện GNOME Shell UI — ẩn/hiện elements, thay đổi behavior, disable tính năng không dùng.

---

## 1. Tổng quan

Cho phép ẩn hoặc thay đổi hầu hết các thành phần UI của GNOME Shell: Activities button, calendar, clock menu, search, workspace popup, dash, window picker, animation, và nhiều hơn nữa.

**Kế thừa từ:** `just-perfection-desktop@just-perfection`

### 1.1 Tính năng chính

- Ẩn UI elements: Activities button, calendar, search, dash, workspace switcher, background menu, accessibility menu
- Animation: disable/tắt các transition animations
- Panel: clock menu, date menu, world clocks, weather
- Window picker: size, spacing, hover
- Alt-Tab: preview size, icon size
- Workspace: disable popup, disable wrap
- Startup status: show/hide system status

### 1.2 Module integration

- **Class:** `JustPerfection extends Extension`
- **Manager pattern:** internal Manager (`lib/Manager.js` + `lib/API.js`)
- **Resource bundle:** Dùng `resources.gresource` cho prefs UI

---

## 2. GSchema Keys

Schema: `org.gnome.shell.extensions.just-perfection` (73 keys)

### 2.1 UI elements visibility

| Key | Type | Default | Mô tả |
|-----|------|---------|-------|
| `activities-button` | b | true | Show Activities button |
| `accessibility-menu` | b | true | Show accessibility menu |
| `background-menu` | b | true | Show background right-click menu |
| `calendar` | b | true | Show calendar in date menu |
| `clock-menu` | b | false | Show clock in panel (false = use default) |
| `search` | b | true | Enable search in overview |
| `world-clock` | b | true | Show world clocks |
| `weather` | b | true | Show weather |

### 2.2 Animation

| Key | Type | Range | Default | Mô tả |
|-----|------|-------|---------|-------|
| `animation` | i | 0=speed-up, 1=disable, 2=disable-all, 3=enable | 1 | Animation management |

### 2.3 Workspace

| Key | Type | Default | Mô tả |
|-----|------|---------|-------|
| `workspace-popup` | b | false | Show workspace switch popup |
| `workspace-wrap` | b | true | Allow workspace wrap-around |
| `workspace-switcher-size` | i | 0 | Workspace switcher size (0=default) |

### 2.4 Dash

| Key | Type | Default | Mô tả |
|-----|------|---------|-------|
| `dash` | b | true | Show dash in overview |
| `dash-icon-size` | i | 0 | Custom icon size (0=default) |

### 2.5 Window picker

| Key | Type | Default | Mô tả |
|-----|------|---------|-------|
| `window-picker-icon` | b | true | Show app icon in window picker |
| `window-preview-size` | i | 0 | Custom size (0=default) |
| `window-preview-hover` | b | true | Hover effect on window preview |
| `window-demands-attention` | b | true | Highlight demanding attention windows |

### 2.6 Panel

| Key | Type | Default | Mô tả |
|-----|------|---------|-------|
| `panel` | b | true | Show top panel |
| `panel-size` | i | 0 | Panel height (0=default) |
| `panel-notification-icon` | b | true | Show notification icon in panel |

### 2.7 Startup status

| Key | Type | Default | Mô tả |
|-----|------|---------|-------|
| `startup-status` | i | 0 | 0=none, 1=list, 2=grid of running apps at startup |

### 2.8 Alt-Tab

| Key | Type | Default | Mô tả |
|-----|------|---------|-------|
| `alt-tab-icon-size` | i | 0 | Alt+Tab icon size |
| `alt-tab-small-icon-size` | i | 0 | Small icon size |
| `alt-tab-window-preview-size` | i | 0 | Window preview size |

---

## 3. Luồng nghiệp vụ

### 3.1 Startup flow

```
enable()
  → this.getSettings() → GSettings
  → Delegate to Manager
  → Manager.applyAll() → iterate all keys
  → For each key: override/replace native GNOME Shell UI
  → Connect 'changed' signals for live updates
```

### 3.2 Example: ẩn Activities button

```
Settings: activities-button = false
  → Manager._updateActivitiesButton(false)
  → mainPanel._activitiesButton.hide()
  → on re-enable: show()
```

---

## 4. Cấu hình mặc định

- Animation: disabled (1)
- Activities button: visible
- Calendar: visible
- Search: enabled
- Workspace popup: hidden
- Dash: visible
- Panel: visible (default size)
- Startup status: none

---

## 5. Lưu ý kỹ thuật

- **Module pattern:** Dùng factory pattern với `lib/API.js` quản lý state
- **Resource:** Prefs UI nén trong `resources.gresource` — không thể edit trực tiếp, cần recompile
- **Live update:** Tất cả keys đều watch 'changed' signal → áp dụng ngay không cần restart shell
- **Multi-module compatibility:** Ẩn Activities button không ảnh hưởng module khác

---

## 6. References

- Dconf path: `/org/gnome/shell/extensions/just-perfection/`
- Source: https://gitlab.gnome.org/jrahmatzadeh/just-perfection
