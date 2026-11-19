// Vice Cover Studio — the hand-in program for gta6-cover-art-01 (Node 22, standard
// library only). It assembles the entry in /output: the web app from app/, the four
// screenshots from screenshots/, and the dossier the judge reads, written by the
// kit's vendored library (vendor/makefun-app.ts). Outside the grader's container
// MAKEFUN_OUTPUT_DIR stands in for /output:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The program is deliberately strict before it writes anything: it refuses to
// hand in a broken entry (missing index.html, a wrong number of screenshots, an
// oversize image) with a named error instead of failing halfway through the copy,
// and after writing it reads the dossier back and checks it byte for byte against
// a fresh build, so a bad dossier can never be submitted by accident. Any failure
// exits non-zero with the reason on stderr; success prints a short summary.

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

// The scorer's own caps (the kit's gate.json, passed through unchanged): only
// text_max_bytes shapes the dossier's bytes; the rest refuse an entry the scorer
// would refuse, so this program refuses it first, with a clearer message.
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000,
} as const;

const SHOT_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg']);

/** A fatal, named failure: printed to stderr, exit code 1. */
function fail(message: string): never {
  console.error(`main.ts: ${message}`);
  process.exit(1);
}

const here = resolve(fileURLToPath(new URL('.', import.meta.url)));
const outDir = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

/** The app's own front door: the entry is not an entry without it. */
function checkApp(): void {
  const index = join(here, 'app', 'index.html');
  if (!existsSync(index)) fail('app/index.html is missing — the app has no page to hand in');
  if (!statSync(index).isFile()) fail('app/index.html is not a regular file');
}

/**
 * Screenshots must be 3 or 4 whole PNG/JPEG files, each within the byte cap, so
 * the gate's screenshots row passes on what this program writes.
 */
function checkShots(): string[] {
  const dir = join(here, 'screenshots');
  if (!existsSync(dir)) fail('screenshots/ is missing — the entry needs 3 or 4 screenshots');
  const names = readdirSync(dir)
    .filter((name) => !name.startsWith('.'))
    .sort();
  if (names.length < 3 || names.length > DOSSIER_CAPS.screenshots.max) {
    fail(`screenshots/ holds ${names.length} images — the gate wants 3 or 4`);
  }
  for (const name of names) {
    const lower = name.toLowerCase();
    const dot = lower.lastIndexOf('.');
    const ext = dot < 0 ? '' : lower.slice(dot);
    if (!SHOT_EXTENSIONS.has(ext)) {
      fail(`screenshots/${name}: a ${ext || 'missing'} extension — only PNG or JPEG`);
    }
    const size = statSync(join(dir, name)).size;
    if (size > DOSSIER_CAPS.screenshots.max_bytes) {
      fail(`screenshots/${name} is ${size} bytes — over the ${DOSSIER_CAPS.screenshots.max_bytes} allowed`);
    }
  }
  return names;
}

/** Copies one tree, replacing whatever the destination held, file for file. */
function copyTree(from: string, to: string): void {
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
}

function main(): void {
  checkApp();
  const shots = checkShots();

  mkdirSync(outDir, { recursive: true });
  copyTree(join(here, 'app'), join(outDir, 'app'));
  copyTree(join(here, 'screenshots'), join(outDir, 'screenshots'));

  const dossier = buildDossier(outDir, DOSSIER_CAPS);
  const dossierPath = join(outDir, 'dossier.json');
  writeFileSync(dossierPath, dossier);

  // Read back what was written and compare: the dossier on disk must be exactly
  // what the library builds from the same directory, or the gate's
  // dossier_matches row would fail on it. The gate also caps the dossier itself
  // at 1.5 MiB, so refuse an oversize one here rather than at the scorer.
  const written = readFileSync(dossierPath);
  if (written.length > 1572864) {
    fail(`dossier.json is ${written.length} bytes — over the 1.5 MiB the gate allows`);
  }
  const rebuilt = buildDossier(outDir, DOSSIER_CAPS);
  if (!written.equals(rebuilt)) {
    fail('dossier.json on disk differs from a fresh build — refusing to hand in');
  }

  const appFiles = readdirSync(join(outDir, 'app')).length;
  console.log(
    [
      'Vice Cover Studio handed in:',
      `  app/         ${appFiles} top-level entries`,
      `  screenshots/ ${shots.map((s) => basename(s)).join(', ')}`,
      `  dossier.json ${written.length} bytes (verified byte-identical on rebuild)`,
      `  output:      ${outDir}`,
    ].join('\n'),
  );
}

main();
