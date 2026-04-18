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
        // Warm cream paper — meditation-hue ground; oat/sand family rather than the previous moss-paper.
        bg: '#F6F0E5',
        'bg-deep': '#EDE5D3',
        surface: '#FBF7EE',
        'surface-warm': '#EFE6D2',
        'surface-sunken': '#E6DCC4',
        // Hairlines warmed toward clay so they sit on the new ground.
        border: '#E5DCC8',
        'border-mid': '#D4C8B0',
        'border-strong': '#C8BBA0',
        'border-hover': '#A89B82',
        // Ink — warm coffee/clay; slightly less saturated than pure black so it breathes.
        'text-primary': '#221913',
        'text-secondary': '#5A4F45',
        'text-tertiary': '#7E7263',
        'text-whisper': '#8E8270',
        // Accent — dusty sage. A calm, low-saturation grey-green for trust marks
        // and ring tints. Reads as "meditation" rather than "growth/finance".
        accent: {
          DEFAULT: '#7E9183',
          light: '#E8EBE6',
          muted: '#8FA092',
          deep: '#4F6058',
        },
        button: {
          // Warm clay — neutral, grounded, modern wellness. White-on-clay 8.4:1 (AAA).
          DEFAULT: '#5C4A3F',
          hover: '#6F5A4D',
          active: '#473830',
          focus: '#7E7263',
        },
        positive: {
          DEFAULT: '#7E9183',
          light: '#E8EBE6',
        },
        // Honey — warm consumer accent for milestones and streaks.
        honey: {
          DEFAULT: '#C98B5A',
          light: '#F7EADA',
          muted: '#B87A49',
          deep: '#8E5A2F',
        },
        // Pop — Depop-flavoured coral for small bursts of brand energy
        // (badges, "you did it" chips, hero stickers). Use sparingly.
        pop: {
          DEFAULT: '#E88A6E',
          light: '#FBE1D5',
          muted: '#D5755A',
          deep: '#A85440',
        },
        caution: {
          DEFAULT: '#B8884A',
          light: '#F3EDDF',
        },
        alert: {
          DEFAULT: '#9A4F3A',
          light: '#F3E2DA',
        },
      },
      fontFamily: {
        // Display — Bricolage Grotesque. Modern grotesque with soft character.
        display: ['var(--font-display)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // Serif — Fraunces, reserved for italic pull-phrases (.voice-italic).
        serif: ['var(--font-serif)', '"Iowan Old Style"', 'Georgia', 'serif'],
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
        // Sticker lift — for .sticker imagery cards that should feel cut-out.
        'sticker': '0 2px 0 rgba(34, 25, 19, 0.08), 0 8px 22px -10px rgba(34, 25, 19, 0.18)',
        'ring-accent': '0 0 0 1px rgba(126, 145, 131, 0.34)',
        'ring-focus': '0 0 0 2px rgba(126, 145, 131, 0.42)',
      },
      transitionDuration: {
        '250': '250ms',
        '450': '450ms',
        '600': '600ms',
        '700': '700ms',
        '1000': '1000ms',
      },
      transitionTimingFunction: {
        // Apple-style spring — overshoots softly then settles.
        'spring': 'cubic-bezier(0.32, 0.72, 0, 1)',
        'soft-out': 'cubic-bezier(0.22, 1, 0.36, 1)',
        'soft-in-out': 'cubic-bezier(0.65, 0, 0.35, 1)',
      },
      animation: {
        'fade-in': 'fadeIn 0.6s cubic-bezier(0.22, 1, 0.36, 1)',
        'fade-in-up': 'fadeInUp 0.7s cubic-bezier(0.22, 1, 0.36, 1)',
        'slide-up': 'slideUp 0.45s cubic-bezier(0.32, 0.72, 0, 1)',
        'rise-in': 'riseIn 0.7s cubic-bezier(0.22, 1, 0.36, 1) forwards',
        'progress': 'progress 1s cubic-bezier(0.22, 1, 0.36, 1)',
        'pulse-subtle': 'pulseSubtle 2.4s ease-in-out infinite',
        'text-reveal': 'textReveal 0.9s cubic-bezier(0.22, 1, 0.36, 1) forwards',
        'underline-in': 'underlineIn 0.55s cubic-bezier(0.32, 0.72, 0, 1) forwards',
        'shimmer': 'shimmer 2.4s cubic-bezier(0.4, 0, 0.2, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        riseIn: {
          '0%': { opacity: '0', transform: 'translateY(14px)', filter: 'blur(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)', filter: 'blur(0)' },
        },
        progress: {
          '0%': { width: '0%' },
          '100%': { width: 'var(--progress-width)' },
        },
        pulseSubtle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
        textReveal: {
          '0%': { opacity: '0', filter: 'blur(8px)', transform: 'translateY(8px)' },
          '100%': { opacity: '1', filter: 'blur(0)', transform: 'translateY(0)' },
        },
        underlineIn: {
          '0%': { transform: 'scaleX(0)', transformOrigin: 'left' },
          '100%': { transform: 'scaleX(1)', transformOrigin: 'left' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
