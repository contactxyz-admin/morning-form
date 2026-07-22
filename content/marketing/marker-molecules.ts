import type { MoleculeSpec } from '@/lib/marketing/molecule-svg';

/**
 * One illustrative molecule per marker category, shown in the floating
 * preview card when a visitor hovers a category row in <MarkerIndex>.
 * Each `spec` is a hand-authored set of 2D coordinates fed to
 * buildMoleculeSvg() — not a real structural diagram, just an editorial
 * illustration in the same "hand-drawn ink" style across every category.
 */
export interface MarkerMolecule {
  readonly name: string;
  readonly formula: string;
  readonly spec: MoleculeSpec;
}

export const MARKER_MOLECULES: Readonly<Record<string, MarkerMolecule>> = {
  metabolic: {
    name: 'Glucose',
    formula: 'C₆H₁₂O₆',
    spec: {
      ring: '110,58 148,80 148,124 110,146 72,124 72,80',
      bonds: [
        [110, 58, 148, 80],
        [148, 80, 148, 124],
        [148, 124, 110, 146],
        [110, 146, 72, 124],
        [72, 124, 72, 80],
        [72, 80, 110, 58],
        [148, 124, 186, 138],
        [110, 146, 110, 186],
        [72, 124, 34, 138],
        [72, 80, 34, 66],
        [148, 80, 186, 64],
        [186, 64, 214, 50],
      ],
      atoms: [
        [110, 58, 'O'],
        [186, 138, 'O'],
        [110, 186, 'O'],
        [34, 138, 'O'],
        [34, 66, 'O'],
        [214, 50, 'O'],
      ],
    },
  },
  hormones: {
    name: 'Adrenaline',
    formula: 'C₉H₁₃NO₃',
    spec: {
      ring: '95,63 131,84 131,126 95,147 59,126 59,84',
      bonds: [
        [95, 63, 131, 84],
        [131, 84, 131, 126],
        [131, 126, 95, 147],
        [95, 147, 59, 126],
        [59, 126, 59, 84],
        [59, 84, 95, 63],
        [59, 84, 30, 70],
        [59, 126, 30, 140],
        [131, 84, 165, 105],
        [165, 105, 165, 150],
        [165, 105, 198, 86],
        [198, 86, 231, 105],
        [231, 105, 262, 88],
      ],
      doubles: [
        [103, 72, 123, 84],
        [123, 128, 103, 140],
        [66, 120, 66, 90],
      ],
      atoms: [
        [30, 70, 'O'],
        [30, 140, 'O'],
        [165, 150, 'O'],
        [231, 105, 'N'],
      ],
    },
  },
  recovery: {
    name: 'Creatine',
    formula: 'C₄H₉N₃O₂',
    spec: {
      bonds: [
        [90, 100, 90, 60],
        [90, 100, 55, 122],
        [90, 100, 125, 122],
        [125, 122, 125, 162],
        [125, 122, 160, 100],
        [160, 100, 195, 118],
        [195, 118, 195, 158],
        [195, 118, 228, 98],
      ],
      doubles: [
        [83, 98, 83, 62],
        [202, 120, 202, 156],
      ],
      atoms: [
        [90, 60, 'N'],
        [55, 122, 'N'],
        [125, 122, 'N'],
        [195, 158, 'O'],
        [228, 98, 'O'],
      ],
    },
  },
  inflammation: {
    name: 'Histamine',
    formula: 'C₅H₉N₃',
    spec: {
      ring: '90,66 126,92 112,134 68,134 54,92',
      bonds: [
        [90, 66, 126, 92],
        [126, 92, 112, 134],
        [112, 134, 68, 134],
        [68, 134, 54, 92],
        [54, 92, 90, 66],
        [126, 92, 165, 104],
        [165, 104, 198, 88],
        [198, 88, 231, 106],
      ],
      doubles: [
        [96, 74, 118, 90],
        [108, 126, 72, 126],
      ],
      atoms: [
        [112, 134, 'N'],
        [54, 92, 'N'],
        [231, 106, 'N'],
      ],
    },
  },
  nutrients: {
    name: 'Vitamin C',
    formula: 'C₆H₈O₆',
    spec: {
      ring: '92,64 128,90 114,132 70,132 56,90',
      bonds: [
        [92, 64, 128, 90],
        [128, 90, 114, 132],
        [114, 132, 70, 132],
        [70, 132, 56, 90],
        [56, 90, 92, 64],
        [92, 64, 92, 26],
        [128, 90, 164, 76],
        [114, 132, 150, 152],
        [70, 132, 44, 150],
      ],
      doubles: [
        [124, 98, 110, 126],
        [99, 62, 99, 30],
      ],
      atoms: [
        [56, 90, 'O'],
        [92, 26, 'O'],
        [164, 76, 'O'],
        [150, 152, 'O'],
        [44, 150, 'O'],
      ],
    },
  },
  organ: {
    name: 'Urea',
    formula: 'CH₄N₂O',
    spec: {
      bonds: [
        [150, 105, 150, 62],
        [150, 105, 112, 130],
        [150, 105, 188, 130],
      ],
      doubles: [[158, 103, 158, 64]],
      atoms: [
        [150, 62, 'O'],
        [112, 130, 'N'],
        [188, 130, 'N'],
      ],
    },
  },
  genomics: {
    name: 'DNA',
    formula: 'double helix',
    spec: {
      curves: [
        'M110,24 C170,60 60,80 110,110 C160,140 60,160 110,196',
        'M190,24 C130,60 240,80 190,110 C140,140 240,160 190,196',
      ],
      bonds: [
        [122, 46, 178, 46],
        [132, 80, 168, 80],
        [132, 140, 168, 140],
        [122, 174, 178, 174],
      ],
      atoms: [
        [110, 24, 'P'],
        [190, 24, 'P'],
        [110, 196, 'P'],
        [190, 196, 'P'],
      ],
    },
  },
};
