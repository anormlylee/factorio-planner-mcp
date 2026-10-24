import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const commit = process.argv[2];
if (!/^[a-f0-9]{40}$/.test(commit ?? '')) {
  console.error('Usage: npm run sync:data -- UPSTREAM_40_CHARACTER_COMMIT_SHA');
  process.exit(1);
}
const root = new URL('../', import.meta.url);
const manifestUrl = new URL('data/manifest.json', root);
const manifest = JSON.parse(await readFile(manifestUrl));
const base = `https://raw.githubusercontent.com/factoriolab/factoriolab/${commit}/`;
async function download(path) {
  const response = await fetch(base + path, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Download failed: ${path} (${response.status})`);
  return await response.text();
}
const pending = await Promise.all(Object.keys(manifest.datasets).map(async id => {
  const [data, zh] = await Promise.all([download(`public/data/${id}/data.json`), download(`public/data/${id}/i18n/zh.json`)]);
  const parsed = JSON.parse(data);
  JSON.parse(zh);
  if (!Array.isArray(parsed.items) || !Array.isArray(parsed.recipes) || !parsed.version) throw new Error(`Unsupported dataset format: ${id}`);
  return { id, data, zh, version: parsed.version, sha256: createHash('sha256').update(data).digest('hex') };
}));
const license = await download('LICENSE');
if (!license.includes('Permission is hereby granted')) throw new Error('Upstream license changed; review it manually.');
// All network downloads and validation finish before replacing snapshots.
for (const { id, data, zh, version, sha256 } of pending) {
  await writeFile(new URL(`data/${id}/data.json`, root), data);
  await writeFile(new URL(`data/${id}/zh.json`, root), zh);
  manifest.datasets[id] = { ...manifest.datasets[id], version, sha256 };
}
await writeFile(new URL('data/FACTORIOLAB-LICENSE', root), license);
manifest.commit = commit;
await writeFile(manifestUrl, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Updated ${pending.length} datasets to ${commit}. Review changes and provenance notices, then rerun tests and examples.`);
