import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

type Theme = 'dark' | 'light';
const STORAGE_KEY = 'rgv:theme';

function readInitialTheme(): Theme {
  if (typeof document === 'undefined') return 'dark';
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'light' || attr === 'dark') return attr;
  return 'dark';
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readInitialTheme);

  useEffect(() => {
    // On first client mount, honour localStorage if present (overrides the
    // baked-in `<html data-theme="dark">` default), else honour prefers-color-scheme.
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') {
      apply(stored as Theme);
      setTheme(stored as Theme);
      return;
    }
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    if (mq.matches) {
      apply('light');
      setTheme('light');
    }
  }, []);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    apply(next);
    setTheme(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      data-testid="theme-toggle"
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      className="flex h-8 w-8 items-center justify-center rounded-md border"
      style={{
        background: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
        color: 'var(--text-secondary)',
      }}
    >
      {theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
    </button>
  );
}

function apply(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
}
