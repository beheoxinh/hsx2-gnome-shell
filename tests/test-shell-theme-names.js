// Pure-function tests: user-shell-theme name mapping (no Shell API, headless-safe).
import {
    collectThemeNames,
    rowLabelToThemeName,
    selectedIndexForTheme,
    themeNameToRowLabel,
} from '../modules/alienware-gnome-customizer-manager@hsx2coder/subsystems/user-shell-theme/theme-names.js';

export default [
    ['collect merges dirs, keeps css-only, sorts, always has default', () => {
        const list = collectThemeNames(['/a', '/b'], dir => {
            if (dir === '/a')
                return [['Zeta', true], ['NoCss', false]];
            if (dir === '/b')
                return [['Alpha', true]];
            return null;
        });
        const names = list.filter(Boolean);
        if (names.join(',') !== 'Alpha,Zeta')
            throw new Error('got ' + names.join(','));
        if (!list.includes(''))
            throw new Error('missing default entry');
    }],
    ['collect skips throwing dirs', () => {
        const list = collectThemeNames(['/bad', '/ok'], dir => {
            if (dir === '/bad')
                throw new Error('io');
            return [['Solo', true]];
        });
        if (!list.includes('Solo'))
            throw new Error('missing Solo');
    }],
    ['label round-trip default and named', () => {
        if (themeNameToRowLabel('') !== '(Default)')
            throw new Error('to label');
        if (themeNameToRowLabel('Qogir') !== 'Qogir')
            throw new Error('to label named');
        if (rowLabelToThemeName('(Default)') !== '')
            throw new Error('from label');
        if (rowLabelToThemeName('Qogir') !== 'Qogir')
            throw new Error('from label named');
    }],
    ['selected index falls back to default', () => {
        if (selectedIndexForTheme(['', 'A'], '') !== 0)
            throw new Error('empty');
        if (selectedIndexForTheme(['', 'A'], 'A') !== 1)
            throw new Error('found');
        if (selectedIndexForTheme(['', 'A'], 'Gone') !== 0)
            throw new Error('missing');
    }],
];
