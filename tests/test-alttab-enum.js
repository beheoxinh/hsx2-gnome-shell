// Pure-function tests: alt-tab enums (headless-safe, no Shell imports).
import { Actions, Position, FilterMode, SelectMode, PreviewMode } from '../modules/alienware-advanced-alt-tab@hsx2coder/src/enum.js';

export const tests = [
    ['Actions: NONE=0 ACTIVATE=2', () => {
        if (Actions.NONE !== 0) throw new Error('NONE');
        if (Actions.ACTIVATE !== 2) throw new Error('ACTIVATE');
    }],
    ['Position: TOP/CENTER/BOTTOM distinct', () => {
        if (Position.TOP === Position.CENTER || Position.CENTER === Position.BOTTOM) throw new Error('dup');
    }],
    ['FilterMode: ALL/WORKSPACE/MONITOR distinct', () => {
        const s = new Set([FilterMode.ALL, FilterMode.WORKSPACE, FilterMode.MONITOR]);
        if (s.size !== 3) throw new Error('dup');
    }],
    ['SelectMode: NONE=-1 FIRST=0', () => {
        if (SelectMode.NONE !== -1 || SelectMode.FIRST !== 0) throw new Error('select');
    }],
    ['PreviewMode: DISABLE defined', () => {
        if (typeof PreviewMode.DISABLE === 'undefined') throw new Error('preview');
    }],
];
