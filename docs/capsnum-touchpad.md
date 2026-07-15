# Caps/Num and Touchpad — Module Documentation

> **Vai trò:** Combined indicator cho Caps Lock, Num Lock + Touchpad on-off toggle trong Quick Settings.

---

## 1. Tổng quan

Module kết hợp 2 tính năng: hiển thị trạng thái Caps Lock/Num Lock trên top bar + toggle touchpad on/off trong GNOME Quick Settings menu.

Đây là module hợp nhất từ 2 legacy modules (`capsnum-indicator` + `touchpad`).

### 1.1 Tính năng chính

- Caps Lock indicator trên panel
- Num Lock indicator trên panel
- Touchpad toggle trong Quick Settings (hoặc panel indicator)
- Notification khi lock state thay đổi
- Custom toggle shortcut
- Hide khi lock off (tuỳ chọn)

### 1.2 Module integration

- **Class:** `CapsNumTouchpadExtension extends Extension`
- **Panel widget:** `PanelMenu.Button`
- **Quick Settings:** `SystemIndicator` cho touchpad toggle

---

## 2. GSchema Keys

Schema: `org.gnome.shell.extensions.capsnum-touchpad` (6 keys)

| Key | Type | Default | Mô tả |
|-----|------|---------|-------|
| `show-caps-lock` | b | true | Show Caps Lock indicator |
| `show-num-lock` | b | true | Show Num Lock indicator |
| `hide-when-off` | b | true | Hide indicator when lock is off |
| `show-notifications` | b | true | Show notification on lock toggle |
| `show-indicator` | b | true | Show touchpad state indicator in panel |
| `toggle-shortcut` | as | ['<Super>Insert', 'XF86TouchpadToggle'] | Touchpad toggle keybindings |

---

## 3. Luồng nghiệp vụ

### 3.1 Lock detection

```
enable()
  → this.getSettings()
  → Create CapsNumIndicator (PanelMenu.Button)
  → Connect to Clutter.KeyboardManager signal
  → On keyboard layout change: query lock states
  → Update panel icon: active/inactive + hide if off
  → Optional notification on state change
```

### 3.2 Touchpad toggle

```
User toggles via Quick Settings or keyboard shortcut
  → _toggleTouchpad()
  → Read current touchpad state from Mutter settings
  → Toggle: enable/disable
  → Update indicator icon
  → Notification (optional)
```

---

## 4. Cấu hình mặc định

- Both Caps/Num indicators: enabled
- Hide when off: enabled
- Notifications: enabled
- Show panel indicator: enabled
- Toggle shortcuts: Super+Insert, XF86TouchpadToggle

---

## 5. Lưu ý kỹ thuật

- **Schema:** Schema riêng (không dùng suite schema)
- **Touchpad state:** Đọc từ `org.gnome.desktop.peripherals.touchpad` send-events key
- **Quick Settings:** Dùng `SystemIndicator` pattern của GNOME Shell 45+
- **Combined module:** Thay thế cả capsnum-indicator và touchpad standalone

---

## 6. References

- Dconf path: `/org/gnome/shell/extensions/capsnum-touchpad/`
