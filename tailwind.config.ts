import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Neutral system — Apple-flavoured off-white ground with a near-black ink.
        // Strips the previous warm cream so the brand reads quieter / more designer.
        bg: '#FBFBFD',
        'bg-deep': '#F5F5F7',
        surface: '#FFFFFF',
        'surface-warm': '#F5F5F7',
        'surface-sunken': '#EEEEF1',
        // Hairlines pulled to neutral system grey.
        border: '#E5E5EA',
        'border-mid': '#D2D2D7',
        'border-strong': '#BDBDC4',
        'border-hover': '#86868B',
        // Ink — Apple's near-black, with system grey ramp under it.
        'text-primary': '#1D1D1F',
        'text-secondary': '#424245',
        'text-tertiary': '#6E6E73',
        'text-whisper': '#86868B',
        // Accent — desaturated graphite for focus rings and active states.
        // Held back from any warm/colourful read.
        accent: {
          DEFAULT: '#1D1D1F',
          light: '#F0F0F2',
          muted: '#6E6E73',
          deep: '#000000',
        },
        button: {
          // Pure ink primary — high contrast, neutral, designer.
          DEFAULT: '#1D1D1F',
          hover: '#2D2D2F',
          active: '#000000',
          focus: '#424245',
        },
        // Status — desaturated Apple-system hues, tuned for AA contrast on #FBFBFD.
        // Restraint: these appear only for real status signal (success, warning,
        // error) — never decorative. `.light` tokens back badge fills.
        positive: {
          DEFAULT: '#248A3D',
          light: '#E8F4EC',
        },
        caution: {
          DEFAULT: '#AD6200',
          light: '#FAF0E0',
        },
        alert: {
          DEFAULT: '#C4271A',
          light: '#FBEAE7',
        },
      },
      fontFamily: {
        // Display — Fraunces serif for editorial headings. Paired with Inter
        // for body/UI. Mono for data and small caps.
        display: ['var(--font-display)', 'Georgia', '"Times New Roman"', 'ui-serif', 'serif'],
        sans: ['var(--font-sans)', '-apple-system', 'BlinkMacSystemFont', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', '"SFMono-Regular"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        // Display — generous hero gravity. 2xl is reserved for the one headline per page.
        'display-2xl': ['4.25rem', { lineHeight: '0.98', letterSpacing: '-0.045em' }],
        'display-xl': ['3.25rem', { lineHeight: '1.02', letterSpacing: '-0.04em' }],
        'display': ['2.5rem', { lineHeight: '1.06', letterSpacing: '-0.035em' }],
        'display-sm': ['1.875rem', { lineHeight: '1.1', letterSpacing: '-0.03em' }],
        'heading': ['1.375rem', { lineHeight: '1.22', letterSpacing: '-0.02em' }],
        'subheading': ['1.0625rem', { lineHeight: '1.4', letterSpacing: '-0.01em' }],
        'body-lg': ['1.0625rem', { lineHeight: '1.6', letterSpacing: '-0.005em' }],
        'body': ['0.9375rem', { lineHeight: '1.58', letterSpacing: '-0.003em' }],
        'caption': ['0.8125rem', { lineHeight: '1.5', letterSpacing: '0.002em' }],
        'label': ['0.6875rem', { lineHeight: '1.4', letterSpacing: '0.11em' }],
        'data': ['0.875rem', { lineHeight: '1.5', letterSpacing: '0' }],
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
        '30': '7.5rem',
      },
      backgroundImage: {
        // Record-family grid pattern — a 40×40 dot motif at border-strong (#D0C8B6)
        // with low alpha so it reads as paper tooth, not a ruled sheet. Tiles
        // naturally at its intrinsic size; consumers pair with `.bg-record-grid`
        // (globals.css) for the opacity/blend defaults.
        'grid-pattern':
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><path d='M19 19h2v2h-2z' fill='%23D0C8B6' fill-opacity='0.6'/></svg>\")",
      },
      borderRadius: {
        // Architectural corners — tighter than pillowed, closer to editorial grid.
        'card': '14px',
        'card-sm': '10px',
        'button': '10px',
        'chip': '999px',
        'input': '8px',
        'well': '12px',
      },
      boxShadow: {
        'hairline': '0 0 0 1px rgba(26, 20, 16, 0.04)',
        'hairline-strong': '0 0 0 1px rgba(26, 20, 16, 0.08)',
        'card': 'none',
        // Paper lift — quieter contact + ambient, leaning on border transitions to carry interaction.
        'card-hover':
          '0 1px 1px rgba(26, 20, 16, 0.02), 0 6px 18px -12px rgba(26, 20, 16, 0.08)',
        'card-press': 'inset 0 1px 2px rgba(26, 20, 16, 0.05)',
        'button-primary': '0 1px 0 rgba(255, 253, 250, 0.12) inset, 0 4px 14px -8px rgba(92, 74, 63, 0.55)',
        'button-primary-hover':
          '0 1px 0 rgba(255, 253, 250, 0.14) inset, 0 10px 26px -12px rgba(92, 74, 63, 0.70)',
        'modal': '0 16px 48px -12px rgba(34, 25, 19, 0.20), 0 4px 14px -6px rgba(34, 25, 19, 0.09)',
        'sheet': '0 -32px 80px -24px rgba(34, 25, 19, 0.22), 0 -4px 14px -6px rgba(34, 25, 19, 0.08)',
        'ring-accent': '0 0 0 1px rgba(29, 29, 31, 0.34)',
        'ring-focus': '0 0 0 2px rgba(29, 29, 31, 0.42)',
      },
      transitionDuration: {
        '250': '250ms',
        '450': '450ms',
        '600': '600ms',
      },
      transitionTimingFunction: {
        // Apple-style spring — overshoots softly then settles.
        'spring': 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
      animation: {
        'pulse-subtle': 'pulseSubtle 2.4s ease-in-out infinite',
      },
      keyframes: {
        pulseSubtle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
