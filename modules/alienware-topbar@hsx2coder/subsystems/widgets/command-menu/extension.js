import GLib from 'gi://GLib';
import St from 'gi://St';
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

const CommandMenuPopup = GObject.registerClass(
  class CommandMenuPopup extends PanelMenu.Button {
    _init(cmds, settings) {
      super._init(0.5);
      this.commands = cmds;
      this.commandMenuSettings = settings;
      this.redrawMenu();
    }

    loadIcon(icon, style_class) {
      if (typeof icon !== 'string' || !icon.length) return null;
      if (!icon.includes('/'))
        return new St.Icon({ icon_name: icon, style_class });
      if (icon.startsWith('~/') || icon.startsWith("$HOME/"))
        icon = GLib.build_filenamev([GLib.get_home_dir(), icon.substring(icon.indexOf('/'))]);
      const file = Gio.File.new_for_path(icon);
      if (!file.query_exists(null)) return new St.Icon({ style_class });
      const gicon = new Gio.FileIcon({ file });
      return new St.Icon({ gicon, style_class });
    }

    populateMenuItems(menu, cmds, level) {
      cmds.forEach((cmd) => {
        if (cmd.type === 'separator') {
          menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
          return;
        }

        if (!cmd.title) return;

        if (cmd.type === 'label') {
          const sectionLabel = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            style_class: 'section-label-menu-item',
          });

          const label = new St.Label({
            text: cmd.title,
            style_class: 'popup-subtitle-menu-item',
            x_expand: true,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
          });

          label.set_style('font-size: 0.8em; padding: 0em; margin: 0em; line-height: 1em;');
          sectionLabel.actor.set_style('padding-top: 0px; padding-bottom: 0px; min-height: 0;');
          sectionLabel.actor.add_child(label);

          menu.addMenuItem(sectionLabel);
          return;
        }

        if (cmd.type === 'submenu' && level === 0) {
          if (!cmd.submenu) return;
          const submenu = new PopupMenu.PopupSubMenuMenuItem(cmd.title);
          if (cmd.icon) {
            const icon = this.loadIcon(cmd.icon, 'popup-menu-icon');
            if (icon) submenu.insert_child_at_index(icon, 1);
          }
          this.populateMenuItems(submenu.menu, cmd.submenu, level + 1);
          menu.addMenuItem(submenu);
          return;
        }

        if (!cmd.command) return;

        let item = new PopupMenu.PopupBaseMenuItem();
        let icon = this.loadIcon(cmd.icon, 'popup-menu-icon');
        if (icon)
          item.add_child(icon);
        let label = new St.Label({
          text: cmd.title,
          x_expand: true,
          y_align: Clutter.ActorAlign.CENTER
        });
        item.add_child(label);
        item.connect('activate', () => {
          GLib.spawn_command_line_async(cmd.command);
        });
        menu.addMenuItem(item);
      });
    }

    redrawMenu() {
      let menuTitle = this.commands.title ?? "";
      let box = new St.BoxLayout();

      let icon = this.loadIcon(this.commands.icon, 'system-status-icon');
      if (!icon && menuTitle === "") {
        icon = new St.Icon({
          icon_name: 'utilities-terminal-symbolic',
          style_class: 'system-status-icon',
        });
      }
      if (icon) box.add_child(icon);

      let text = new St.Label({
        text: menuTitle,
        y_expand: true,
        y_align: Clutter.ActorAlign.CENTER
      });
      if (icon && menuTitle) {
        text.set_style('padding-right: 7px;');
      }

      box.add_child(text);
      this.add_child(box);

      if ((!Array.isArray(this.commands.menu) || this.commands.menu.length === 0)) {
        this.commands.menu = [{
          title: "Customize This Menu...",
          icon: 'preferences-system-symbolic',
          command: "gnome-extensions prefs alienware-topbar-widgets@hsx2coder"
        }];
      }
      this.populateMenuItems(this.menu, this.commands.menu, 0);
    }
  });

export default class CommandMenuExtension extends Extension {
  constructor(metadata) {
    super(metadata);
    this.cmdMenus = [];
    this._settings = null;
    this._settingsIds = [];
  }

  reloadExtension() {
    this.cmdMenus.forEach(m => m.destroy());
    this.cmdMenus = [];
    this._loadMenus();
  }

  enable() {
    this._settings = this.getSettings();
    this._settingsIds.push(this._settings.connect('changed::restart-counter', () => {
      this.reloadExtension();
    }));
    this._settingsIds.push(this._settings.connect('changed::config-filepath', () => {
      this.reloadExtension();
    }));
    this._loadMenus();
  }

  disable() {
    this._settingsIds.forEach(s => this._settings.disconnect(s));
    this._settingsIds = [];
    this.cmdMenus.forEach(m => m.destroy());
    this.cmdMenus = [];
    this._settings = null;
  }

  _loadMenus() {
    let filePath = this._settings.get_string('config-filepath');
    if (filePath.startsWith('~/')) filePath = GLib.build_filenamev([GLib.get_home_dir(), filePath.substring(2)]);
    const file = Gio.file_new_for_path(filePath);
    const menus = [];
    try {
      let [ok, contents, _] = file.load_contents(null);
      if (!ok) throw Error();
      const decoder = new TextDecoder();
      const json = JSON.parse(decoder.decode(contents));
      if (json instanceof Array && json.length && (json[0] instanceof Array || (json[0] instanceof Object && json[0]['menu'] instanceof Array))) {
        json.forEach(j => menus.push(parseMenu(j)));
      } else {
        menus.push(parseMenu(json));
      }
    } catch (err) {
      if (!file.query_exists(null)) {
        logError(err, `${this.uuid}: failed to parse command menu`);
      }
      menus.push({ menu: [] });
    }

    menus.forEach((menu, i) => {
      const role = `commandMenu2_${i}`;
      if (Main.panel.statusArea[role]) {
        try { Main.panel.statusArea[role].destroy(); } catch (_) {}
        delete Main.panel.statusArea[role];
      }
      const popup = new CommandMenuPopup(menu, this._settings);
      const index = Number.isInteger(+menu.index) ? +menu.index : 1;
      const pos = ['left', 'center', 'right'].includes(menu.position) ? menu.position : 'left';
      Main.panel.addToStatusArea(role, popup, index, pos);
      this.cmdMenus.push(popup);
    });

    function parseMenu(obj) {
      if (obj instanceof Object && obj.menu instanceof Array) {
        return { ...obj, menu: [...obj.menu] };
      } else if (obj instanceof Array) {
        return { menu: [...obj] };
      } else {
        return { menu: [] };
      }
    }
  }
}
