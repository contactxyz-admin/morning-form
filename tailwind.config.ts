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
        bg: '#FAFAF8',
        surface: '#FFFFFF',
        border: '#E5E5E3',
        'border-hover': '#CCCCCC',
        'text-primary': '#1A1A1A',
        'text-secondary': '#6B6B6B',
        'text-tertiary': '#9B9B9B',
        accent: {
          DEFAULT: '#1A3A3A',
          light: '#F0F5F5',
          muted: '#2A4A4A',
        },
        button: {
          DEFAULT: '#0B3D2E',
          hover: '#145A44',
          active: '#072E22',
          focus: '#94A3B8',
        },
        positive: {
          DEFAULT: '#4A6B5A',
          light: '#F0F5F0',
        },
        caution: {
          DEFAULT: '#8B6B3A',
          light: '#F5F0E5',
        },
        alert: {
          DEFAULT: '#8B4A3A',
          light: '#F5EFED',
        },
      },
      fontFamily: {
        serif: ['var(--font-instrument-serif)', 'Georgia', 'serif'],
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'monospace'],
      },
      fontSize: {
        'display': ['2rem', { lineHeight: '1.15', letterSpacing: '-0.02em' }],
        'heading': ['1.375rem', { lineHeight: '1.3', letterSpacing: '-0.01em' }],
        'subheading': ['1.125rem', { lineHeight: '1.4' }],
        'body': ['0.9375rem', { lineHeight: '1.6' }],
        'caption': ['0.8125rem', { lineHeight: '1.5', letterSpacing: '0.01em' }],
        'label': ['0.75rem', { lineHeight: '1.5', letterSpacing: '0.06em' }],
        'data': ['0.875rem', { lineHeight: '1.5' }],
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
      },
      borderRadius: {
        'card': '12px',
        'button': '12px',
        'chip': '100px',
        'input': '10px',
      },
      boxShadow: {
        'card': '0 1px 3px rgba(0, 0, 0, 0.04)',
        'card-hover': '0 2px 8px rgba(0, 0, 0, 0.06)',
        'modal': '0 8px 32px rgba(0, 0, 0, 0.12)',
      },
      transitionDuration: {
        '250': '250ms',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'fade-in-up': 'fadeInUp 0.5s ease-out',
        'slide-up': 'slideUp 0.35s ease-out',
        'progress': 'progress 1s ease-out',
        'pulse-subtle': 'pulseSubtle 2s ease-in-out infinite',
        'text-reveal': 'textReveal 0.6s ease-out forwards',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
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
          '50%': { opacity: '0.6' },
        },
        textReveal: {
          '0%': { opacity: '0', filter: 'blur(4px)', transform: 'translateY(4px)' },
          '100%': { opacity: '1', filter: 'blur(0px)', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
