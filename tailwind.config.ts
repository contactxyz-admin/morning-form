import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    // The graph canvas's visual encoding stores its fill/stroke classes
    // as string literals in src/lib/graph/visual-encoding.ts (so the
    // encoding is a single source of truth shared by the canvas + every
    // future consumer). Without scanning src/lib/, JIT silently drops
    // these classes from the bundle and every <circle> renders
    // fill:black / stroke:none — both /demo/record and authed
    // /record?mode=map go invisible. Same applies to any future class
    // strings that live in src/lib/.
    './src/lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  // Belt-and-braces: even if the content scan misses a class string,
  // the graph encoding ships. These mirror src/lib/graph/visual-encoding.ts.
  safelist: [
    // Node fills (5 visual classes)
    'fill-alert/15',
    'fill-self-report/15',
    'fill-accent/20',
    'fill-positive/15',
    'fill-text-tertiary/10',
    // Node strokes (5 visual classes)
    'stroke-alert/70',
    'stroke-self-report/70',
    'stroke-accent',
    'stroke-positive/80',
    'stroke-text-tertiary/60',
    // Edge strokes (3 hierarchies)
    'stroke-text-tertiary/50',
    'stroke-text-secondary/70',
    'stroke-alert/60',
    // Selection-halo strokes (5 visual classes — stroke-accent and
    // stroke-positive/80 already listed above)
    'stroke-alert/80',
    'stroke-self-report/80',
    'stroke-text-tertiary/70',
    // Change-decoration tones (Plan 2026-06-10-003 — changeVisual() in
    // src/lib/graph/visual-encoding.ts): the panel-change ring + badge fill.
    'stroke-positive',
    'fill-positive',
    'stroke-alert',
    'fill-alert',
    'fill-accent',
    'fill-text-tertiary',
    // Flag-tier chips (plan 2026-06-16-003 — FLAG_PRESENTATION in
    // src/lib/markers/flag-presentation.ts): calm, distinct, never alarming.
    'bg-caution/12',
    'text-caution',
    'bg-alert/12',
    'text-alert',
  ],
  theme: {
    extend: {
      colors: {
        // Neutral system — MorningForm's soft, pastel health-app palette
        // (blue/sage/lavender/orange over an off-white ground). Replaces the
        // previous Apple-flavoured ink/paper system; token *names* are kept
        // unchanged so every consumer across the app re-skins automatically.
        bg: '#F7F7F7',
        'bg-deep': '#E7EAEE',
        surface: '#FFFFFF',
        'surface-warm': '#E3F3FF',
        'surface-sunken': '#E7EAEE',
        // Hairlines pulled to the new cool grey ramp.
        border: '#E7EAEE',
        'border-mid': '#BFC1C3',
        'border-strong': '#7E7F81',
        'border-hover': '#5E6873',
        // Ink — brand black, with the new cool grey ramp under it.
        'text-primary': '#161616',
        'text-secondary': '#3E3E3E',
        // text-tertiary / text-whisper are kept at their pre-redesign values:
        // they back captions/eyebrows in 100+ files across the whole app, and
        // the brand grey ramp (grey-300 #7E7F81 / grey-200 #BFC1C3) drops them
        // below WCAG AA contrast on white and on the #F7F7F7 page ground.
        'text-tertiary': '#6E6E73',
        'text-whisper': '#86868B',
        // Secondary text on inverted (ink) surfaces.
        'text-inverse-muted': '#BFC1C3',
        // Accent — kept NEUTRAL INK on purpose. `accent`/`fill-accent`/
        // `bg-accent` are consumed by ~50 files this redesign never touched
        // (graph node encoding, toggles, sliders, selected chips, check-in),
        // several of which pair `bg-accent` with white text or rely on the
        // near-black ink meaning. The marketing brand blue is applied via the
        // explicit `brand.blue.*` classes instead, not by overloading this
        // shared semantic token.
        accent: {
          DEFAULT: '#1D1D1F',
          light: '#F0F0F2',
          muted: '#6E6E73',
          deep: '#000000',
        },
        button: {
          // Brand blue primary — the deeper ramp steps, so resting-state
          // text stays comfortably accessible (blue-500/700 read too light
          // for AA body-text contrast against an off-white fill).
          DEFAULT: '#406782',
          hover: '#2F4D61',
          active: '#22384A',
          // Focus outline must clear the 3:1 non-text contrast floor that
          // graph-filter-legend.tsx (and other outline-button-focus consumers)
          // depend on. blue-500 #93BCDB is only ~2:1 on white; blue-900 is ~5.6:1.
          focus: '#406782',
        },
        // Status — desaturated hues, tuned for AA contrast on the page background.
        // Restraint: these appear only for real status signal (success, warning,
        // error) — never decorative. `.light` tokens back badge fills.
        positive: {
          DEFAULT: '#248A3D',
          light: '#E8F4EC',
          // DEFAULT lands ~4.0:1 on white — fine for ≥18px text and
          // non-text strokes (3:1), short of AA's 4.5:1 for small text.
          // `deep` (~5.8:1) backs sub-14px positive labels, e.g. the
          // landing RecordPreview chips.
          deep: '#1B7434',
        },
        caution: {
          DEFAULT: '#AD6200',
          light: '#FAF0E0',
        },
        alert: {
          DEFAULT: '#C4271A',
          light: '#FBEAE7',
        },
        // Graph node class — patient self-reports (symptoms, mood, energy).
        // A calm, low-saturation indigo, distinct from the four status/data
        // hues (red / graphite / green / grey) so self-report reads as its own
        // evidence type, never as alert (plan 2026-06-18-001). Used only at low
        // opacity on the canvas (fill /15, stroke /70–/80); exact value tuned in
        // the visual audit.
        'self-report': '#5B5EA6',
        // MorningForm brand ramps — the redesign's full palette, for
        // marketing-specific gradients, badges, and source-chip dots that
        // need a step the semantic aliases above don't expose.
        brand: {
          blue: { 50: '#E3F3FF', 100: '#D0E5F4', 300: '#B8C9E2', 500: '#93BCDB', 700: '#6890AD', 900: '#406782' },
          sage: { 50: '#DFE6C1', 100: '#C3CAA8', 300: '#B2BA91', 500: '#9BA478', 700: '#5F6740', 900: '#394121' },
          bluegrey: '#5E6873',
          lavender: { 50: '#F9E8FB', 100: '#D8B1DC', 300: '#BB90C1', 500: '#BD68C8', 700: '#91439C', 900: '#663A6D' },
          orange: { 50: '#FFE8E1', 100: '#F9C3B3', 300: '#FF9E81', 500: '#FF845F', 700: '#DE623D', 900: '#B1492A' },
          grey: { 100: '#E7EAEE', 200: '#BFC1C3', 300: '#7E7F81', 400: '#3E3E3E' },
          black: '#161616',
          offwhite: '#F7F7F7',
        },
      },
      fontFamily: {
        // Native stacks keep the application deployable without redistributing
        // trial foundry assets. Replace only with verified production-licensed
        // webfont files.
        display: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"SFMono-Regular"', 'Menlo', 'Monaco', 'Consolas', '"Liberation Mono"', '"Courier New"', 'ui-monospace', 'monospace'],
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
        // Soft, consistently rounded — MorningForm's pastel/health-app corners.
        'card': '20px',
        'card-sm': '14px',
        'button': '999px',
        'chip': '999px',
        'input': '10px',
        'well': '14px',
      },
      boxShadow: {
        'hairline': '0 0 0 1px rgba(22, 22, 22, 0.04)',
        'hairline-strong': '0 0 0 1px rgba(22, 22, 22, 0.08)',
        'card': 'none',
        // Soft lift — diffuse, low-opacity, cool-tinted per the redesign's elevation scale.
        'card-hover': '0 2px 6px rgba(22, 22, 22, 0.06), 0 6px 18px rgba(22, 22, 22, 0.08)',
        'card-press': 'inset 0 1px 2px rgba(22, 22, 22, 0.05)',
        'button-primary': '0 1px 0 rgba(247, 247, 247, 0.12) inset, 0 4px 14px -8px rgba(64, 103, 130, 0.45)',
        'button-primary-hover':
          '0 1px 0 rgba(247, 247, 247, 0.14) inset, 0 10px 26px -12px rgba(64, 103, 130, 0.60)',
        'modal': '0 16px 48px -12px rgba(22, 22, 22, 0.14), 0 4px 14px -6px rgba(22, 22, 22, 0.06)',
        'sheet': '0 -32px 80px -24px rgba(22, 22, 22, 0.14), 0 -4px 14px -6px rgba(22, 22, 22, 0.06)',
        'ring-accent': '0 0 0 1px rgba(104, 144, 173, 0.4)',
        'ring-focus': '0 0 0 3px rgba(147, 188, 219, 0.5)',
      },
      transitionDuration: {
        '250': '250ms',
        '450': '450ms',
        '600': '600ms',
      },
      transitionTimingFunction: {
        // MorningForm standard ease — calm and quick, replaces the previous Apple-style spring.
        'spring': 'cubic-bezier(0.22, 0.61, 0.36, 1)',
        // Emphasized ease — reserved for celebratory/emphasis moments.
        'spring-emphasized': 'cubic-bezier(0.34, 1.3, 0.64, 1)',
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
