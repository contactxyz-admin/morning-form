/**
 * Biomarker canonical registry — UK-common lab analytes.
 *
 * Storage contract: `canonicalKey` is the stable id written to GraphNode;
 * `displayName` is what the UI shows; `unit` is the preferred SI/UK-clinical
 * unit; `aliases` are case-insensitive substrings that the extraction LLM
 * uses (and post-hoc mapping can use) to resolve free-form lab labels to
 * canonical ids.
 *
 * `referenceRange` is a UK-standard adult reference range where one is
 * broadly agreed — used only when a lab PDF omits its own ref range (most
 * UK labs print their own). When present it matches the `unit` declared
 * here; range rows with unit conversion belong in unit-normalization
 * (deferred to v2 per plan).
 *
 * Scope: 40+ biomarkers chosen to cover the Iron / Sleep / Energy topic
 * pages (U9/U10/U11) plus the common adjacent panels users upload — full
 * blood count, lipid panel, liver/kidney, thyroid, metabolic. U7 extends
 * this if GP records surface analytes not here.
 */
export type BiomarkerCategory =
  | 'hematology'
  | 'iron'
  | 'thyroid'
  | 'metabolic'
  | 'lipid'
  | 'liver'
  | 'kidney'
  | 'inflammation'
  | 'hormone'
  | 'vitamin_mineral'
  | 'electrolyte';

export interface BiomarkerEntry {
  readonly canonicalKey: string;
  readonly displayName: string;
  readonly unit: string;
  readonly category: BiomarkerCategory;
  readonly aliases: readonly string[];
  readonly referenceRange?: { low: number; high: number };
}

export const BIOMARKER_REGISTRY = [
  // Hematology — full blood count
  { canonicalKey: 'haemoglobin',         displayName: 'Haemoglobin',         unit: 'g/L',     category: 'hematology', aliases: ['haemoglobin', 'hemoglobin', 'hb', 'hgb'],                 referenceRange: { low: 130, high: 175 } },
  { canonicalKey: 'haematocrit',         displayName: 'Haematocrit',         unit: 'L/L',     category: 'hematology', aliases: ['haematocrit', 'hematocrit', 'hct', 'pcv'],                referenceRange: { low: 0.4, high: 0.5 } },
  { canonicalKey: 'red_cell_count',      displayName: 'Red cell count',      unit: '×10¹²/L', category: 'hematology', aliases: ['red cell count', 'red blood cell', 'rbc', 'erythrocyte'] },
  { canonicalKey: 'mcv',                 displayName: 'Mean cell volume',    unit: 'fL',      category: 'hematology', aliases: ['mcv', 'mean cell volume', 'mean corpuscular volume'],    referenceRange: { low: 80, high: 100 } },
  { canonicalKey: 'mch',                 displayName: 'Mean cell haemoglobin', unit: 'pg',    category: 'hematology', aliases: ['mch', 'mean cell haemoglobin', 'mean cell hemoglobin'],   referenceRange: { low: 27, high: 32 } },
  { canonicalKey: 'mchc',                displayName: 'MCHC',                unit: 'g/L',     category: 'hematology', aliases: ['mchc', 'mean cell haemoglobin concentration'] },
  { canonicalKey: 'white_cell_count',    displayName: 'White cell count',    unit: '×10⁹/L',  category: 'hematology', aliases: ['white cell count', 'white blood cell', 'wbc', 'leucocyte'] },
  { canonicalKey: 'platelets',           displayName: 'Platelets',           unit: '×10⁹/L',  category: 'hematology', aliases: ['platelets', 'plt', 'thrombocytes'],                       referenceRange: { low: 150, high: 400 } },
  { canonicalKey: 'neutrophils',         displayName: 'Neutrophils',         unit: '×10⁹/L',  category: 'hematology', aliases: ['neutrophils', 'neut', 'polymorphs'] },
  { canonicalKey: 'lymphocytes',         displayName: 'Lymphocytes',         unit: '×10⁹/L',  category: 'hematology', aliases: ['lymphocytes', 'lymph', 'lymphs'] },

  // Iron panel
  { canonicalKey: 'ferritin',            displayName: 'Ferritin',            unit: 'ug/L',    category: 'iron',       aliases: ['ferritin', 'serum ferritin'],                             referenceRange: { low: 30, high: 400 } },
  { canonicalKey: 'iron',                displayName: 'Serum iron',          unit: 'umol/L',  category: 'iron',       aliases: ['serum iron', 'iron (serum)', 'fe'],                       referenceRange: { low: 11, high: 28 } },
  { canonicalKey: 'tibc',                displayName: 'Total iron binding capacity', unit: 'umol/L', category: 'iron', aliases: ['tibc', 'total iron binding capacity', 'iron binding'] },
  { canonicalKey: 'transferrin_saturation', displayName: 'Transferrin saturation', unit: '%', category: 'iron',      aliases: ['transferrin saturation', 'tsat', 'transferrin sat'],      referenceRange: { low: 20, high: 50 } },

  // Thyroid
  { canonicalKey: 'tsh',                 displayName: 'TSH',                 unit: 'mU/L',    category: 'thyroid',    aliases: ['tsh', 'thyroid stimulating hormone', 'thyrotropin'],      referenceRange: { low: 0.4, high: 4.0 } },
  { canonicalKey: 'free_t4',             displayName: 'Free T4',             unit: 'pmol/L',  category: 'thyroid',    aliases: ['free t4', 'ft4', 'free thyroxine'],                       referenceRange: { low: 12, high: 22 } },
  { canonicalKey: 'free_t3',             displayName: 'Free T3',             unit: 'pmol/L',  category: 'thyroid',    aliases: ['free t3', 'ft3', 'free triiodothyronine'],                referenceRange: { low: 3.1, high: 6.8 } },
  { canonicalKey: 'tpo_antibodies',      displayName: 'TPO antibodies',      unit: 'IU/mL',   category: 'thyroid',    aliases: ['tpo antibodies', 'anti-tpo', 'thyroid peroxidase antibodies'] },

  // Metabolic
  { canonicalKey: 'glucose_fasting',     displayName: 'Fasting glucose',     unit: 'mmol/L',  category: 'metabolic',  aliases: ['fasting glucose', 'glucose fasting', 'fasting blood glucose', 'fbg'], referenceRange: { low: 3.9, high: 5.9 } },
  { canonicalKey: 'hba1c',               displayName: 'HbA1c',               unit: 'mmol/mol', category: 'metabolic', aliases: ['hba1c', 'haemoglobin a1c', 'hemoglobin a1c', 'glycated haemoglobin'], referenceRange: { low: 20, high: 42 } },
  { canonicalKey: 'insulin_fasting',     displayName: 'Fasting insulin',     unit: 'mIU/L',   category: 'metabolic',  aliases: ['fasting insulin', 'insulin fasting', 'insulin (fasting)'] },

  // Lipids
  { canonicalKey: 'total_cholesterol',   displayName: 'Total cholesterol',   unit: 'mmol/L',  category: 'lipid',      aliases: ['total cholesterol', 'cholesterol total', 'cholesterol'],  referenceRange: { low: 0, high: 5.0 } },
  { canonicalKey: 'hdl_cholesterol',     displayName: 'HDL cholesterol',     unit: 'mmol/L',  category: 'lipid',      aliases: ['hdl cholesterol', 'hdl', 'hdl-c', 'high density lipoprotein'], referenceRange: { low: 1.0, high: 2.5 } },
  { canonicalKey: 'ldl_cholesterol',     displayName: 'LDL cholesterol',     unit: 'mmol/L',  category: 'lipid',      aliases: ['ldl cholesterol', 'ldl', 'ldl-c', 'low density lipoprotein'], referenceRange: { low: 0, high: 3.0 } },
  { canonicalKey: 'triglycerides',       displayName: 'Triglycerides',       unit: 'mmol/L',  category: 'lipid',      aliases: ['triglycerides', 'tg', 'trigs'],                           referenceRange: { low: 0, high: 1.7 } },
  { canonicalKey: 'non_hdl_cholesterol', displayName: 'Non-HDL cholesterol', unit: 'mmol/L',  category: 'lipid',      aliases: ['non hdl cholesterol', 'non-hdl cholesterol', 'non hdl', 'non-hdl'] },

  // Liver
  { canonicalKey: 'alt',                 displayName: 'ALT',                 unit: 'U/L',     category: 'liver',      aliases: ['alt', 'alanine aminotransferase', 'alanine transaminase'], referenceRange: { low: 10, high: 45 } },
  { canonicalKey: 'ast',                 displayName: 'AST',                 unit: 'U/L',     category: 'liver',      aliases: ['ast', 'aspartate aminotransferase', 'aspartate transaminase'] },
  { canonicalKey: 'alp',                 displayName: 'Alkaline phosphatase', unit: 'U/L',    category: 'liver',      aliases: ['alp', 'alkaline phosphatase'],                            referenceRange: { low: 30, high: 130 } },
  { canonicalKey: 'ggt',                 displayName: 'GGT',                 unit: 'U/L',     category: 'liver',      aliases: ['ggt', 'gamma gt', 'gamma glutamyl transferase'],          referenceRange: { low: 5, high: 50 } },
  { canonicalKey: 'bilirubin_total',     displayName: 'Total bilirubin',     unit: 'umol/L',  category: 'liver',      aliases: ['total bilirubin', 'bilirubin total', 'bilirubin'],        referenceRange: { low: 3, high: 21 } },
  { canonicalKey: 'albumin',             displayName: 'Albumin',             unit: 'g/L',     category: 'liver',      aliases: ['albumin', 'alb'],                                         referenceRange: { low: 35, high: 50 } },

  // Kidney
  { canonicalKey: 'creatinine',          displayName: 'Creatinine',          unit: 'umol/L',  category: 'kidney',     aliases: ['creatinine', 'creat', 'serum creatinine'],                referenceRange: { low: 60, high: 120 } },
  { canonicalKey: 'urea',                displayName: 'Urea',                unit: 'mmol/L',  category: 'kidney',     aliases: ['urea', 'blood urea nitrogen', 'bun'],                     referenceRange: { low: 2.5, high: 7.8 } },
  { canonicalKey: 'egfr',                displayName: 'eGFR',                unit: 'mL/min/1.73m²', category: 'kidney', aliases: ['egfr', 'estimated gfr', 'glomerular filtration rate'],   referenceRange: { low: 90, high: 120 } },

  // Inflammation
  { canonicalKey: 'crp',                 displayName: 'CRP',                 unit: 'mg/L',    category: 'inflammation', aliases: ['crp', 'c-reactive protein', 'c reactive protein'],      referenceRange: { low: 0, high: 5 } },
  { canonicalKey: 'esr',                 displayName: 'ESR',                 unit: 'mm/hr',   category: 'inflammation', aliases: ['esr', 'erythrocyte sedimentation rate', 'sed rate'],    referenceRange: { low: 0, high: 20 } },

  // Hormones (common uploads)
  { canonicalKey: 'testosterone_total',  displayName: 'Total testosterone',  unit: 'nmol/L',  category: 'hormone',    aliases: ['total testosterone', 'testosterone total', 'testosterone'] },
  { canonicalKey: 'shbg',                displayName: 'SHBG',                unit: 'nmol/L',  category: 'hormone',    aliases: ['shbg', 'sex hormone binding globulin'] },
  { canonicalKey: 'cortisol',            displayName: 'Cortisol',            unit: 'nmol/L',  category: 'hormone',    aliases: ['cortisol', 'serum cortisol'] },

  // Vitamin / mineral
  { canonicalKey: 'vitamin_d',           displayName: 'Vitamin D (25-OH)',   unit: 'nmol/L',  category: 'vitamin_mineral', aliases: ['vitamin d', '25-oh vitamin d', '25 hydroxy vitamin d', 'vit d'], referenceRange: { low: 50, high: 200 } },
  { canonicalKey: 'vitamin_b12',         displayName: 'Vitamin B12',         unit: 'pmol/L',  category: 'vitamin_mineral', aliases: ['vitamin b12', 'b12', 'cobalamin'],                 referenceRange: { low: 180, high: 700 } },
  { canonicalKey: 'folate',              displayName: 'Folate',              unit: 'nmol/L',  category: 'vitamin_mineral', aliases: ['folate', 'folic acid', 'serum folate'],            referenceRange: { low: 7, high: 40 } },
  { canonicalKey: 'magnesium',           displayName: 'Magnesium',           unit: 'mmol/L',  category: 'vitamin_mineral', aliases: ['magnesium', 'mg', 'serum magnesium'],              referenceRange: { low: 0.7, high: 1.0 } },

  // Electrolytes
  { canonicalKey: 'sodium',              displayName: 'Sodium',              unit: 'mmol/L',  category: 'electrolyte', aliases: ['sodium', 'na', 'na+'],                                   referenceRange: { low: 133, high: 146 } },
  { canonicalKey: 'potassium',           displayName: 'Potassium',           unit: 'mmol/L',  category: 'electrolyte', aliases: ['potassium', 'k', 'k+'],                                  referenceRange: { low: 3.5, high: 5.3 } },
  { canonicalKey: 'calcium_adjusted',    displayName: 'Adjusted calcium',    unit: 'mmol/L',  category: 'electrolyte', aliases: ['adjusted calcium', 'calcium adjusted', 'corrected calcium', 'calcium'], referenceRange: { low: 2.2, high: 2.6 } },
] as const satisfies readonly BiomarkerEntry[];

export type BiomarkerCanonicalKey = (typeof BIOMARKER_REGISTRY)[number]['canonicalKey'];

const BY_CANONICAL: Map<string, BiomarkerEntry> = new Map(
  BIOMARKER_REGISTRY.map((b) => [b.canonicalKey, b]),
);

/**
 * Alias lookup (case-insensitive substring). Sorted longest-alias-first so
 * "free t3" wins over "t3" when both would match. Tie-breaks deterministically
 * by canonicalKey for stability.
 */
const ALIAS_INDEX: Array<{ alias: string; entry: BiomarkerEntry }> = BIOMARKER_REGISTRY.flatMap(
  (entry) => entry.aliases.map((alias) => ({ alias: alias.toLowerCase(), entry })),
).sort((a, b) => {
  if (a.alias.length !== b.alias.length) return b.alias.length - a.alias.length;
  return a.entry.canonicalKey.localeCompare(b.entry.canonicalKey);
});

export function getBiomarker(canonicalKey: string): BiomarkerEntry | undefined {
  return BY_CANONICAL.get(canonicalKey);
}

/**
 * Resolve a free-form lab-report label to a biomarker entry. Matches the
 * longest alias that appears as a case-insensitive substring. Returns
 * `undefined` when no alias matches — callers should then store the value
 * as an unknown/other biomarker node with the raw label, not silently drop.
 */
export function resolveBiomarker(label: string): BiomarkerEntry | undefined {
  const needle = label.toLowerCase();
  for (const { alias, entry } of ALIAS_INDEX) {
    if (needle.includes(alias)) return entry;
  }
  return undefined;
}

export const BIOMARKER_CANONICAL_KEYS: readonly BiomarkerCanonicalKey[] = BIOMARKER_REGISTRY.map(
  (b) => b.canonicalKey,
);
