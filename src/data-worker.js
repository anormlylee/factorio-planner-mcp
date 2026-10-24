import manifest from '../data/manifest.json' with { type: 'json' };
import data21 from '../data/2x1/data.json' with { type: 'json' };
import zh21 from '../data/2x1/zh.json' with { type: 'json' };
import base21 from '../data/2.1/data.json' with { type: 'json' };
import baseZh21 from '../data/2.1/zh.json' with { type: 'json' };
import data20 from '../data/spa/data.json' with { type: 'json' };
import zh20 from '../data/spa/zh.json' with { type: 'json' };
import base20 from '../data/2.0/data.json' with { type: 'json' };
import baseZh20 from '../data/2.0/zh.json' with { type: 'json' };

export { manifest };
const datasets = {
  '2x1': { data: data21, zh: zh21 }, '2.1': { data: base21, zh: baseZh21 },
  'spa': { data: data20, zh: zh20 }, '2.0': { data: base20, zh: baseZh20 },
};
export function loadDataset(id) { return datasets[id]; }
