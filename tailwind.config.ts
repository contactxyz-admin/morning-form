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
        // Warm paper background, slightly creamier than before for a less clinical feel.
        bg: '#FAF7F2',
        surface: '#FFFFFF',
        'surface-warm': '#F5F1E9',
        // Borders — pushed lighter so they read as hairlines rather than rules.
        border: '#ECE8E0',
        'border-strong': '#D9D3C7',
        'border-hover': '#BFB8A8',
        // Ink — deeper than #1A1A1A for a more confident type colour.
        'text-primary': '#141414',
        'text-secondary': '#5C5A53',
        'text-tertiary': '#9A958A',
        // Accent — deep moss; appears on hover rings and small flourishes.
        accent: {
          DEFAULT: '#1F3A2E',
          light: '#EFF1EB',
          muted: '#2F4A3E',
        },
        // Primary action — same moss family but darker for headline CTAs.
        button: {
          DEFAULT: '#0F2A20',
          hover: '#1F3A2E',
          active: '#081D15',
          focus: '#9A958A',
        },
        positive: {
          DEFAULT: '#4A6B5A',
          light: '#EFF3EC',
        },
        caution: {
          DEFAULT: '#8B6B3A',
          light: '#F5EFE3',
        },
        alert: {
          DEFAULT: '#8B4A3A',
          light: '#F5EDE9',
        },
      },
      fontFamily: {
        // Variable serif w/ optical-size axis — editorial display.
        display: ['var(--font-display)', '"Iowan Old Style"', 'Georgia', 'serif'],
        // Refined sans for body + UI.
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', '"SFMono-Regular"', 'ui-monospace', 'monospace'],
        // Legacy alias retained for compatibility with older code.
        serif: ['var(--font-display)', 'Georgia', 'serif'],
      },
      fontSize: {
        // Display sizes scale up significantly — Apple-style headline gravity.
        'display-xl': ['3.5rem', { lineHeight: '1.02', letterSpacing: '-0.04em' }],
        'display': ['2.75rem', { lineHeight: '1.05', letterSpacing: '-0.035em' }],
        'display-sm': ['2rem', { lineHeight: '1.1', letterSpacing: '-0.03em' }],
        'heading': ['1.5rem', { lineHeight: '1.2', letterSpacing: '-0.02em' }],
        'subheading': ['1.125rem', { lineHeight: '1.4', letterSpacing: '-0.01em' }],
        'body-lg': ['1.0625rem', { lineHeight: '1.55', letterSpacing: '-0.005em' }],
        'body': ['0.9375rem', { lineHeight: '1.55', letterSpacing: '-0.003em' }],
        'caption': ['0.8125rem', { lineHeight: '1.5', letterSpacing: '0.005em' }],
        'label': ['0.6875rem', { lineHeight: '1.4', letterSpacing: '0.12em' }],
        'data': ['0.875rem', { lineHeight: '1.5', letterSpacing: '0' }],
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
        '30': '7.5rem',
      },
      borderRadius: {
        'card': '20px',
        'card-sm': '14px',
        'button': '14px',
        'chip': '999px',
        'input': '12px',
      },
      boxShadow: {
        // Almost imperceptible by default; only used to lift on hover.
        'hairline': '0 0 0 1px rgba(20, 20, 20, 0.04)',
        'card': 'none',
        'card-hover': '0 1px 2px rgba(20, 20, 20, 0.04), 0 8px 24px -8px rgba(20, 20, 20, 0.06)',
        'modal': '0 8px 32px rgba(20, 20, 20, 0.12)',
        'ring-accent': '0 0 0 1px rgba(31, 58, 46, 0.18)',
      },
      transitionDuration: {
        '250': '250ms',
        '450': '450ms',
        '700': '700ms',
      },
      transitionTimingFunction: {
        // Apple-style spring-out — overshoots slightly then settles.
        'spring': 'cubic-bezier(0.32, 0.72, 0, 1)',
        'soft-out': 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      animation: {
        'fade-in': 'fadeIn 0.6s cubic-bezier(0.22, 1, 0.36, 1)',
        'fade-in-up': 'fadeInUp 0.7s cubic-bezier(0.22, 1, 0.36, 1)',
        'slide-up': 'slideUp 0.45s cubic-bezier(0.32, 0.72, 0, 1)',
        'progress': 'progress 1s cubic-bezier(0.22, 1, 0.36, 1)',
        'pulse-subtle': 'pulseSubtle 2.4s ease-in-out infinite',
        'text-reveal': 'textReveal 0.8s cubic-bezier(0.22, 1, 0.36, 1) forwards',
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
        progress: {
          '0%': { width: '0%' },
          '100%': { width: 'var(--progress-width)' },
        },
        pulseSubtle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
        textReveal: {
          '0%': { opacity: '0', filter: 'blur(6px)', transform: 'translateY(6px)' },
          '100%': { opacity: '1', filter: 'blur(0)', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
