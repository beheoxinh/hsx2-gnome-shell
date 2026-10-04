import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Adw from 'gi://Adw';
import { gettext } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class GeneralPreferencesPage extends Adw.PreferencesPage {
  static {
    GObject.registerClass({
      GTypeName: 'commandMenu2GeneralPrefs',
    }, this);
  }

  _init(params = {}) {
    const { menus, addMenu, removeMenu, moveMenu, showMenuEditor, refreshConfig, settings, imagesDir, ...args } = params;
    super._init(args);

    this._menus = menus;
    this._removeMenu = removeMenu;
    this._moveMenu = moveMenu;
    this._showMenuEditor = showMenuEditor;
    this._settings = settings;
    this._imagesDir = imagesDir;

    const group0 = new Adw.PreferencesGroup();
    const description = new Gtk.Label({
      label: gettext('Welcome to Command Menu 2! Use this app to create, remove and customize your menus - or try one of our templates.'),
      wrap: true
    });
    description.get_style_context().add_class('dim-label');
    group0.add(description);

    const group = new Adw.PreferencesGroup({ title: gettext("Configuration File:") });
    const editManuallyBox = new Gtk.Box({
      orientation: Gtk.Orientation.HORIZONTAL,
      spacing: 6,
      halign: Gtk.Align.FILL,
      hexpand: true
    });

    const editConfigButton = new Gtk.Button({
      halign: Gtk.Align.START,
      label: gettext('Edit Manually'),
    });
    editConfigButton.connect("clicked", () => {
      let path = this._settings.get_string('config-filepath');
      if (path.startsWith('~/'))
        path = GLib.build_filenamev([GLib.get_home_dir(), path.substring(2)]);
      const file = Gio.File.new_for_path(path);
      const defaultTextApp = Gio.AppInfo.get_default_for_type('text/plain', false);
      if (defaultTextApp) {
        defaultTextApp.launch([file], null);
      } else {
        Gio.AppInfo.launch_default_for_uri(file.get_uri(), null);
      }
    });
    editManuallyBox.append(editConfigButton);

    const refreshConfigBtn = new Gtk.Button({ icon_name: 'view-refresh-symbolic', halign: Gtk.Align.START });
    refreshConfigBtn.set_tooltip_text(gettext("Refresh from configuration file"));
    refreshConfigBtn.connect('clicked', () => refreshConfig());
    editManuallyBox.append(refreshConfigBtn);

    const configPathEntry = new Gtk.Entry({
      hexpand: true,
      editable: false,
      text: this._settings.get_string('config-filepath'),
    });
    configPathEntry.get_style_context().add_class('gtk-disabled');
    editManuallyBox.append(configPathEntry);

    const changeConfigFilepathBtn = new Gtk.Button({ icon_name: 'document-edit-symbolic', halign: Gtk.Align.END });
    changeConfigFilepathBtn.set_tooltip_text(gettext("Change configuration file location"));
    changeConfigFilepathBtn.connect('clicked', () => {
      const dialog = new Gtk.FileChooserDialog({
        title: "Select Command Menu Config",
        action: Gtk.FileChooserAction.SAVE,
        transient_for: this.get_root(),
        modal: true,
        default_width: 650,
        default_height: 500,
      });
      dialog.add_button("_Cancel", Gtk.ResponseType.CANCEL);
      dialog.add_button("_Select", Gtk.ResponseType.OK);
      let filepath = this._settings.get_string('config-filepath');
      if (filepath.startsWith('~/'))
        filepath = GLib.build_filenamev([GLib.get_home_dir(), filepath.substring(2)]);
      const filename = GLib.path_get_basename(filepath);
      const dir = GLib.path_get_dirname(filepath);
      dialog.set_current_folder(Gio.File.new_for_path(dir));
      dialog.set_current_name(filename);
      dialog.connect('response', (dlg, response) => {
        if (response === Gtk.ResponseType.OK) {
          const file = dialog.get_file();
          const path = file.get_path();
          this._settings.set_string('config-filepath', path);
          configPathEntry.set_text(path);
          GLib.file_set_contents(path, JSON.stringify(this._menus, null, 2));
          refreshConfig();
        }
        dlg.destroy();
      });
      dialog.show();
    });
    editManuallyBox.append(changeConfigFilepathBtn);

    group.add(editManuallyBox);

    const group3 = new Adw.PreferencesGroup({ title: gettext("Templates:") });
    const templates = [
      {
        name: "Simple Apps Menu",
        image: "icons/simplemenu.jpg",
        sourceFile: "examples/simplemenu.json",
        description: "Browser, files and terminal. That's it!",
      },
      {
        name: "Apple Menu",
        image: "icons/applemenu.jpg",
        sourceFile: "examples/applemenu.json",
        description: "An Apple-inspired menu... on Linux.",
      },
      {
        name: "Files Menu",
        image: "icons/filesmenu.jpg",
        sourceFile: "examples/filesmenu.json",
        description: "Access your important files/folders.",
      },
      {
        name: "Penguin Menu",
        image: "icons/penguinmenu.jpg",
        sourceFile: "examples/penguinmenu.json",
        description: "It has a penguin! And lots more.",
      },
      {
        name: "System Menu",
        image: "icons/systemmenu.jpg",
        sourceFile: "examples/systemmenu.json",
        description: "Some system utilities and settings.",
      },
    ];
    const templatesFlowBox = new Gtk.FlowBox({
      selection_mode: Gtk.SelectionMode.NONE,
      row_spacing: 6,
    });
    for (const template of templates) {
      const vbox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 6,
        margin_bottom: 10
      });
      const imagePath = GLib.build_filenamev([this._imagesDir, template.image]);
      const img = Gtk.Image.new_from_file(imagePath);
      img.set_pixel_size(200);
      vbox.append(img);

      const label = new Gtk.Label({
        label: template.name,
        halign: Gtk.Align.CENTER,
      });
      label.add_css_class("heading");
      vbox.append(label);

      const descBox = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        halign: Gtk.Align.CENTER,
        hexpand: false,
        margin_top: 4,
      });
      const desc = new Gtk.Label({
        wrap: true,
        label: template.description || 'No description provided.',
        halign: Gtk.Align.CENTER,
      });
      desc.set_justify(Gtk.Justification.CENTER);
      desc.add_css_class("caption");
      descBox.set_size_request(180, -1);
      descBox.append(desc);
      vbox.append(descBox);

      const button = new Gtk.Button();
      button.set_child(vbox);
      button.set_tooltip_text(gettext("Apply this template"));
      button.connect("clicked", () => {
        const dialog = new Gtk.MessageDialog({
          modal: true,
          transient_for: this.get_root(),
          message_type: Gtk.MessageType.QUESTION,
          buttons: Gtk.ButtonsType.OK_CANCEL,
          text: gettext(`Add template "${template.name}" as a new menu?`),
        });
        dialog.connect("response", (d, response) => {
          if (response === Gtk.ResponseType.OK) {
            const templateDir = GLib.path_get_dirname(this._imagesDir);
            const templatePath = GLib.build_filenamev([templateDir, template.sourceFile]);
            const contents = GLib.file_get_contents(templatePath)[1];
            const decoder = new TextDecoder();
            const json = JSON.parse(decoder.decode(contents));
            addMenu(json);
          }
          d.destroy();
        });
        dialog.show();
      });
      templatesFlowBox.insert(button, -1);
    }
    group3.add(templatesFlowBox);

    this.add(group0);
    this.add(group);
    this.add(group3);
  }

  updateMenus() {
    // Menu list moved to Menu Context tab — no-op here
  }
}
