/**
 * Copies only the files the app needs into dist/ — that folder is what gets deployed.
 * Tests, scripts, README and package.json stay out of the public site.
 *
 * Usage: npm run build     (Cloudflare Pages runs this on every push to main)
 */
import { cpSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = new URL('../dist/', import.meta.url);

const APP_FILES = ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'icons'];

rmSync(OUT, { recursive: true, force: true });
for (const file of APP_FILES) {
  const from = new URL(file, `file://${ROOT}`);
  if (!existsSync(from)) throw new Error(`Missing app file: ${file}`);
  cpSync(from, new URL(file, OUT), { recursive: true });
}
console.log(`dist/ ready: ${APP_FILES.join(', ')}`);
