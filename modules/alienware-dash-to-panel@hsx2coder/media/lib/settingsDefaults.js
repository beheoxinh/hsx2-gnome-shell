/**
 * Fixed values for media-player settings that were removed from preferences.
 *
 * These were not worth configuring, so they are not in GSettings any more and
 * the runtime reads them from here. Changing one is a code edit, not a switch.
 */

// Panel label
export const PANEL_TEXT_SEPARATOR = ' • ';
export const PANEL_SCROLL_ENABLED = true;
export const PANEL_SCROLL_SPEED = 2;
export const PANEL_FONT_SIZE = 13;
export const PANEL_ICON_SIZE = 18;
export const PANEL_ELEMENT_ORDER = ['icon', 'label', 'controls'];

// Popup
export const POPUP_INFO_CENTER = true;
export const POPUP_BUTTON_ORDER = ['shuffle', 'previous', 'play', 'next', 'repeat'];
export const POPUP_TITLE_FONT_SIZE = 16;
export const POPUP_TITLE_BOLD = true;
export const POPUP_ARTIST_FONT_SIZE = 13;
export const TITLE_SCROLL = {enabled: true, speed: 5};
export const ARTIST_SCROLL = {enabled: true, speed: 5};
export const ALBUM_ART_ROTATION_SPEED = 20;
