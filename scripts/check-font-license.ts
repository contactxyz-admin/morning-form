/**
 * Fail-closed deploy gate for known trial-license webfont builds.
 *
 * The New Edge 666 and ABC Diatype Rounded Semi Mono evaluation files once
 * committed to this repository prohibit redistribution and public hosting.
 * This gate scans every font asset under src/ and public/ by both historical
 * filename and SHA-256 fingerprint, so renaming or moving the same bytes does
 * not bypass the production safeguard.
 *
 * Commercially licensed replacements must use separately verified build files.
 * There is intentionally no environment-variable override.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FONT_EXTENSIONS = new Set([".eot", ".otf", ".ttf", ".woff", ".woff2"]);

const TRIAL_FONT_FILES = new Set([
  "NewEdge666-Light.otf",
  "NewEdge666-Regular.otf",
  "NewEdge666-SemiBold.otf",
  "NewEdge666-UltraBold.otf",
  "DiatypeRoundedSemiMono-Regular.otf",
  "DiatypeRoundedSemiMono-Medium.otf",
]);

export const TRIAL_FONT_HASHES = new Map<string, string>([
  [
    "17876087ec29269c5139996ba0b8cf031c1c06ce2ea38f96cd1d5a2394f19a8c",
    "New Edge 666 Light trial build",
  ],
  [
    "80e0f1f02a29ec2b0f9e05bef2583961e921c8a44785e40168ae053480b0acd6",
    "New Edge 666 Regular trial build",
  ],
  [
    "fb6b91de2758b35b7fe4ca081d586ae73bea5eadcb511a6d20ed4efc3531bf9b",
    "New Edge 666 SemiBold trial build",
  ],
  [
    "7378166d749171ea2bdfb4205cef1ee4c326378728bc9ba4a1965dbc6569483c",
    "New Edge 666 UltraBold trial build",
  ],
  [
    "0fcbecb76bdf225406b0dcabe288423cff1b358abd822e742292062abbc5e1b3",
    "Diatype Rounded Semi Mono Regular trial build",
  ],
  [
    "ccdcdd9800937b7ee003d6bee478ca2c08d420aca36a926dfa940c3f278df53c",
    "Diatype Rounded Semi Mono Medium trial build",
  ],
]);

export interface TrialFontViolation {
  path: string;
  matchedFilename: boolean;
  matchedBuild?: string;
}

function fontFilesUnder(directory: string): string[] {
  if (!existsSync(directory)) return [];

  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...fontFilesUnder(path));
    } else if (
      (entry.isFile() || entry.isSymbolicLink()) &&
      FONT_EXTENSIONS.has(extname(entry.name).toLowerCase())
    ) {
      files.push(path);
    }
  }
  return files;
}

export function findTrialFontViolations(
  root = process.cwd(),
  trialHashes: ReadonlyMap<string, string> = TRIAL_FONT_HASHES,
): TrialFontViolation[] {
  const absoluteRoot = resolve(root);
  const fontFiles = [
    join(absoluteRoot, "src"),
    join(absoluteRoot, "public"),
  ].flatMap(fontFilesUnder);

  return fontFiles.flatMap((path) => {
    const matchedFilename = TRIAL_FONT_FILES.has(basename(path));
    const hash = createHash("sha256").update(readFileSync(path)).digest("hex");
    const matchedBuild = trialHashes.get(hash);
    if (!matchedFilename && !matchedBuild) return [];

    return [
      {
        path: relative(absoluteRoot, path),
        matchedFilename,
        ...(matchedBuild ? { matchedBuild } : {}),
      },
    ];
  });
}

export function runFontLicenseCheck(root = process.cwd()): number {
  const violations = findTrialFontViolations(root);
  if (violations.length === 0) {
    console.log("[font-license] No known trial fonts present — OK.");
    return 0;
  }

  console.error(
    "[font-license] FAIL: trial-license font files are present and would be bundled into the production build:",
  );
  for (const violation of violations) {
    const reason = violation.matchedBuild
      ? `matches ${violation.matchedBuild}`
      : "uses a denied trial-build filename";
    console.error(`  - ${violation.path} (${reason})`);
  }
  console.error(
    "[font-license] These assets must not be served publicly. Replace them with verified production-licensed builds or licensed alternatives.",
  );
  return 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  process.exitCode = runFontLicenseCheck();
}
