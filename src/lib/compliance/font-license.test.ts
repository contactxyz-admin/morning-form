import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  findTrialFontViolations,
  runFontLicenseCheck,
} from "../../../scripts/check-font-license";

const roots: string[] = [];

function fixtureRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), "font-license-"));
  roots.push(root);
  return root;
}

function writeFont(root: string, relativePath: string, bytes: Buffer): void {
  const destination = path.join(root, relativePath);
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, bytes);
}

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
  delete process.env.ALLOW_TRIAL_FONTS;
  vi.restoreAllMocks();
});

describe("findTrialFontViolations", () => {
  it("allows repositories without a denied font asset", () => {
    expect(findTrialFontViolations(fixtureRoot())).toEqual([]);
  });

  it("rejects every historical trial filename even when the bytes differ", () => {
    const root = fixtureRoot();
    writeFont(
      root,
      "src/fonts/NewEdge666-Regular.otf",
      Buffer.from("replacement"),
    );

    expect(findTrialFontViolations(root)).toEqual([
      {
        path: "src/fonts/NewEdge666-Regular.otf",
        matchedFilename: true,
      },
    ]);
  });

  it("rejects renamed or moved copies by content fingerprint", () => {
    const root = fixtureRoot();
    const bytes = Buffer.from("known trial build fixture");
    const hash = createHash("sha256").update(bytes).digest("hex");
    writeFont(root, "public/assets/harmless-name.woff2", bytes);

    expect(
      findTrialFontViolations(root, new Map([[hash, "Known trial fixture"]])),
    ).toEqual([
      {
        path: "public/assets/harmless-name.woff2",
        matchedFilename: false,
        matchedBuild: "Known trial fixture",
      },
    ]);
  });

  it("cannot be bypassed with ALLOW_TRIAL_FONTS", () => {
    process.env.ALLOW_TRIAL_FONTS = "true";
    const root = fixtureRoot();
    writeFont(
      root,
      "src/fonts/DiatypeRoundedSemiMono-Medium.otf",
      Buffer.from("trial"),
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(runFontLicenseCheck(root)).toBe(1);
  });
});
