import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--bg-canvas)',
        surface: 'var(--bg-surface)',
        elevated: 'var(--bg-elevated)',

        border: {
          subtle: 'var(--border-subtle)',
          strong: 'var(--border-strong)',
        },

        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          tertiary: 'var(--text-tertiary)',
        },

        status: {
          baseline: 'var(--status-baseline)',
          winner: 'var(--status-winner)',
          improved: 'var(--status-improved)',
          'improved-mild': 'var(--status-improved-mild)',
          regressed: 'var(--status-regressed)',
          'regressed-mild': 'var(--status-regressed-mild)',
          failed: 'var(--status-failed)',
          'rejected-exact': 'var(--status-rejected-exact)',
          'rejected-semantic': 'var(--status-rejected-semantic)',
          unscored: 'var(--status-unscored)',
        },

        edge: {
          accepted: 'var(--edge-accepted)',
          rejected: 'var(--edge-rejected)',
          'best-path': 'var(--edge-best-path)',
        },

        path: {
          glow: 'var(--path-glow)',
          halo: 'var(--path-halo)',
        },

        focus: 'var(--focus-ring)',

        winnerPillBg: 'var(--winner-pill-bg)',

        // Legacy aliases kept for the scaffold page until react-principal replaces it.
        fg: 'var(--text-primary)',
        muted: 'var(--text-secondary)',
        accent: 'var(--focus-ring)',
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'Menlo', 'monospace'],
      },
      fontSize: {
        'node-title': ['12px', { lineHeight: '16px', fontWeight: '500' }],
        'node-score': ['14px', { lineHeight: '18px', fontWeight: '600' }],
        'node-badge': ['11px', { lineHeight: '14px', fontWeight: '600' }],
        'node-caption': ['10px', { lineHeight: '12px', fontWeight: '600', letterSpacing: '0.08em' }],
        'legend': ['12px', { lineHeight: '16px', fontWeight: '500' }],
      },
      boxShadow: {
        'path-halo': '0 0 6px var(--path-halo-strong)',
        'node-selected': '0 0 0 2px var(--text-primary)',
        'node-focus': '0 0 0 2px var(--focus-ring)',
      },
      transitionTimingFunction: {
        'ease-out-std': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
