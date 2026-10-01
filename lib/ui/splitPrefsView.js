import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

/**
 * Reusable Master-Detail Preferences Layout using Adw.NavigationSplitView.
 * Provides a left-hand navigation list and right-hand content area.
 * Adaptively collapses into drill-down pages on smaller window widths.
 */
export class SplitPreferencesView {
    /**
     * @param {Object} params
     * @param {string} [params.title] Title for the root page/window
     * @param {Array<Object>} params.sections
     *   Each section: {
     *     id: string,
     *     title: string,
     *     iconName?: string,
     *     page?: Adw.PreferencesPage | Gtk.Widget,
     *     buildContent?: () => (Adw.PreferencesPage | Gtk.Widget)
     *   }
     */
    constructor(params = {}) {
        this._title = params.title || 'Preferences';
        this._sections = params.sections || [];
        this._splitView = null;
        this._sidebarList = null;
        this._contentStack = null;
        this._contentHeader = null;
        this._rows = [];
    }

    /**
     * Build and return the root widget (Adw.NavigationSplitView)
     * @returns {Adw.NavigationSplitView}
     */
    createWidget() {
        this._splitView = new Adw.NavigationSplitView({
            min_sidebar_width: 220,
            max_sidebar_width: 280,
            sidebar_width_fraction: 0.28,
        });

        // 1. Sidebar Page
        const sidebarPage = new Adw.NavigationPage({
            title: this._title,
            tag: 'sidebar',
        });

        const sidebarToolbarView = new Adw.ToolbarView();
        const sidebarHeader = new Adw.HeaderBar({
            title_widget: new Adw.WindowTitle({
                title: this._title,
            }),
        });
        sidebarToolbarView.add_top_bar(sidebarHeader);

        const sidebarScrolled = new Gtk.ScrolledWindow({
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
        });

        const sidebarBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            margin_start: 12,
            margin_end: 12,
            margin_top: 12,
            margin_bottom: 12,
            spacing: 8,
        });

        this._sidebarList = new Gtk.ListBox({
            css_classes: ['navigation-sidebar'],
            selection_mode: Gtk.SelectionMode.SINGLE,
        });

        sidebarBox.append(this._sidebarList);
        sidebarScrolled.set_child(sidebarBox);
        sidebarToolbarView.set_content(sidebarScrolled);
        sidebarPage.set_child(sidebarToolbarView);
        this._splitView.set_sidebar(sidebarPage);

        // 2. Content Page & Stack
        const contentNavPage = new Adw.NavigationPage({
            title: this._title,
            tag: 'content',
        });

        this._contentStack = new Adw.ViewStack();

        const contentToolbarView = new Adw.ToolbarView();
        this._contentHeader = new Adw.HeaderBar({
            title_widget: new Adw.WindowTitle({
                title: this._sections[0]?.title || this._title,
            }),
        });
        contentToolbarView.add_top_bar(this._contentHeader);
        contentToolbarView.set_content(this._contentStack);
        contentNavPage.set_child(contentToolbarView);
        this._splitView.set_content(contentNavPage);

        // Populate sections
        this._rows = [];
        for (let i = 0; i < this._sections.length; i++) {
            const sec = this._sections[i];
            const row = new Adw.ActionRow({
                activatable: true,
                use_markup: false,
            });
            row.set_title(sec.title);

            if (sec.iconName) {
                const icon = new Gtk.Image({
                    icon_name: sec.iconName,
                    pixel_size: 16,
                });
                row.add_prefix(icon);
            }

            this._sidebarList.append(row);
            this._rows.push({section: sec, row, index: i, pageWidget: null});
        }

        this._sidebarList.connect('row-selected', (_, row) => {
            if (!row)
                return;
            const item = this._rows.find(r => r.row === row);
            if (item)
                this._activateSection(item);
        });

        // Select first section by default
        if (this._rows.length > 0) {
            this._sidebarList.select_row(this._rows[0].row);
            this._activateSection(this._rows[0]);
        }

        return this._splitView;
    }

    _activateSection(item) {
        const sec = item.section;
        if (!item.pageWidget) {
            let childWidget = sec.page;
            if (!childWidget && typeof sec.buildContent === 'function')
                childWidget = sec.buildContent();

            // If childWidget is an Adw.PreferencesPage, wrap in ScrolledWindow if needed
            let displayWidget = childWidget;
            if (childWidget instanceof Adw.PreferencesPage) {
                // Adw.PreferencesPage already handles internal scrolling in libadwaita
                displayWidget = childWidget;
            } else if (childWidget instanceof Gtk.Widget) {
                const scrolled = new Gtk.ScrolledWindow({
                    hscrollbar_policy: Gtk.PolicyType.NEVER,
                    vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
                    child: childWidget,
                });
                displayWidget = scrolled;
            }

            this._contentStack.add_titled(displayWidget, sec.id, sec.title);
            item.pageWidget = displayWidget;
        }

        this._contentStack.set_visible_child_name(sec.id);
        if (this._contentHeader) {
            this._contentHeader.title_widget = new Adw.WindowTitle({
                title: sec.title,
            });
        }

        // When collapsed (mobile/narrow view), bring content forward
        if (this._splitView.collapsed)
            this._splitView.show_content = true;
    }

    /**
     * Attach this view into an existing Adw.PreferencesWindow or generic window
     * @param {Adw.PreferencesWindow | Gtk.Window} window
     */
    attachToWindow(window) {
        const widget = this.createWidget();
        if (window.set_content) {
            window.set_content(widget);
        } else if (window.set_child) {
            window.set_child(widget);
        }
    }

    /**
     * Intercept or wrap an extension preferences class to render via SplitPreferencesView.
     * Pages added to dummy window are translated to master-detail sections.
     * @param {Function} fillFunction (dummyWindow) => void
     * @param {Gtk.Window} targetWindow
     * @param {string} title
     */
    static renderFromPages(fillFunction, targetWindow, title) {
        const pages = [];
        const dummyWindow = {
            add(page) {
                pages.push(page);
            },
            set_default_size() {},
            set_title() {},
            set_search_enabled() {},
            connect() {},
        };

        fillFunction(dummyWindow);

        if (pages.length === 0)
            return;

        const sections = pages.map((page, idx) => ({
            id: `section_${idx}`,
            title: page.title || `Section ${idx + 1}`,
            iconName: page.icon_name || 'preferences-system-symbolic',
            page,
        }));

        const split = new SplitPreferencesView({
            title: title || targetWindow.title || 'Preferences',
            sections,
        });
        split.attachToWindow(targetWindow);
    }
}
