/**
 * Procedurally renders a small "hand-drawn ink" molecule illustration as an
 * inline SVG string, ported from the Claude Design mockup's buildMol().
 * Deterministic: the coordinate spec is hashed into a PRNG seed, so the same
 * spec always renders the same stippling/atom jitter — no two renders of the
 * same molecule differ, and there's no client/server mismatch risk.
 */

export type MoleculeBond = readonly [number, number, number, number];
export type MoleculeAtom = readonly [number, number, string];

export interface MoleculeSpec {
  /** Ring polygon as "x,y x,y ..." */
  readonly ring?: string;
  readonly bonds?: ReadonlyArray<MoleculeBond>;
  readonly doubles?: ReadonlyArray<MoleculeBond>;
  readonly atoms?: ReadonlyArray<MoleculeAtom>;
  /** SVG path "d" strings for curved backbones (e.g. the DNA helix). */
  readonly curves?: ReadonlyArray<string>;
}

const INK = '#17191d';
const ATOM_COLORS: Record<string, string> = {
  O: '#C0392B',
  N: '#2E5FB0',
  S: '#C8912E',
  P: '#C56A2C',
  C: '#3a3f47',
};

function hashSeed(spec: MoleculeSpec): number {
  let h = 2166136261;
  const feed = JSON.stringify(spec);
  for (let i = 0; i < feed.length; i++) {
    h ^= feed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) || 123456789;
}

function makeRng(seed: number): () => number {
  let s = seed;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

function segPath([x1, y1, x2, y2]: MoleculeBond): string {
  return `M${x1},${y1} L${x2},${y2}`;
}

export function buildMoleculeSvg(spec: MoleculeSpec): string {
  const seed = hashSeed(spec);
  const rnd = makeRng(seed);

  const pts: Array<[number, number]> = [];
  if (spec.ring) {
    for (const p of spec.ring.split(' ')) {
      const [x, y] = p.split(',').map(Number);
      pts.push([x, y]);
    }
  }
  for (const [x1, y1, x2, y2] of spec.bonds ?? []) {
    pts.push([x1, y1]);
    pts.push([x2, y2]);
    pts.push([(x1 + x2) / 2, (y1 + y2) / 2]);
  }
  for (const [x1, y1, x2, y2] of spec.doubles ?? []) {
    pts.push([(x1 + x2) / 2, (y1 + y2) / 2]);
  }
  for (const [x, y] of spec.atoms ?? []) pts.push([x, y]);
  for (const d of spec.curves ?? []) {
    const nums = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  minX -= 10;
  minY -= 10;
  maxX += 10;
  maxY += 10;

  const near = (x: number, y: number): number => {
    let m = Infinity;
    for (const [px, py] of pts) {
      const dx = px - x;
      const dy = py - y;
      const d = dx * dx + dy * dy;
      if (d < m) m = d;
    }
    return m;
  };

  let stip = '';
  for (let i = 0; i < 140; i++) {
    const x = minX + rnd() * (maxX - minX);
    const y = minY + rnd() * (maxY - minY);
    const d = near(x, y);
    if (d < 470) {
      const r = (0.5 + rnd() * 1.15).toFixed(2);
      const o = (0.2 + rnd() * 0.42).toFixed(2);
      stip += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${INK}" fill-opacity="${o}"></circle>`;
    }
  }

  const bp = (spec.bonds ?? []).map(segPath).join(' ');
  const dp = (spec.doubles ?? []).map(segPath).join(' ');
  const curvesList = spec.curves ?? [];
  const ringFill = spec.ring
    ? `<polygon points="${spec.ring}" fill="${INK}" fill-opacity="0.05"></polygon>`
    : '';

  let hatch = '';
  if (spec.ring) {
    const rp = spec.ring.split(' ').map((p) => p.split(',').map(Number));
    let cxs = 0;
    let cys = 0;
    for (const [x, y] of rp) {
      cxs += x;
      cys += y;
    }
    cxs /= rp.length;
    cys /= rp.length;
    for (let i = 0; i < 5; i++) {
      const off = (i - 2) * 6.5;
      hatch += `<line x1="${(cxs - 17 + off).toFixed(1)}" y1="${(cys + 15).toFixed(1)}" x2="${(cxs - 3 + off).toFixed(1)}" y2="${(cys - 15).toFixed(1)}" stroke="${INK}" stroke-width="0.8" stroke-opacity="0.26" stroke-linecap="round"></line>`;
    }
  }

  const curves =
    curvesList
      .map((d) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="8.5" stroke-linecap="round"></path>`)
      .join('') +
    curvesList
      .map(
        (d) =>
          `<path d="${d}" fill="none" stroke="#ffffff" stroke-opacity="0.45" stroke-width="2" stroke-linecap="round"></path>`,
      )
      .join('');

  const bstroke = bp
    ? `<path d="${bp}" fill="none" stroke="${INK}" stroke-width="6.2" stroke-linecap="round" stroke-linejoin="round"></path>`
    : '';
  const dstroke = dp
    ? `<path d="${dp}" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-opacity="0.9"></path>`
    : '';

  const atoms = (spec.atoms ?? [])
    .map(([x, y, el]) => {
      const c = ATOM_COLORS[el] ?? ATOM_COLORS.C;
      let ring2 = '';
      for (let k = 0; k < 7; k++) {
        const ang = (k / 7) * 6.2832 + rnd() * 0.6;
        const rr = 6.2 + rnd() * 1.4;
        ring2 += `<circle cx="${(x + Math.cos(ang) * rr).toFixed(1)}" cy="${(y + Math.sin(ang) * rr).toFixed(1)}" r="${(0.8 + rnd() * 0.6).toFixed(2)}" fill="${c}"></circle>`;
      }
      return `<circle cx="${x}" cy="${y}" r="10.6" fill="#F6F3EC" fill-opacity="0.92" stroke="${INK}" stroke-width="1.6"></circle>${ring2}<circle cx="${x}" cy="${y}" r="4.3" fill="${c}"></circle><circle cx="${(x - 1.4).toFixed(1)}" cy="${(y - 1.6).toFixed(1)}" r="1.3" fill="#ffffff" fill-opacity="0.75"></circle>`;
    })
    .join('');

  const fid = 'ink' + seed.toString(36);
  return `<svg viewBox="0 0 300 200" role="img" style="width:100%;height:auto;display:block"><defs><filter id="${fid}" x="-15%" y="-15%" width="130%" height="130%"><feTurbulence type="fractalNoise" baseFrequency="0.021 0.03" numOctaves="2" seed="${seed % 97}" result="t"></feTurbulence><feDisplacementMap in="SourceGraphic" in2="t" scale="3.1" xChannelSelector="R" yChannelSelector="G"></feDisplacementMap></filter></defs><g filter="url(#${fid})">${ringFill}${hatch}${stip}${curves}${dstroke}${bstroke}${atoms}</g></svg>`;
}
