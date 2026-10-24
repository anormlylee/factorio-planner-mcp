import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const read = path => readFileSync(new URL(`../data/${path}`, import.meta.url));
export const manifest = JSON.parse(read('manifest.json'));
export function loadDataset(id) {
  const raw = read(`${id}/data.json`);
  if (createHash('sha256').update(raw).digest('hex') !== manifest.datasets[id].sha256) {
    const error = new Error('数据文件与固定快照不一致。');
    error.code = 'DATA_INTEGRITY_ERROR';
    throw error;
  }
  return { data: JSON.parse(raw), zh: JSON.parse(read(`${id}/zh.json`)) };
}
