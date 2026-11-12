// Pure-function tests: MPRIS bus-name normalisation (no Shell API, headless-safe).
import {
    stripInstanceSuffix,
    shortAppName,
    isNonPlayerBus,
} from '../modules/alienware-dash-to-panel@hsx2coder/media/utils/mpris/MprisNames.js';

export default [
    ['stripInstanceSuffix: Firefox instance suffix', () => {
        const got = stripInstanceSuffix('org.mpris.MediaPlayer2.firefox.instance_1_42');
        if (got !== 'org.mpris.MediaPlayer2.firefox') throw new Error(got);
    }],
    ['stripInstanceSuffix: Chromium instance suffix', () => {
        const got = stripInstanceSuffix('org.mpris.MediaPlayer2.chromium.instance12345');
        if (got !== 'org.mpris.MediaPlayer2.chromium') throw new Error(got);
    }],
    ['stripInstanceSuffix: plain names untouched', () => {
        const name = 'org.mpris.MediaPlayer2.vlc';
        if (stripInstanceSuffix(name) !== name) throw new Error('changed');
    }],
    ['shortAppName: prefix removed and lowercased', () => {
        if (shortAppName('org.mpris.MediaPlayer2.VLC') !== 'vlc') throw new Error('vlc');
    }],
    ['shortAppName: instances of one app share a key', () => {
        const a = shortAppName('org.mpris.MediaPlayer2.chromium.instance1');
        const b = shortAppName('org.mpris.MediaPlayer2.chromium.instance999');
        if (a !== 'chromium' || a !== b) throw new Error(`${a} vs ${b}`);
    }],
    ['shortAppName: Firefox instance collapses', () => {
        const got = shortAppName('org.mpris.MediaPlayer2.firefox.instance_2_7');
        if (got !== 'firefox') throw new Error(got);
    }],
    ['isNonPlayerBus: audio servers and bluez excluded', () => {
        for (const n of [
            'org.mpris.MediaPlayer2.bluez',
            'org.mpris.MediaPlayer2.pulseaudio',
            'org.mpris.MediaPlayer2.pipewire',
            'org.mpris.MediaPlayer2.playerctld',
        ]) {
            if (!isNonPlayerBus(n)) throw new Error(`should exclude ${n}`);
        }
    }],
    ['isNonPlayerBus: real players kept', () => {
        for (const n of [
            'org.mpris.MediaPlayer2.spotify',
            'org.mpris.MediaPlayer2.firefox.instance_1_2',
            'org.mpris.MediaPlayer2.vlc',
        ]) {
            if (isNonPlayerBus(n)) throw new Error(`should keep ${n}`);
        }
    }],
];
