# Notification Configurator — Module Documentation

> **Vai trò:** Tuỳ biến toàn diện hành vi notification của GNOME Shell: timeout, vị trí, fullscreen, rate limiting, custom colors, blocking.

---

## 1. Tổng quan

Module cho phép kiểm soát hoàn toàn how notifications hiển thị và hoạt động trong GNOME Shell.

**Kế thừa từ:** `notification-configurator@exposedcat`

### 1.1 Tính năng chính

- Notification timeout: auto-close sau N ms
- Notification positioning: left, center, right
- Full-screen behavior: allow/block notifications
- Rate limiting: ngăn spam notifications
- Custom colors: per-app background, title, body, time colors
- Block list: block notifications from specific apps
- Urgency control: always normal urgency
- Idle detection: bỏ qua timeout khi idle
- Migration system: update schema version
- Window attention: auto-activate window instead of notification

### 1.2 Module integration

- **Class:** `NotificationConfiguratorExtension extends Extension`
- **Managers:** `shell/notifications.js`, `managers/` sub-directories
- **Settings:** `utils/settings.js` — SettingsManager wrapper
- **Theme:** `utils/themes.js` — custom color theme management

---

## 2. GSchema Keys

Schema: `org.gnome.shell.extensions.notification-configurator` (13 keys)

| Key | Type | Default | Mô tả |
|-----|------|---------|-------|
| `global` | s | JSON | Master settings JSON blob (chứa tất cả cấu hình) |
| `enable-filtering` | b | true | Enable notification filtering |
| `block-list` | s | '[]' | Blocked app IDs |
| `patterns` | s | '[]' | Regex patterns for blocking |
| `notification-timeout` | i | 4000 | Notification auto-close timeout (ms) |
| `notification-threshold` | i | 5000 | Rate limit threshold (ms) |
| `notification-position` | s | 'center' | Position: left, center, right |
| `enable-fullscreen` | b | false | Allow notifications in fullscreen |
| `enable-rate-limiting` | b | true | Enable rate limiting |
| `enable-custom-colors` | b | true | Enable custom color themes |
| `app-themes` | s | '{}' | Per-app color theme JSON |
| `ignore-idle` | b | true | Ignore timeout when idle |
| `always-normal-urgency` | b | false | Force all notifications to normal urgency |

### 2.1 Global JSON structure

```json
{
    "enabled": true,
    "notificationCenter": {
        "disableGrouping": false,
        "maximumPerSource": 5
    },
    "rateLimiting": {
        "enabled": true,
        "notificationThreshold": 5000,
        "action": "close"
    },
    "timeout": {
        "enabled": true,
        "notificationTimeout": 3000,
        "ignoreIdle": true
    },
    "urgency": {
        "alwaysNormalUrgency": true
    },
    "display": {
        "enableFullscreen": true,
        "notificationPosition": "right",
        "verticalPosition": "top",
        "hideAppTitleRow": false
    },
    "colors": {
        "enabled": true,
        "theme": { ... }
    },
    "windowAttention": {
        "activateInstead": true
    }
}
```

---

## 3. Luồng nghiệp vụ

### 3.1 Notification interceptor

```
enable()
  → Hook into GNOME Shell notification system (MessageTray)
  → Override _onNotificationAdded
  → For each notification:
       → Apply filter (block list, patterns)
       → Apply rate limiting (check interval)
       → Apply timeout (auto-close timer)
       → Apply custom colors (CSS injection)
       → Apply position (CSS transform)
       → Show/dismiss based on fullscreen state
```

### 3.2 Rate limiting

```
App sends N notifications rapidly
  → Notification Configurator tracks last time per app
  → If interval < threshold → close notification silently
  → Optional: queue until threshold cleared
```

---

## 4. Cấu hình mặc định

- Timeout: 4000ms
- Position: center
- Fullscreen: blocked
- Rate limiting: enabled, 5000ms threshold
- Custom colors: enabled
- Idle ignore: enabled
- Urgency: normal

---

## 5. Lưu ý kỹ thuật

- **Migration:** `migrations/regex.js` quản lý schema version upgrades
- **CSS injection:** Dùng dynamic style element trong GNOME Shell
- **Event base:** Hook vào `source-added` signal của MessageTray
- **Theming:** Màu sắc lưu dưới dạng RGBA normalized (0.0–1.0)

---

## 6. References

- Dconf path: `/org/gnome/shell/extensions/notification-configurator/`
- Source: https://github.com/ExposedCat/gnome-notification-configurator
