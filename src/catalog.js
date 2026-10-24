import { manifest, loadDataset } from '#catalog-data';
export { manifest };
const cache = new Map();
const aliases = {
  '黑瓶': 'promethium-science-pack', '钷素科技包': 'promethium-science-pack',
  '冷氟酮': 'fluoroketone-cold', '冷氟铜': 'fluoroketone-cold', '氟酮冷': 'fluoroketone-cold',
  '热氟酮': 'fluoroketone-hot', '氟酮热': 'fluoroketone-hot',
  '绿板': 'electronic-circuit', '红板': 'advanced-circuit', '蓝板': 'processing-unit',
  '地星': 'nauvis', '母星': 'nauvis', '新地星': 'nauvis', '玄冥星': 'aquilo',
  '太空平台': 'space-platform', '空桶': 'barrel',
};
const norm = value => String(value).toLowerCase().replace(/[\s()（）:：_-]/g, '');

export class ToolError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export function getCatalog(dataset = manifest.defaultDataset) {
  if (!Object.hasOwn(manifest.datasets, dataset)) {
    throw new ToolError('UNSUPPORTED_DATASET', '该数据集尚未提供，请选择可用数据集。', { available: Object.keys(manifest.datasets) });
  }
  if (cache.has(dataset)) return cache.get(dataset);
  const { data, zh } = loadDataset(dataset);
  const items = new Map(data.items.map(x => [x.id, x]));
  const recipes = new Map(data.recipes.map(x => [x.id, x]));
  const entities = [
    ...data.items.map(x => ({ ...x, kind: 'item', nameZh: zh.items?.[x.id] ?? x.name })),
    ...data.recipes.map(x => ({ ...x, kind: 'recipe', nameZh: zh.recipes?.[x.id] ?? x.name })),
    ...(data.locations ?? []).map(x => ({ ...x, kind: 'location', nameZh: zh.locations?.[x.id] ?? x.name })),
  ];
  const summarize = x => ({ id: x.id, kind: x.kind, name: x.name, nameZh: x.nameZh });
  const c = {
    data, items, recipes,
    provenance: { dataset, ...manifest.datasets[dataset], repository: manifest.repository, commit: manifest.commit, source: `${manifest.repository}/blob/${manifest.commit}/public/data/${dataset}/data.json` },
    search(query, kind, limit = 20) {
      if (typeof query !== 'string' || !query.trim()) throw new ToolError('INVALID_QUERY', '请输入物品、配方或地点名称。');
      const q = norm(query);
      const alias = aliases[query.trim()];
      return entities.filter(x => !kind || x.kind === kind)
        .map(x => ({ x, score: (x.id === alias || norm(x.id) === q || norm(x.name) === q || norm(x.nameZh) === q) ? 2 : ([x.id, x.name, x.nameZh].some(s => norm(s).includes(q)) ? 1 : 0) }))
        .filter(x => x.score).sort((a, b) => b.score - a.score || a.x.id.localeCompare(b.x.id))
        .slice(0, Math.min(50, Math.max(1, limit))).map(({ x }) => summarize(x));
    },
    resolve(query, kind = 'item') {
      const q = norm(query);
      const id = aliases[String(query).trim()] ?? query;
      const exact = entities.find(x => x.kind === kind && x.id === id);
      if (exact) return exact;
      const matches = entities.filter(x => x.kind === kind && (x.id === id || norm(x.id) === q || norm(x.name) === q || norm(x.nameZh) === q));
      if (matches.length === 1) return matches[0];
      throw new ToolError(matches.length ? 'AMBIGUOUS_ENTITY' : 'UNKNOWN_ENTITY', `无法唯一确定${kind}：${query}。先搜索并使用明确的 ID。`, { query, kind, suggestions: matches.length ? matches.map(summarize) : c.search(query, kind) });
    },
    recipe(query) {
      const x = c.resolve(query, 'recipe');
      return { ...x, provenance: c.provenance };
    },
    itemName(id) { return zh.items?.[id] ?? items.get(id)?.name ?? id; },
    recipeName(id) { return zh.recipes?.[id] ?? recipes.get(id)?.name ?? id; },
  };
  cache.set(dataset, c);
  return c;
}

export function listDatasets() {
  return { defaultDataset: manifest.defaultDataset, datasets: Object.entries(manifest.datasets).map(([id, value]) => ({ id, ...value })), note: '这是服务携带的数据快照，不是对用户本机或 Steam 版本的检测。无需先询问版本，未指定时使用默认数据集。' };
}
