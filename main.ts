// Vice Cover Studio — the entrypoint (Node 22, standard library only).
// Hands the app in: pre-checks app/index.html and screenshots/, copies app/
// and screenshots/ from beside this file to /output (or MAKEFUN_OUTPUT_DIR
// outside the grader), writes /output/dossier.json with the vendored make.fun
// library, then verifies the dossier is byte-identical to a fresh build and
// under the 1.5 MiB cap. Any failed check exits 1 with a named error, so a
// broken entry never ships silently.
//
// Run it locally with: mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the
// bytes; the others refuse an entry the scorer would refuse (more than 4
// screenshots or one over 256 KiB; more than 993 files in app/ or 48 MiB of
// app files, in all, or a path under app/ over 1000 bytes).
const DOSSIER_OPTIONS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000,
};
const DOSSIER_MAX_BYTES = 1572864; // 1.5 MiB
const OUTPUT_MAX_ENTRIES = 1000;
const OUTPUT_MAX_BYTES = 67108864; // 64 MiB

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** A named failure: the code names the check, the message says what broke. */
class EntryError extends Error {
  constructor(code, message) {
    super(`[${code}] ${message}`);
    this.code = code;
  }
}

function fail(code, message) {
  throw new EntryError(code, message);
}

/** Counts the files and bytes under a directory, recursively. */
function countTree(dir) {
  let files = 0;
  let bytes = 0;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) {
      const sub = countTree(path);
      files += sub.files + 1;
      bytes += sub.bytes;
    } else if (st.isFile()) {
      files += 1;
      bytes += st.size;
    }
  }
  return { files, bytes };
}

/** Pre-check 1: the app entrypoint exists and is a real file. */
function checkAppEntry() {
  const index = join(here, 'app', 'index.html');
  if (!existsSync(index) || !statSync(index).isFile()) {
    fail('PRECHECK_INDEX_MISSING', `app/index.html is missing beside main.ts (${index})`);
  }
  if (statSync(index).size > 1048576) {
    fail('PRECHECK_INDEX_TOO_BIG', 'app/index.html is over the 1 MiB cap');
  }
}

/** Pre-check 2: app/ stays inside the scorer's file and byte caps. */
function checkAppSize() {
  const { files, bytes } = countTree(join(here, 'app'));
  if (files > DOSSIER_OPTIONS.app_max_files) {
    fail('PRECHECK_APP_TOO_MANY_FILES', `app/ holds ${files} files, over the 993 cap`);
  }
  if (bytes > DOSSIER_OPTIONS.app_max_bytes) {
    fail('PRECHECK_APP_TOO_BIG', `app/ holds ${bytes} bytes, over the 48 MiB cap`);
  }
}

/** Reads a PNG or JPEG's pixel dimensions from its header, or null when the
 *  file is neither. No image library: PNG stores them at fixed offsets, and
 *  JPEG in its first SOF0/SOF2 frame marker. */
function readImageDimensions(path) {
  const buf = readFileSync(path);
  if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buf.length) {
      if (buf[offset] !== 0xff) break;
      const marker = buf[offset + 1];
      const length = buf.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { w: buf.readUInt16BE(offset + 7), h: buf.readUInt16BE(offset + 5) };
      }
      offset += 2 + length;
    }
  }
  return null;
}

/** Pre-check 3: screenshots/ holds 3 or 4 images, each within the cap. */
function checkScreenshots() {
  const dir = join(here, 'screenshots');
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    fail('PRECHECK_SCREENSHOTS_MISSING', 'screenshots/ is missing beside main.ts');
  }
  const names = readdirSync(dir)
    .filter((n) => !n.startsWith('.'))
    .sort();
  if (names.length < 3 || names.length > DOSSIER_OPTIONS.screenshots.max) {
    fail(
      'PRECHECK_SCREENSHOT_COUNT',
      `screenshots/ holds ${names.length} images, need 3 or 4`,
    );
  }
  for (const name of names) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(name)) {
      fail('PRECHECK_SCREENSHOT_NAME', `screenshot name is not allowed: ${name}`);
    }
    const path = join(dir, name);
    if (!statSync(path).isFile()) {
      fail('PRECHECK_SCREENSHOT_NOT_FILE', `screenshot is not a regular file: ${name}`);
    }
    const size = statSync(path).size;
    if (size > DOSSIER_OPTIONS.screenshots.max_bytes) {
      fail(
        'PRECHECK_SCREENSHOT_TOO_BIG',
        `screenshot ${name} is ${size} bytes, over the 256 KiB cap`,
      );
    }
    const dims = readImageDimensions(path);
    if (!dims) {
      fail('PRECHECK_SCREENSHOT_NOT_IMAGE', `screenshot ${name} is not a whole PNG or JPEG`);
    }
    const longSide = Math.max(dims.w, dims.h);
    const shortSide = Math.min(dims.w, dims.h);
    if (longSide > 1280 || shortSide < 480) {
      fail(
        'PRECHECK_SCREENSHOT_DIMENSIONS',
        `screenshot ${name} is ${dims.w}x${dims.h}: long side over 1280 or short side under 480`,
      );
    }
  }
  return names;
}

/** Copies app/ and screenshots/ into a clean output directory. */
function copyInputs() {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  cpSync(join(here, 'app'), join(out, 'app'), { recursive: true });
  mkdirSync(join(out, 'screenshots'), { recursive: true });
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

/** Verifies the whole output stays inside the platform's own caps. */
function checkOutputSize() {
  const { files, bytes } = countTree(out);
  if (files > OUTPUT_MAX_ENTRIES) {
    fail('OUTPUT_TOO_MANY_ENTRIES', `/output holds ${files} entries, over the 1000 cap`);
  }
  if (bytes > OUTPUT_MAX_BYTES) {
    fail('OUTPUT_TOO_BIG', `/output holds ${bytes} bytes, over the 64 MiB cap`);
  }
}

function main() {
  checkAppEntry();
  checkAppSize();
  const shotNames = checkScreenshots();
  copyInputs();

  // buildDossier returns the dossier as a Uint8Array of JSON bytes: write
  // it raw, and compare the rebuild as bytes too (String() on a Uint8Array
  // would give a comma list of byte values, not the dossier text).
  const dossier = buildDossier(out, DOSSIER_OPTIONS);
  const dossierPath = join(out, 'dossier.json');
  writeFileSync(dossierPath, dossier);

  // Verify: the dossier on disk is byte-identical to a fresh build, and
  // under the cap — the exact property the scorer's dossier_matches checks.
  const written = readFileSync(dossierPath);
  const rebuilt = buildDossier(out, DOSSIER_OPTIONS);
  if (!Buffer.from(written).equals(Buffer.from(rebuilt))) {
    fail('DOSSIER_NOT_STABLE', 'dossier.json differs from a fresh buildDossier run');
  }
  if (written.length > DOSSIER_MAX_BYTES) {
    fail(
      'DOSSIER_TOO_BIG',
      `dossier.json is ${written.length} bytes, over the 1.5 MiB cap`,
    );
  }
  checkOutputSize();

  const appStats = countTree(join(out, 'app'));
  console.log(
    `Vice Cover Studio handed in: app/ ${appStats.files} files, ` +
      `${shotNames.length} screenshots (${shotNames.join(', ')}), ` +
      `dossier.json ${written.length} bytes.`,
  );
}

try {
  main();
} catch (error) {
  if (error instanceof EntryError) {
    console.error(`error: ${error.message}`);
  } else {
    console.error(`error: [UNEXPECTED] ${error instanceof Error ? error.message : String(error)}`);
  }
  process.exit(1);
}
