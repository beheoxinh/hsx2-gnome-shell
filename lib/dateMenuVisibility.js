/**
 * DateMenuVisibility — the one place that decides whether the top bar clock
 * (Main.panel.statusArea.dateMenu) is shown.
 *
 * Two modules have an opinion and neither may read the other's settings:
 *   * gnome-customizer-manager owns the `clock-visible` key  -> setWanted()
 *   * alienware-topbar's System Monitor takes over the centre box -> setOccupied()
 *
 * The clock is visible only when it is wanted AND not occupied. Each side
 * resets its own vote when its module is disabled, so turning a module off
 * always hands the clock back to the stock GNOME behaviour.
 */

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

let _wanted = true;
let _occupied = false;

function _sync() {
    const container = Main.panel?.statusArea?.dateMenu?.container;
    if (!container)
        return;

    if (_wanted && !_occupied) {
        // the lock screen manages the panel on its own
        if (!Main.sessionMode?.isLocked)
            container.show();
    } else {
        container.hide();
    }
}

export const DateMenuVisibility = {
    /** @param {boolean} wanted user wants the clock (clock-visible) */
    setWanted(wanted) {
        _wanted = !!wanted;
        _sync();
    },

    /** @param {boolean} occupied something else sits where the clock lives */
    setOccupied(occupied) {
        _occupied = !!occupied;
        _sync();
    },

    get occupied() {
        return _occupied;
    },

    /** re-apply the current decision, e.g. after the date menu moved */
    sync() {
        _sync();
    },
};
