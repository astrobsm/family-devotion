// Stamps the service worker's cache VERSION with a hash of every app file, so
// phones that already installed the app pick up changed content.
//   node tools/build.mjs
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WWW = join(dirname(fileURLToPath(import.meta.url)), '..', 'www');
const swPath = join(WWW, 'sw.js');
const sw = readFileSync(swPath, 'utf8');
const files = JSON.parse(
  sw.match(/const FILES = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"').replace(/,\s*\]/, ']'),
).filter((f) => f !== './');

const h = createHash('sha256');
for (const f of files) h.update(f).update(readFileSync(join(WWW, f)));
const version = h.digest('hex').slice(0, 12);

writeFileSync(swPath, sw.replace(/const VERSION = '[^']*';/, `const VERSION = '${version}';`));
console.log(`sw.js VERSION = ${version} (${files.length} files)`);
