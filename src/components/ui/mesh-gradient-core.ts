/**
 * Pure helpers for deterministic mesh gradients. Kept separate from the React
 * primitive (`./mesh-gradient`) so unit tests can import without pulling JSX
 * through the test pipeline. Output is fully determined by seed + variant.
 *
 * Palette constraints (vs seam's original): hues sit near our sage / clay /
 * deep-moss tokens; saturation capped at 50%; lightness in 76–84%. The goal is
 * "paper-tinted atmosphere" rather than "vivid poster".
 */

export function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

const BASE_HUES = [95, 35, 150] as const;

export function generateMeshGradient(seed: string, variant?: string): string {
  const h = hashString(variant ? `${seed}:${variant}` : seed);

  const baseHue = BASE_HUES[h % BASE_HUES.length] + ((h >> 3) % 21) - 10; // ±10 jitter
  const hueA = baseHue + 55;
  const hueB = baseHue + 175;

  const sat = 30 + ((h >> 6) % 21); // 30–50%
  const lit = 76 + ((h >> 9) % 9); // 76–84%

  const x1 = 18 + ((h >> 12) % 65);
  const y1 = 18 + ((h >> 15) % 65);
  const x2 = 18 + ((h >> 18) % 65);
  const y2 = 18 + ((h >> 21) % 65);

  const baseColor = `hsl(${baseHue}, ${Math.max(sat - 18, 12)}%, ${Math.min(lit + 6, 92)}%)`;

  return [
    `radial-gradient(at ${x1}% ${y1}%, hsl(${baseHue}, ${sat}%, ${lit}%) 0px, transparent 55%)`,
    `radial-gradient(at ${x2}% ${y2}%, hsl(${hueA}, ${sat}%, ${lit}%) 0px, transparent 55%)`,
    `radial-gradient(at ${100 - x1}% ${100 - y1}%, hsl(${hueB}, ${Math.max(sat - 8, 12)}%, ${Math.min(lit + 2, 90)}%) 0px, transparent 60%)`,
    baseColor,
  ].join(', ');
}
