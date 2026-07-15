# Topbar Clone — Module Documentation

> **Vai trỏ:** Clone top bar (clock + system tray) ra màn hình phụ trong multi-monitor setup.

---

## 1. Tổng quan

Trong multi-monitor configuration, GNOME Shell mặc định chỉ hiển thị top bar trên màn hình chính. Topbar Clone tạo bản sao của top bar trên mỗi màn hình phụ.

**Kế thừa từ:** `topbar-clone@hsx2coder` (module tự phát triển)

### 1.1 Tính năng chính

- Clone top bar lên secondary monitors
- Hiển thị clock trên cloned bar
- Hiển thị system tray (Quick Settings) trên cloned bar
- Tuỳ chọn show/hide clock và tray độc lập

### 1.2 Module integration

- **Class:** `TopbarCloneExtension extends Extension`
- **Schema:** Dùng suite schema (không schema riêng)
- **Suite schema keys:** `enable-topbar-clone`, `topbar-clone-show-clock`, `topbar-clone-show-tray`

---

## 2. Cấu hình (suite schema keys)

| Key | Type | Default | Mô tả |
|-----|------|---------|-------|
| `enable-topbar-clone` | b | true | Enable module |
| `topbar-clone-show-clock` | b | true | Show clock on cloned bar |
| `topbar-clone-show-tray` | b | false | Show system tray on cloned bar |

---

## 3. Luồng nghiệp vụ

```
enable()
  → Detect secondary monitors (monitors-changed signal)
  → For each secondary monitor:
    → Create panel clone widget
    → Add clock (St.Label) if enabled
    → Add system tray (quick settings) if enabled
  → On monitor change: re-clone
```

---

## 4. Cấu hình mặc định

- Clock: visible
- System tray: hidden

---

## 5. Lưu ý kỹ thuật

- **Schema:** Module không có schema riêng — dùng suite schema (`org.gnome.shell.extensions.alienware-suite`)
- **Multi-monitor:** Theo dõi `monitors-changed` signal từ `LayoutManager`
- **Style:** Kế thừa style từ native top bar (không cần stylesheet riêng)

---

## 6. References

- Suite schema path: `/org/gnome/shell/extensions/alienware-suite/`
