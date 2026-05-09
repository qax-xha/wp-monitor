import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { theme as antdTheme, type ThemeConfig } from 'antd';

export type Theme = 'dark-modern' | 'night-blue' | 'light-modern';

const THEME_STORAGE_KEY = 'wp-monitor-theme';

const ACCENT_MAP: Record<Theme, string> = {
  'dark-modern': '#e44d26',
  'night-blue': '#007ACC',
  'light-modern': '#007AFF',
};

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'dark-modern' || stored === 'night-blue' || stored === 'light-modern') {
      return stored;
    }
    // 迁移旧主题名
    if (stored === 'rust-orange') return 'dark-modern';
    if (stored === 'vscode-blue') return 'night-blue';
    if (stored === 'macos-gray') return 'light-modern';
  } catch { /* localStorage unavailable */ }
  return 'dark-modern';
}

function applyDataTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  accentColor: string;
  antdAlgorithm: ThemeConfig['algorithm'];
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);

  useEffect(() => {
    applyDataTheme(theme);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch { /* ignore */ }
  }, []);

  const antdAlgorithm =
    theme === 'light-modern' ? antdTheme.defaultAlgorithm : antdTheme.darkAlgorithm;

  return (
    <ThemeContext.Provider
      value={{ theme, setTheme, accentColor: ACCENT_MAP[theme], antdAlgorithm }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
