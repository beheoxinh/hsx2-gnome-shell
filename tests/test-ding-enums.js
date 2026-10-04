// DING enums are var-style globals (no ESM exports); values mirrored from app/enums.js.
const FileType = { NONE: null, USER_DIRECTORY_HOME: 'show-home' };
const Selection = { NONE: 0, SINGLE: 1, MULTIPLE: 2 };

export const tests = [
    ['FileType: NONE null, HOME string', () => {
        if (FileType.NONE !== null) throw new Error('NONE');
        if (typeof FileType.USER_DIRECTORY_HOME !== 'string') throw new Error('HOME');
    }],
    ['Selection: NONE/SINGLE/MULTIPLE distinct', () => {
        const s = new Set([Selection.NONE, Selection.SINGLE, Selection.MULTIPLE]);
        if (s.size !== 3) throw new Error('dup');
    }],
];
