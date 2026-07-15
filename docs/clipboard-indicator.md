# Clipboard Indicator — Module Documentation

> **Vai trò:** Trình quản lý clipboard mạnh mẽ với history, favorites, search, private mode.

---

## 1. Tổng quan

Lưu trữ và quản lý lịch sử clipboard, cho phép search, pin, delete, private mode, và paste trực tiếp từ menu panel.

**Kế thừa từ:** `clipboard-indicator@tudmotu.com`

### 1.1 Tính năng chính

- Clipboard history: lưu X clipboard selections
- Search: filter history items
- Pin/Unpin items
- Private mode: tạm thời không ghi clipboard
- Keyboard shortcuts: toggle menu, next/prev, clear history, private mode toggle
- Image caching: hiển thị clipboard images trong menu
- Strip text: tự động strip whitespace khi paste
- Clear history: manual + auto-clear interval
- Notifications: khi copy/cycle/clear

### 1.2 Module integration

- **Class:** `ClipboardIndicatorExtension extends Extension`
- **Panel widget:** `ClipboardIndicator extends PanelMenu.Button`
- **Internal state:** Global variables (ENABLE_KEYBINDING, PRIVATEMODE, etc.) từ constants.js
- **Registry:** File `registry.js` quản lý lịch sử clipboard

---

## 2. GSchema Keys

Schema: `org.gnome.shell.extensions.clipboard-indicator` (44 keys)

### 2.1 Core display

| Key | Type | Default | Mô tả |
|-----|------|---------|-------|
| `display-mode` | i | 0 | Topbar display: 0=icon only, 1=content, 2=both, 3=neither |
| `topbar-preview-size` | i | 10 | Max chars for topbar preview |
| `preview-size` | i | 10 | Max chars for preview in menu |
| `disable-down-arrow` | b | true | Hide down arrow icon |

### 2.2 History management

| Key | Type | Default | Mô tả |
|-----|------|---------|-------|
| `history-size` | i | 20 | Max items in history |
| `cache-size` | i | 3 | Max cached images |
| `cache-images` | b | true | Cache clipboard images |
| `strip-text` | b | true | Strip whitespace from copied text |
| `clear-on-boot` | b | true | Clear history on shell restart |
| `clear-history-on-interval` | b | false | Auto-clear history periodically |
| `clear-history-interval` | i | 60 | Auto-clear interval (minutes) |

### 2.3 Behavior

| Key | Type | Default | Mô tả |
|-----|------|---------|-------|
| `paste-on-select` | b | false | Auto-paste when selecting item |
| `paste-button` | b | true | Show paste button per item |
| `move-item-first` | b | true | Move reused item to top |
| `confirm-clear` | b | true | Confirm before clearing all |
| `enable-keybindings` | b | true | Enable custom keybinding |

### 2.4 Private mode

| Key | Type | Default | Mô tả |
|-----|------|---------|-------|
| `show-private-mode` | b | true | Show private mode toggle in menu |
| `private-mode-binding` | as | ['<Control>F8'] | Private mode toggle shortcut |

### 2.5 Keybindings

| Key | Type | Default | Mô tả |
|-----|------|---------|-------|
| `toggle-menu` | as | ['<Control>F9'] | Show/hide clipboard menu |
| `next-entry` | as | ['<Control>F12'] | Next item |
| `prev-entry` | as | ['<Control>F11'] | Previous item |
| `clear-history` | as | ['<Control>F10'] | Clear history |

### 2.6 UI toggles

| Key | Type | Default | Mô tả |
|-----|------|---------|-------|
| `show-search-bar` | b | true | Show search/filter bar |
| `show-settings-button` | b | true | Show settings button |
| `show-clear-history-button` | b | true | Show clear button |
| `show-preview-button` | b | true | Show preview toggle |
| `show-edit-button` | b | true | Show edit button |
| `show-tag-button` | b | true | Show tag button |
| `show-pin-button` | b | true | Show pin button |
| `show-delete-button` | b | true | Show delete button |

---

## 3. Luồng nghiệp vụ

### 3.1 Clipboard monitoring

```
St.Clipboard signal 'owner-changed'
  → _onClipboardChanged()
  → store clipboard content
  → add to history (in-memory + disk cache)
  → update menu items
  → optional notification
```

### 3.2 Menu interaction

```
User clicks panel icon
  → ClipboardIndicator menu opens
  → render history items (text + images)
  → user clicks item
  → set clipboard + optional paste
  → close menu
```

### 3.3 Private mode

```
User toggles private mode (keybinding or menu)
  → PRIVATEMODE = true
  → panel icon changes (cross/closed indicator)
  → clipboard changes NOT recorded
  → toggle again to exit private mode
```

---

## 4. Cấu hình mặc định

- Display mode: icon only
- History size: 20 items
- Cache size: 3 images
- Paste on select: false
- Strip text: true
- Clear on boot: true
- Private mode keybinding: Ctrl+F8
- Menu toggle: Ctrl+F9

---

## 5. Lưu ý kỹ thuật

- **Cache file path:** `~/.cache/clipboard-indicator/`
- **Max image size:** giới hạn cache-size để tránh memory leak
- **Cogl image rendering:** Dùng `Cogl.PixelBuffer` để render clipboard images
- **Signal chaining:** Dùng signal ID để disconnect, tránh double-bind after disable/enable

---

## 6. References

- Dconf path: `/org/gnome/shell/extensions/clipboard-indicator/`
- Source gốc: https://github.com/Tudmotu/gnome-shell-extension-clipboard-indicator
