import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('data/manifest.json', root)));
for (const [id, metadata] of Object.entries(manifest.datasets)) {
  const raw = await readFile(new URL(`data/${id}/data.json`, root));
  assert.equal(createHash('sha256').update(raw).digest('hex'), metadata.sha256, `Dataset integrity: ${id}`);
}
const upstream = new URL('node_modules/glpk.js/', root);
const pkg = JSON.parse(await readFile(new URL('package.json', upstream)));
assert.equal(pkg.version, '5.0.0', 'Review Worker compatibility patches before upgrading GLPK.js');
let source = await readFile(new URL('dist/glpk.js', upstream), 'utf8');
// Reproducible compatibility adaptations to the upstream GPL-3.0 distribution.
// No solver/math changes: forward Emscripten options, select the non-Node
// environment, and use the existing in-memory FS rather than a host FS mount.
for (const [before, after] of [
  ['var t=()=>r();export{t as default};', 'var t=options=>r(options);export{t as default};'],
  ['o=globalThis.process?.versions?.node&&"renderer"!=globalThis.process?.type', 'o=false'],
  ['te.mount(V,{root:"."},"/out"),', ''],
  ['return he=function(){function e(e,t)', 'return he=await function(){function e(e,t)'],
]) {
  assert.equal(source.split(before).length, 2, `Exactly one upstream patch anchor: ${before}`);
  source = source.replace(before, after);
}
const output = new URL('src/generated/', root);
await mkdir(output, { recursive: true });
async function writeIfChanged(url, contents) {
  const next = Buffer.from(contents);
  try { if ((await readFile(url)).equals(next)) return; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await writeFile(url, next);
}
await writeIfChanged(new URL('glpk-worker-factory.js', output), '// Generated from GLPK.js 5.0.0 (GPL-3.0). See scripts/prepare-worker.js and THIRD_PARTY_NOTICES.md.\n' + source);
await writeIfChanged(new URL('glpk.wasm', output), await readFile(new URL('dist/glpk.wasm', upstream)));
console.log('Verified pinned datasets; generated GLPK.js Worker adapter and WASM.');
