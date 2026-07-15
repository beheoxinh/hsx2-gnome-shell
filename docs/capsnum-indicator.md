# Caps/Num Indicator (Legacy) — Module Documentation

> **Vai trò:** Hiển thị trạng thái Caps Lock và Num Lock trên top bar.

> ⚠️ **Legacy module:** Đã được thay thế bởi `capsnum-touchpad` module. Vẫn giữ lại vì backward compatibility, nhưng không được đăng ký trong suite.

---

## 1. Tổng quan

Indicator đơn giản hiển thị Caps Lock và Num Lock state trên GNOME Shell panel.

**Kế thừa từ:** `capsnum-indicator@felipeaupizetta`

### 1.1 Tính năng

- Caps Lock icon (hiện/ẩn theo state)
- Num Lock icon (hiện/ẩn theo state)
- Notification khi state thay đổi
- Hide khi lock off

### 1.2 Module integration

- **Class:** `CapsNumExtension extends Extension`
- **Panel widget:** `Indicator extends PanelMenu.Button`
- **Trạng thái:** Không trong suite MODULES (không được suite auto-load)

---

## 2. GSchema Keys

Schema: `org.gnome.shell.extensions.capsnum-indicator` (4 keys)

| Key | Type | Default | Mô tả |
|-----|------|---------|-------|
| `show-caps-lock` | b | true | Show Caps Lock indicator |
| `show-num-lock` | b | true | Show Num Lock indicator |
| `hide-when-off` | b | true | Hide when lock off |
| `show-notifications` | b | true | Show notification |

---

## 3. References

- Dconf path: `/org/gnome/shell/extensions/capsnum-indicator/`
- Source: https://github.com/felipepizetta/capsnum-indicator
