# Dash to Panel — Module Documentation

> **Vai trò:** Module chính của suite, cung cấp taskbar thay thế dock GNOME mặc định, chuyển dash vào panel chính.

---

## 1. Tổng quan chức năng

Dash to Panel (DTP) là extension thay thế dash của GNOME Shell bằng một taskbar kiểu Windows/KDE ngay trên panel. Running applications và favorited apps hiển thị dưới dạng icon, hỗ trợ nhóm taskbar, preview window, intellihide, transparency, secondary menu, multi-monitor isolation, và cử chỉ chuột phong phú.

**Kế thừa từ:** `dash-to-panel@jderose9.github.com`

### 1.1 Tính năng chính

- Taskbar chứa ứng dụng đang chạy + yêu thích
- Window preview khi hover
- Intellihide (tự động ẩn/hiện panel)
- Group apps (nhóm icon application)
- Multi-monitor support + monitor isolation
- Hotkey cho app switching
- Secondary menu (right-click) với tuỳ biến
- Show Desktop button
- App icon hover animation (RIPPLE, PLANK, SIMPLE)
- Media player controller (sub-module Advanced Media Controller)

---

## 2. Cấu trúc Module

```
alienware-dash-to-panel@hsx2coder/
├── extension.js              ← Main extension class: DashToPanelExtension
├── prefs.js                  ← Preferences: DashToPanelPreferences
├── metadata.json             ← UUID, settings-schema
├── schemas/
│   ├── gschemas.compiled
│   └── org.gnome.shell.extensions.dash-to-panel.gschema.xml
├── media/
│   ├── MediaController.js    ← Media controller integration
│   └── schemas/
│       ├── gschemas.compiled
│       └── org.gnome.shell.extensions.advanced-media-controller.gschema.xml
├── panelManager.js           ← Panel lifecycle manager
├── panelSettings.js          ← Panel settings manager
├── panelStyle.js             ← CSS styling manager
├── panelPositions.js         ← Position calculations
├── taskbar.js                ← Taskbar rendering
├── appIcons.js               ← Application icon rendering
├── windowPreview.js          ← Window preview popup
├── intellihide.js            ← Auto-hide logic
├── overview.js               ← Overview integration
├── proximity.js              ← Proximity detection
├── notificationsMonitor.js   ← Notification badge integration
├── transparency.js           ← Transparency effects
├── utils.js                  ← Utilities
├── stylesheet.css            ← Module styles
├── ui/                       ← GTK Builder UI files (Settings panels)
└── locale/                   ← Bản dịch
```

---

## 3. GSchema Keys

Schema: `org.gnome.shell.extensions.dash-to-panel` (250 keys)
Sub-schema: `org.gnome.shell.extensions.advanced-media-controller` (~30 keys)

### 3.1 Panel Appearance

| Key | Type | Default | Mô tả |
|-----|------|---------|-------|
| `panel-size` | i | 48 | Panel height in pixels |
| `panel-position` | i (enum: BOTTOM/TOP/LEFT/RIGHT) | 0 | Panel position |
| `panel-element-positions` | s | JSON | Custom element positions |
| `dot-style` | i (enum: DOTS/SQUARES/DASHES/SEGMENTED/SOLID/CILIORA/METRO) | 0 | Running indicator style |
| `dot-position` | i | 0 | Dot position on icon |
| `transparency` | i | 0 | Panel transparency level (0=opaque, 1=dynamic, 2=static, 3=smart) |
| `opacity` | d | 1.0 | Panel opacity (0.0–1.0) |

### 3.2 Taskbar Behavior

| Key | Type | Default | Mô tả |
|-----|------|---------|-------|
| `group-apps` | b | true | Group apps by application (single icon per app) |
| `show-apps-hotkey` | s | `'<Super>1'` | Show applications hotkey |
| `show-favorites` | b | true | Show favorite apps on taskbar |
| `show-running` | b | true | Show running apps on taskbar |
| `activate-single-window` | b | true | Activate single window directly instead of showing preview |
| `animate-app-switch` | b | true | Animate app icon when switching |
| `animate-window-launch` | b | true | Animate launching window |

### 3.3 Intellihide

| Key | Type | Default | Mô tả |
|-----|------|---------|-------|
| `intellihide` | b | false | Enable auto-hide |
| `intellihide-behavior` | i (enum) | 0 | ALL_WINDOWS=0, FOCUSED_WINDOWS=1, MAXIMIZED_WINDOWS=2 |
| `intellihide-animation` | d | 0.15 | Hide animation duration (seconds) |
| `intellihide-pressure-threshold` | i | 0 | Pressure threshold for reveal |

### 3.4 Hotkeys

| Key | Type | Default | Mô tả |
|-----|------|---------|-------|
| `app-ctrl-hotkey-{1-9,0}` | as | per key | Ctrl+Super+{1-9,0} app launcher shortcuts |
| `hotkey-prefix` | i (enum: Super/SuperAlt) | 0 | Modifier for hotkey numeric shortcuts |
| `hotkey-overlay` | i (enum: NEVER/TEMPORARILY/ALWAYS) | 0 | Show overlay when pressing hotkey |

### 3.5 Window Preview

| Key | Type | Default | Mô tả |
|-----|------|---------|-------|
| `show-window-preview` | b | true | Show window preview on hover |
| `window-preview-size` | i | 320 | Preview width in pixels |
| `window-preview-title` | b | true | Show title in preview |
| `show-window-preview-close` | b | false | Show close button on preview |

### 3.6 Multi-monitor

| Key | Type | Default | Mô tả |
|-----|------|---------|-------|
| `isolate-monitors` | b | false | Show only windows from current monitor |
| `isolate-workspaces` | b | false | Show only windows from current workspace |
| `secondarypanel-contain-pointer` | b | true | Secondary panel follows pointer |
| `multi-monitors` | b | true | Show panel on all monitors |

### 3.7 Animation

| Key | Type | Default | Mô tả |
|-----|------|---------|-------|
| `animate-appicon-hover` | b | true | Enable hover animation |
| `animate-appicon-hover-animation-type` | s | 'RIPPLE' | Animation type: RIPPLE, PLANK, SIMPLE |
| `animate-appicon-hover-animation-zoom` | (dict) | {'RIPPLE':1.35, ...} | Zoom factor per type |
| `animate-appicon-hover-animation-duration` | (dict) | {'RIPPLE':225, ...} | Duration (ms) per type |

### 3.8 Media Controller (sub-schema)

Schema: `org.gnome.shell.extensions.advanced-media-controller`

| Key | Type | Default | Mô tả |
|-----|------|---------|-------|
| `panel-position` | s | 'right' | Panel position (left/center/right) |
| `show-player-icons` | b | true | Show player icons |
| `enable-lyrics` | b | false | Enable lyrics display |
| `enable-vinyl` | b | false | Enable vinyl animation |
| `player-blacklist` | as | [] | MPRIS players to hide |

---

## 4. Luồng nghiệp vụ

### 4.1 Extension startup

1. `DashToPanelExtension.enable()` được gọi từ suite
2. Tạo `schemaSource` từ `this.path + '/schemas'` với fallback system
3. Lookup schema: `'org.gnome.shell.extensions.dash-to-panel'` — **hardcoded**
4. Init global `SETTINGS`, `DTP_EXTENSION`, `tracker`
5. Load media controller settings (`_loadMcSettings`)
6. Gọi `PanelSettings.init(SETTINGS)` — load panel configuration
7. Tạo `PanelManager` — quản lý panel instances (1 per monitor)
8. Mỗi panel render: taskbar (AppIcons) + system tray + previews

### 4.2 Panel rendering lifecycle

```
PanelManager
  └── per monitor
       ├── Panel (St.BoxLayout)
       ├── AppIcons
       │    ├── Favorites
       │    ├── Running apps
       │    └── Show Applications
       ├── WindowPreview (on hover)
       ├── Intellihide (auto-hide)
       ├── SecondaryMenu (right-click)
       └── ShowDesktop button
```

### 4.3 Intellihide flow

```
Window state change (maximize, fullscreen, focus)
  → intellihide.js detect
  → if condition met → animate panel out
  → on mouse pressure/edge → animate in
  → on condition cleared → animate back
```

### 4.4 Media controller flow

```
_mediaController.enable()
  → MprisManager (DBus org.mpris.MediaPlayer2.*)
  → Track players → detect current
  → Render controls: play/pause, prev/next, seek, volume
  → Show album art, title, artist
  → Optional: vinyl animation, lyrics
```

---

## 5. Quan hệ với các module khác

- **Global:** Export `global.dashToPanel` (EventEmitter) cho các extension/module khác giao tiếp
- **Topbar Clone:** Có thể conflict nếu cùng quản lý panel vị trí — suite chỉ enable 1 trong 2
- **AATWS:** Window Switcher (Alt+Tab) và DTP window preview là 2 tính năng bổ sung, không xung đột

---

## 6. Cấu hình mặc định

- Panel size: 48px
- Position: BOTTOM
- Group apps: enabled
- Intellihide: disabled
- Show window preview: enabled
- Multi-monitor: enabled
- Animation type: RIPPLE
- Transparency: opaque

---

## 7. Lưu ý kỹ thuật

- **Hardcoded schema:** DTP không dùng `this.getSettings()` — nó tự xây dựng `schemaSource` từ `this.path` và lookup schema ID `'org.gnome.shell.extensions.dash-to-panel'`. Nếu đổi schema ID, cần patch cả 2 chỗ (extension.js + prefs.js).
- **CSS loading:** DTP inject CSS động bằng cách tạo `St.StyleSet` từ file stylesheet.css trong thư mục module.
- **Session mode:** Tự động phát hiện `sessionMode` (user/lock screen/greeter) để ẩn panel khi cần.
- **Media Controller:** Là sub-module được tích hợp trong DTP, có schema `advanced-media-controller` riêng trong `media/schemas/`.

---

## 8. References

- Source gốc: https://github.com/home-sweet-gnome/dash-to-panel
- Schema enum values: 11 enums (appiconStyle, dotStyle, clickAction, scrollAction, position, proximityBehavior, fontWeicht, hotkeyPrefix, hotkeyOverlay, hotkeyNumberKeys, appIconHoverAnimationType)
- Dconf path: `/org/gnome/shell/extensions/dash-to-panel/`
