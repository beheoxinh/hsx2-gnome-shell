// Pure-function tests: vinylHelpers slug/browser-id (needs Gio only).
import {
    isBrowserId,
    slugify,
    buildBrowserSourceId,
    parseBrowserSourceId,
    labelForId,
} from '../modules/alienware-dash-to-panel@hsx2coder/media/utils/ui/helper/vinylHelpers.js';

export default [
    ['slugify: basic', () => {
        if (slugify('Hello World') !== 'hello-world') throw new Error('basic');
        if (slugify('') !== '') throw new Error('empty');
        if (slugify(undefined) !== '') throw new Error('undefined');
        if (slugify('A  B__C') !== 'a-b-c') throw new Error('separators');
    }],
    ['isBrowserId: known browsers', () => {
        if (!isBrowserId('google-chrome')) throw new Error('chrome');
        if (!isBrowserId('org.mozilla.firefox')) throw new Error('firefox');
        if (isBrowserId('org.gnome.Music')) throw new Error('music is not browser');
        if (isBrowserId('')) throw new Error('empty false');
        if (isBrowserId(undefined)) throw new Error('undefined false');
    }],
    ['buildBrowserSourceId: round trip', () => {
        const id = buildBrowserSourceId('chromium', 'YouTube Music');
        if (!id.startsWith('chromium--')) throw new Error('prefix: ' + id);
        const parsed = parseBrowserSourceId(id);
        if (!parsed || parsed.browser !== 'chromium') throw new Error('browser part');
    }],
    ['buildBrowserSourceId: empty identity returns base', () => {
        if (buildBrowserSourceId('firefox', '') !== 'firefox') throw new Error('empty slug');
    }],
    ['labelForId: non-empty string', () => {
        const l = labelForId('org.gnome.Music');
        if (typeof l !== 'string' || !l.length) throw new Error('label empty');
    }],
];
