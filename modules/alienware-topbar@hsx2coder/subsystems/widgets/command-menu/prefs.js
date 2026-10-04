import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import { ExtensionPreferences, gettext } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import CommandsUI from './prefsCommandsUI.js';
import GeneralPreferencesPage from './prefsGeneralUI.js';

export default class CommandMenuExtensionPreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    window.set_default_size(750, 850);

    const settings = this.getSettings();
    const menus = [];
    let menuEditorPages = [];

    loadConfig();

    const imagesDir = this.metadata.dir.get_path();

    function addMenuFn(template = null) {
      mutateMenus(m => {
        const addMe = template || {
          menu: [],
          title: `Menu ${m.length + 1}`,
          icon: 'utilities-terminal',
          position: 'left'
        };
        m.push(addMe);
      });
    }

    const generalPage = new GeneralPreferencesPage({
      title: gettext('Menu'),
      icon_name: 'preferences-system-symbolic',
      menus: menus,
      settings: settings,
      imagesDir: imagesDir,
      addMenu: addMenuFn,
      removeMenu: (rmIdx) => {
        mutateMenus(m => {
          m.splice(rmIdx, 1);
        });
      },
      moveMenu: (from, to) => {
        mutateMenus(m => {
          const temp = m[from];
          m[from] = m[to];
          m[to] = temp;
        });
      },
      showMenuEditor: (idx) => {
        window.set_visible_page(menuEditorPages[idx]);
      },
      refreshConfig: () => {
        mutateMenus(m => {
          m.length = 0;
          loadConfig();
        }, false);
        updateMenuList();
      }
    });

    window.add(generalPage);

    // Menu group inside General page — lists menus, each Edit opens in dialog
    const menuContextGroup = new Adw.PreferencesGroup({
        title: gettext('Menu Context'),
        description: gettext('Manage menu entries. Click Edit to customize each menu.'),
    });
    let menuContextListBox = new Gtk.ListBox({
        selection_mode: Gtk.SelectionMode.NONE,
    });
    menuContextListBox.add_css_class('boxed-list');
    menuContextGroup.add(menuContextListBox);

    const addMenuBtn = new Gtk.Button({
        label: gettext('Add Menu'),
        icon_name: 'document-new-symbolic',
        halign: Gtk.Align.START,
        margin_bottom: 6,
    });
    addMenuBtn.connect('clicked', () => {
        addMenuFn();
    });
    menuContextGroup.set_header_suffix(addMenuBtn);
    generalPage.add(menuContextGroup);

    if (menus.length) refreshMenuEditorPages();
    window.set_visible_page(generalPage);
    updateMenuList();

    function loadConfig() {
      let filePath = settings.get_string('config-filepath');
      if (filePath.startsWith('~/'))
        filePath = GLib.build_filenamev([GLib.get_home_dir(), filePath.substring(2)]);
      const file = Gio.file_new_for_path(filePath);

      if (!file.query_exists(null)) {
        try {
          GLib.file_set_contents(filePath, JSON.stringify([{ icon: "utilities-terminal-symbolic", menu: [] }]));
        } catch (err) {
          logError(err, 'Failed to create default configuration file');
        }
      }

      try {
        let [ok, contents, _] = file.load_contents(null);
        if (!ok) throw Error();
        const decoder = new TextDecoder();
        const json = JSON.parse(decoder.decode(contents));
        if (
          json instanceof Array &&
          json.length &&
          (json[0] instanceof Array || (json[0] instanceof Object && json[0]['menu'] instanceof Array))
        ) {
          json.forEach(j => menus.push(parseMenu(j)));
        } else {
          menus.push(parseMenu(json));
        }
      } catch (e) {
        showConfigErrorDialog();
      }
    }

    function mutateMenus(mutateFn, saveToConfig = true) {
      const ogMenus = [...menus];
      mutateFn(menus);
      generalPage.updateMenus();
      refreshMenuEditorPages();
      updateMenuList();
      refreshExtension();
      window.set_visible_page(generalPage);

      if (saveToConfig) {
        try {
          const json = JSON.stringify(menus, null, 2);
          let filePath = settings.get_string('config-filepath');
          if (filePath.startsWith('~/'))
            filePath = GLib.build_filenamev([GLib.get_home_dir(), filePath.substring(2)]);
          GLib.file_set_contents(filePath, json);
        } catch (err) {
          logError(err.uuid, 'failed to save menus to configuration file', err);
          menus.length = 0;
          menus.push(...ogMenus);
          generalPage.updateMenus();
          refreshExtension();
          refreshMenuEditorPages();
          window.set_visible_page(generalPage);
        }
      }
    }

    function refreshExtension() {
      let rc = settings.get_int('restart-counter');
      settings.set_int('restart-counter', rc + 1);
    }

    function refreshMenuEditorPages() {
      menuEditorPages.forEach(p => {
        try {
          if (p && typeof p.destroy === 'function') p.destroy();
        } catch (_) {}
      });
      menuEditorPages = menus.map((m, i) => new CommandsUI({
        title: gettext(`Menu ${i + 1}`),
        icon_name: 'document-edit-symbolic',
        menus: menus,
        menuIdx: i,
        settings: settings,
      }));
    }

    function updateMenuList() {
      menuContextGroup.remove(menuContextListBox);
      menuContextListBox = new Gtk.ListBox({
        selection_mode: Gtk.SelectionMode.NONE,
      });
      menuContextListBox.add_css_class('boxed-list');
      menuContextGroup.add(menuContextListBox);

      for (let i = 0; i < menus.length; i++) {
        const row = new Adw.ActionRow({
          title: `Menu ${i + 1}`,
          subtitle: menus[i].title || '(no title)',
        });
        const editBtn = new Gtk.Button({
          label: gettext('Edit'),
          valign: Gtk.Align.CENTER,
        });
        editBtn.connect('clicked', () => showMenuDialog(i));
        row.add_suffix(editBtn);

        // Delete button for this menu
        const delBtn = new Gtk.Button({
          icon_name: 'user-trash-symbolic',
          valign: Gtk.Align.CENTER,
          has_frame: false,
          tooltip_text: gettext('Delete Menu'),
        });
        delBtn.add_css_class('destructive-action');
        delBtn.connect('clicked', () => {
          if (menus.length <= 1) {
            // Keep at least one menu or clear contents
            mutateMenus(m => {
              m[0] = {
                title: 'Menu 1',
                icon: 'utilities-terminal',
                position: 'left',
                menu: []
              };
            });
          } else {
            mutateMenus(m => {
              m.splice(i, 1);
            });
          }
        });
        row.add_suffix(delBtn);

        menuContextListBox.append(row);
      }
    }

    function showMenuDialog(idx) {
      const page = menuEditorPages[idx];
      if (!page) return;
      const rootWin = (window && typeof window.get_root === 'function') ? window.get_root() : (window instanceof Gtk.Window ? window : null);
      const dialog = new Adw.PreferencesWindow({
        transient_for: rootWin,
        modal: true,
        title: `Menu ${idx + 1}`,
        default_width: 650,
        default_height: 600,
      });
      dialog.add(page);
      dialog.present();
      dialog.connect('close-request', () => {
        // refresh list in case user edited title
        updateMenuList();
        return false;
      });
    }

    function showConfigErrorDialog() {
      const rootWin = (window && typeof window.get_root === 'function') ? window.get_root() : (window instanceof Gtk.Window ? window : null);
      const dialog = new Gtk.MessageDialog({
        transient_for: rootWin,
        modal: true,
        buttons: Gtk.ButtonsType.YES_NO,
        message_type: Gtk.MessageType.ERROR,
        text: gettext("Configuration error!"),
        secondary_text: gettext(`Your configuration could not be parsed from '${settings.get_string('config-filepath')}'. Would you like to reset configuration?`)
      });
      dialog.connect('response', (d, response) => {
        if (response === Gtk.ResponseType.YES) {
          try {
            const filePath = settings.get_string('config-filepath');
            GLib.file_set_contents(filePath, JSON.stringify([{ icon: "utilities-terminal-symbolic", menu: [] }]), -1);
            d.destroy();
            refreshExtension();
            const restartDialog = new Gtk.MessageDialog({
              transient_for: rootWin,
              modal: true,
              buttons: Gtk.ButtonsType.OK,
              message_type: Gtk.MessageType.INFO,
              text: gettext("Please restart Preferences"),
              secondary_text: gettext("The configuration has been reset. Please close and reopen preferences to continue.")
            });
            restartDialog.connect('response', d2 => d2.destroy());
            restartDialog.show();
          } catch (err) {
            logError(err, `Failed to reset configuration file at "${settings.get_string('config-filepath')}".`);
          }
        }
        d.destroy();
      });
      dialog.show();
    }

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
