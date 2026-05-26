import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#0B1F3A',
        card: '#182A4D',
        'card-even': '#1a2d50',
        surface: '#1e3259',
        detail: '#0a1628',
        border: 'rgba(201, 162, 74, 0.18)',
        'border-dim': 'rgba(201, 162, 74, 0.08)',
        gold: '#C9A24A',
        'gold-dim': 'rgba(201, 162, 74, 0.12)',
        'gold-hover': 'rgba(201, 162, 74, 0.07)',
        foreground: '#FFFFFF',
        muted: 'rgba(255, 255, 255, 0.60)',
        dim: 'rgba(255, 255, 255, 0.28)',
        success: '#4CAF7D',
        error: '#E05C5C',
        warning: '#E6A817',
        skipped: '#6B7280',
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        display: ['"Fraunces"', 'Georgia', 'serif'],
      },
    },
  },
} satisfies Config
