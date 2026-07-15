# Command Menu 2 — Module Documentation

> **Vai trỏ:** Custom dropdown menus trên top bar với nội dung cấu hình qua JSON file.

---

## 1. Tổng quan

Cho phép tạo menu dropdown tuỳ chỉnh trên GNOME Shell top panel, hiển thị danh sách các mục lệnh (run command, open URL, submenu separator).

**Kế thừa từ:** `command-menu2@goldentree1.github.com`

### 1.1 Tính năng chính

- Custom menu với submenus
- Menu items: run shell command, open URL, separator, submenu
- Cấu hình qua JSON file
- Nhiều menu profiles
- Icons per item
- Keyboard accelerators

### 1.2 Module integration

- **Class:** `CommandMenuExtension extends Extension`
- **Panel widget:** `PanelMenu.Button` — mỗi menu là một button riêng
- **Config file:** JSON file trong home directory

---

## 2. GSchema Keys

Schema: `org.gnome.shell.extensions.commandmenu2` (2 keys)

| Key | Type | Default | Mô tả |
|-----|------|---------|-------|
| `config-filepath` | s | '~/.commands.json' | Path to JSON config file |
| `restart-counter` | i | 97 | Internal counter for reload tracking |

### 2.1 Config file format (example)

```json
{
  "menus": [
    {
      "title": "System",
      "icon": "computer-symbolic",
      "items": [
        { "label": "Terminal", "icon": "utilities-terminal-symbolic", "command": "ptyxis" },
        { "label": "Files", "icon": "folder-symbolic", "command": "nautilus" },
        { "type": "separator" },
        { "label": "Monitor", "icon": "utilities-system-monitor-symbolic", "command": "gnome-system-monitor" }
      ]
    },
    {
      "title": "Dev",
      "icon": "applications-engineering-symbolic",
      "items": [
        { "label": "VS Code", "command": "code" },
        { "label": "Git", "items": [
          { "label": "Status", "command": "gnome-terminal -- ptyxis -e 'git status'" },
          { "label": "Log", "command": "gnome-terminal -- ptyxis -e 'git log --oneline'" }
        ]}
      ]
    }
  ]
}
```

---

## 3. Cấu hình mặc định

- Config file: `~/.commands.json`
- Không có menu mặc định (cần tạo file config)

---

## 4. Lưu ý kỹ thuật

- **File watching:** Dùng `Gio.FileMonitor` để auto-reload khi config file thay đổi
- **Restart counter:** Incremented on each schema change, dùng để detect reload

---

## 5. References

- Dconf path: `/org/gnome/shell/extensions/commandmenu2/`
