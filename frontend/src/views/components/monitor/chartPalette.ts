import type { Theme } from '@/context/ThemeContext';

const PALETTES: Record<Theme, string[]> = {
  'dark-modern': [
    '#e44d26',
    '#5ec4b0',
    '#faa918',
    '#e04848',
    '#c47a38',
    '#3da5d9',
    '#8fbf5e',
    '#d67e3e',
    '#69655e',
    '#e08840',
  ],
  'night-blue': [
    '#007ACC',
    '#4FC1FF',
    '#1A85FF',
    '#F44747',
    '#5ec4b0',
    '#faa918',
    '#8fbf5e',
    '#3da5d9',
    '#69655e',
    '#e08840',
  ],
  'light-modern': [
    '#007AFF',
    '#5856D6',
    '#FF9500',
    '#FF3B30',
    '#34C759',
    '#5ec4b0',
    '#FF2D55',
    '#007AFF',
    '#AF52DE',
    '#8E8E93',
  ],
};

export const MONITOR_SERIES_PALETTE = PALETTES['dark-modern'];

export function getPalette(theme: Theme): string[] {
  return PALETTES[theme];
}
