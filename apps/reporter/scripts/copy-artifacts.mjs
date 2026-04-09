/**
 * Copies circuit artifacts (wasm + zkey) from the parent project's
 * circuits-artifacts/ directory into this frontend's public/circuits/
 * directory so they can be served statically for browser-side proof generation.
 *
 * Run once after the circuit has been compiled:
 *   pnpm run copy-artifacts
 */
import { copyFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const ARTIFACTS = resolve(ROOT, "..", "circuits-artifacts");
const DEST = resolve(ROOT, "public", "circuits");

if (!existsSync(ARTIFACTS)) {
  console.error(
    `ERROR: circuits-artifacts not found at ${ARTIFACTS}\n` +
      "Run `pnpm run compile:circuit` in the parent directory first."
  );
  process.exit(1);
}

mkdirSync(DEST, { recursive: true });

const files = [
  ["membership_js/membership.wasm", "membership.wasm"],
  ["membership_final.zkey", "membership_final.zkey"],
  ["verification_key.json", "verification_key.json"],
];

for (const [src, dest] of files) {
  const srcPath = resolve(ARTIFACTS, src);
  const destPath = resolve(DEST, dest);
  copyFileSync(srcPath, destPath);
  console.log(`  ✓ ${src} → public/circuits/${dest}`);
}

console.log("\nArtifacts copied. public/circuits/ is ready.");
