import { atom } from 'recoil';

/** Editor-wide state shared between the editor, the ribbon and the AI selection assistant. */

export const documentContentState = atom<string>({
  key: 'documentContent',
  default: '',
});

export const isDarkModeState = atom<boolean>({
  key: 'isDarkMode',
  default: false,
});

export const editorInstanceState = atom<any>({
  key: 'editorInstance',
  default: null,
  dangerouslyAllowMutability: true,
});

export const selectedTextState = atom<string>({
  key: 'selectedText',
  default: '',
});

export const selectedRangeState = atom<{ from: number; to: number } | null>({
  key: 'selectedRange',
  default: null,
});

export const showAIMenuState = atom<boolean>({
  key: 'showAIMenu',
  default: false,
});
