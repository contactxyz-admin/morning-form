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
        // Warm paper — lifted toward near-white for editorial clarity while keeping the uncoated-stock warmth.
        bg: '#FAF6EE',
        'bg-deep': '#F4EFE4',
        surface: '#FEFCF6',
        'surface-warm': '#F5F0E6',
        'surface-sunken': '#F0EADC',
        // Hairlines. Two-step hover so default -> hover is a half-tone, not a jump.
        border: '#EAE4D7',
        'border-mid': '#D8D0BE',
        'border-strong': '#D0C8B6',
        'border-hover': '#B6AD98',
        // Ink — warmed into the paper palette so type sits on the page, not on it.
        'text-primary': '#1A1410',
        'text-secondary': '#55504A',
        'text-tertiary': '#9A9388',
        'text-whisper': '#B8B1A4',
        // Accent — deep moss for trust touches, ring tints, small marks.
        accent: {
          DEFAULT: '#1F3A2E',
          light: '#EAEFE7',
          muted: '#2F4A3E',
          deep: '#112219',
        },
        button: {
          DEFAULT: '#121F17',
          hover: '#1F3A2E',
          active: '#081D15',
          focus: '#9A9388',
        },
        positive: {
          DEFAULT: '#4A6B5A',
          light: '#EAEFE7',
        },
        caution: {
          DEFAULT: '#8B6B3A',
          light: '#F3EDDF',
        },
        alert: {
          DEFAULT: '#8B4A3A',
          light: '#F3E9E3',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', '"Iowan Old Style"', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', '"SFMono-Regular"', 'ui-monospace', 'monospace'],
        serif: ['var(--font-display)', 'Georgia', 'serif'],
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
        'button-primary': '0 1px 0 rgba(255, 253, 250, 0.08) inset, 0 4px 14px -8px rgba(18, 31, 23, 0.45)',
        'button-primary-hover':
          '0 1px 0 rgba(255, 253, 250, 0.10) inset, 0 8px 22px -12px rgba(18, 31, 23, 0.60)',
        'modal': '0 16px 48px -12px rgba(26, 20, 16, 0.20), 0 4px 14px -6px rgba(26, 20, 16, 0.09)',
        'ring-accent': '0 0 0 1px rgba(31, 58, 46, 0.22)',
        'ring-focus': '0 0 0 2px rgba(31, 58, 46, 0.26)',
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
