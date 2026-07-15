# Touchpad Switcher (Legacy) — Module Documentation

> **Vai trò:** Toggle touchpad on/off từ Quick Settings menu.

> ⚠️ **Legacy module:** Đã được thay thế bởi `capsnum-touchpad` module. Vẫn giữ lại vì backward compatibility, nhưng không được đăng ký trong suite.

---

## 1. Tổng quan

Cung cấp toggle switch cho touchpad trong GNOME Shell Quick Settings (hoặc panel indicator).

**Kế thừa từ:** `touchpad@gpawru`

### 1.1 Tính năng

- Quick Settings toggle cho touchpad
- Panel indicator (tuỳ chọn)
- Notification on toggle (tuỳ chọn)
- Customizable keyboard shortcut
- Integration với Mutter touchpad settings

### 1.2 Module integration

- **Class:** `QuickTouchpadToggleExtension extends Extension`
- **Quick Settings:** `QuickToggle` pattern
- **Trạng thái:** Không trong suite MODULES

---

## 2. GSchema Keys

Schema: `org.gnome.shell.extensions.touchpad_gpawru` (3 keys)

| Key | Type | Default | Mô tả |
|-----|------|---------|-------|
| `show-indicator` | b | true | Show indicator in panel |
| `show-notifications` | b | true | Show notification on toggle |
| `toggle-shortcut` | as | ['<Super>Insert', 'XF86TouchpadToggle'] | Shortcut để toggle |

---

## 3. Luồng nghiệp vụ

```
enable()
  → this.getSettings()
  → Create QuickSettings toggle
  → Connect to Mutter touchpad settings
  → On click: toggle send-events
  → Update toggle state
  → Optional notification
```

---

## 4. References

- Dconf path: `/org/gnome/shell/extensions/touchpad_gpawru/`
- Source: https://github.com/gpawru/touchpad
