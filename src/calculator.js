import GLPK from '#solver';
import { getCatalog, ToolError } from './catalog.js';

const glpkPromise = GLPK();
const EPS = 1e-7;
const clean = n => Math.abs(n) < 1e-9 ? 0 : Number(n.toPrecision(12));
const amount = value => {
  if (typeof value === 'string' && value.includes('/')) {
    const [a, b] = value.split('/').map(Number);
    return a / b;
  }
  return Number(value ?? 0);
};
const quantities = record => Object.fromEntries(Object.entries(record ?? {}).map(([k, v]) => [k, amount(v)]));
const net = (r, id) => (r.outputs[id] ?? 0) - (r.inputs[id] ?? 0);

function invalid(message, details) { throw new ToolError('INVALID_SETTINGS', message, details); }
function finiteRate(rate) {
  if (!Number.isFinite(rate) || rate <= 0 || rate > 1e9) invalid('产量必须是大于 0 且不超过 10 亿的有限数字。');
}

const machineAllowedAt = (c, id, location) => !location || !c.items.get(id)?.machine?.locations?.length || c.items.get(id).machine.locations.includes(location);

export function adjustRecipe(c, recipe, config = {}, location = null) {
  const machineId = config.machine ? c.resolve(config.machine).id : recipe.producers?.find(id => machineAllowedAt(c, id, location));
  if (machineId && !recipe.producers?.includes(machineId)) invalid('该机器无法执行此配方。', { recipe: recipe.id, machine: machineId, allowed: recipe.producers });
  const item = machineId ? c.items.get(machineId) : undefined;
  const quality = config.quality ?? 'normal';
  if (!c.data.qualities?.some(q => q.id === quality) && quality !== 'normal') invalid('数据集不支持这个机器品质。', { quality });
  const base = item?.machine ?? {};
  if (quality !== 'normal' && !base.qualityRecord?.[quality]) invalid('该机器没有可用的品质数据。', { machineId, quality });
  const machine = { ...base, ...(base.qualityRecord?.[quality] ?? {}) };
  let productivity = 1 + amount(machine.baseEffect?.productivity);
  let speedEffect = 1 + amount(machine.baseEffect?.speed);
  const bonus = config.productivityBonus ?? 0;
  if (!Number.isFinite(bonus) || bonus < 0 || bonus > 100000) invalid('增产研究加成为非负百分数，例如 20 表示 +20%。');
  const researchAvailable = c.data.items.some(x => x.technology?.recipeProductivity?.some(r => r.id === recipe.id));
  if (bonus > 0 && !researchAvailable) invalid('数据中没有适用于该配方的增产研究。', { recipe: recipe.id });
  // Base machine and research bonuses apply independently of module eligibility,
  // matching FactorioLab Adjustment; module restrictions are validated below.
  productivity += bonus / 100;
  let slots = 0;
  for (const mod of config.modules ?? []) {
    const mItem = c.resolve(mod.id);
    if (!mItem.module) invalid('指定物品不是插件。', { module: mod.id });
    const q = mod.quality ?? 'normal';
    if (q !== 'normal' && !mItem.module.qualityRecord?.[q]) invalid('该插件没有可用的品质数据。', { module: mod.id, quality: q });
    const m = { ...mItem.module, ...(mItem.module.qualityRecord?.[q] ?? {}) };
    if (!Number.isInteger(mod.count) || mod.count < 1) invalid('插件数量必须是正整数。');
    slots += mod.count;
    if (amount(m.quality) > 0) invalid('第一版不支持品质插件的随机品质产物；请使用确定性产线。');
    for (const effect of ['productivity', 'speed', 'consumption', 'pollution', 'quality']) {
      if (amount(m[effect]) !== 0 && (recipe.disallowedEffects?.includes(effect) || machine.disallowedEffects?.includes(effect))) invalid('该配方或机器不允许此插件效果。', { recipe: recipe.id, effect, module: mod.id });
    }
    productivity += amount(m.productivity) * mod.count;
    speedEffect += amount(m.speed) * mod.count;
  }
  if (slots > amount(machine.modules)) invalid('插件数量超过机器插槽数。', { recipe: recipe.id, slots, available: machine.modules ?? 0 });
  if (c.data.flags?.includes('maximumFactor') && !recipe.flags?.some(f => ['mining', 'technology'].includes(f))) productivity = Math.min(4, productivity);
  const inputs = quantities(recipe.in);
  const outputs = quantities(recipe.out);
  for (const id of Object.keys(outputs)) {
    const catalyst = amount(recipe.catalyst?.[id]);
    outputs[id] = catalyst + Math.max(0, outputs[id] - catalyst) * productivity;
  }
  if (machine.ingredientUsage != null) for (const id of Object.keys(inputs)) inputs[id] *= amount(machine.ingredientUsage);
  const speed = machine.speed == null ? null : amount(machine.speed) * Math.max(0.2, speedEffect);
  return { id: recipe.id, recipe, inputs, outputs, machine: machineId ?? null, quality, modules: config.modules ?? [], productivityBonus: bonus, productivity, speed, secondsPerCraft: speed ? amount(recipe.time) / speed : null };
}

export function getRecipeDetails({ recipe, dataset, settings = {} }) {
  const c = getCatalog(dataset);
  const r = c.recipe(recipe);
  const adjusted = adjustRecipe(c, r, settings);
  const describe = entries => Object.entries(entries).map(([id, quantity]) => ({ id, name: c.itemName(id), quantity }));
  return {
    id: r.id, name: c.recipeName(r.id), provenance: c.provenance,
    base: { timeSeconds: amount(r.time), inputs: describe(quantities(r.in)), outputs: describe(quantities(r.out)), catalyst: quantities(r.catalyst), producers: r.producers ?? [], producerLocations: (r.producers ?? []).map(id => ({ id, locations: c.items.get(id)?.machine?.locations ?? [] })), locations: r.locations ?? [], disallowedEffects: r.disallowedEffects ?? [], researchProductivityAvailable: c.data.items.some(x => x.technology?.recipeProductivity?.some(p => p.id === r.id)) },
    adjusted: { machine: adjusted.machine, quality: adjusted.quality, modules: adjusted.modules, productivityMultiplier: adjusted.productivity, speed: adjusted.speed, secondsPerCraft: adjusted.secondsPerCraft, inputs: describe(adjusted.inputs), outputs: describe(adjusted.outputs) },
    note: '未指定机器时采用配方 producers 列表中的第一台；物品为普通品质。没有 locations 表示快照未列出额外配方地点限制。',
  };
}

export async function calculateProduction(request) {
  const c = getCatalog(request.dataset);
  const glpk = await glpkPromise;
  if (!request.targets || !Object.keys(request.targets).length || Object.keys(request.targets).length > 10) invalid('需要 1 到 10 个目标物品。');
  const factor = { minute: 1, second: 60, hour: 1 / 60 }[request.rateUnit ?? 'minute'];
  if (!factor) invalid('rateUnit 必须为 minute、second 或 hour。');
  const targets = {};
  for (const [query, rate] of Object.entries(request.targets)) {
    finiteRate(rate);
    const id = c.resolve(query).id;
    targets[id] = (targets[id] ?? 0) + rate * factor;
  }
  const external = new Set((request.externalInputs ?? []).map(x => c.resolve(x).id));
  for (const id of external) if (targets[id]) invalid('目标不能同时作为无限外部输入，否则计算没有意义。', { id });
  const location = request.location ? c.resolve(request.location, 'location').id : null;
  const settings = {};
  for (const [query, conf] of Object.entries(request.settings ?? {})) settings[c.resolve(query, 'recipe').id] = conf;
  const explicit = request.recipeIds ? new Set(request.recipeIds.map(x => c.resolve(x, 'recipe').id)) : null;
  if (explicit && (explicit.size === 0 || explicit.size > 1000)) invalid('recipeIds 需要 1 到 1000 个配方。');
  const disabled = new Set((request.disabledRecipes ?? []).map(x => c.resolve(x, 'recipe').id));
  let candidates = [...c.recipes.values()].filter(r => !disabled.has(r.id) && (explicit ? explicit.has(r.id) : !r.flags?.some(f => ['recycling', 'technology', 'burn', 'plant'].includes(f))));
  const allowedAt = r => {
    if (location && r.locations?.length && !r.locations.includes(location)) return false;
    const machine = settings[r.id]?.machine;
    if (machine) return machineAllowedAt(c, c.resolve(machine).id, location);
    return !r.producers?.length || r.producers.some(id => machineAllowedAt(c, id, location));
  };
  const conflictDetails = r => ({ id: r.id, name: c.recipeName(r.id), allowedLocations: r.locations ?? [], producerLocations: (r.producers ?? []).map(id => ({ id, locations: c.items.get(id)?.machine?.locations ?? [] })) });
  const conflicts = [];
  for (const id of Object.keys(targets)) {
    const producers = candidates.filter(r => amount(r.out[id]) > amount(r.in[id]));
    if (!producers.length) throw new ToolError('UNPRODUCIBLE_TARGET', `所选配方不能生产目标：${c.itemName(id)}。`, { id, availableRecipes: [...c.recipes.values()].filter(r => amount(r.out[id]) > amount(r.in[id])).map(r => r.id) });
    if (!producers.some(allowedAt)) conflicts.push(...producers.map(conflictDetails));
  }
  if (explicit) conflicts.push(...candidates.filter(r => !allowedAt(r)).map(conflictDetails));
  if (conflicts.length) throw new ToolError('LOCATION_CONFLICT', '指定地点无法执行所需配方。请调整生产地点或改为输入成品中间物料，不要继续给出不可执行的产线数值。', { location, recipes: [...new Map(conflicts.map(x => [x.id, x])).values()], provenance: c.provenance });
  candidates = candidates.filter(allowedAt);
  // Only configure reachable recipes. Explicit recipe scopes also allow loops that
  // regenerate an imported fluid, e.g. hot fluoroketone -> cold fluoroketone.
  const rawByOutput = new Map();
  for (const r of candidates) for (const id of Object.keys(r.out)) {
    if (amount(r.out[id]) > amount(r.in[id])) {
      if (!rawByOutput.has(id)) rawByOutput.set(id, []);
      rawByOutput.get(id).push(r);
    }
  }
  const selected = new Map();
  const seen = new Set();
  function visit(id) {
    if (seen.has(id)) return;
    seen.add(id);
    if (external.has(id)) return;
    for (const r of rawByOutput.get(id) ?? []) {
      selected.set(r.id, r);
      for (const input of Object.keys(r.in)) visit(input);
    }
  }
  for (const id of Object.keys(targets)) visit(id);
  if (explicit) for (const r of candidates) selected.set(r.id, r);
  const recipes = [...selected.values()].map(r => adjustRecipe(c, r, settings[r.id], location));
  const ids = new Set(Object.keys(targets));
  for (const r of recipes) for (const id of [...Object.keys(r.inputs), ...Object.keys(r.outputs)]) ids.add(id);
  const inputs = [...ids].filter(id => !targets[id] && (external.has(id) || !recipes.some(r => net(r, id) > EPS)));
  const vars = recipes.map((r, i) => ({ name: `r${i}`, coef: 0 }));
  const inputVars = inputs.map((id, i) => ({ name: `i${i}`, coef: c.items.get(id)?.types?.includes('fluid') ? 0.1 : 1 }));
  const surplusVars = [...ids].map((id, i) => ({ id, name: `s${i}`, coef: 0 }));
  const lp = {
    name: 'factorio_material_balance',
    objective: { direction: glpk.GLP_MIN, name: 'boundary_input_cost', vars: [...vars, ...inputVars, ...surplusVars.map(({ name, coef }) => ({ name, coef }))] },
    subjectTo: [...ids].map((id, i) => ({
      name: `balance${i}`,
      vars: [
        ...recipes.map((r, j) => ({ name: `r${j}`, coef: net(r, id) })).filter(x => Math.abs(x.coef) > 1e-12),
        ...inputs.flatMap((v, j) => v === id ? [{ name: `i${j}`, coef: 1 }] : []),
        { name: `s${i}`, coef: -1 },
      ],
      bnds: { type: glpk.GLP_FX, lb: targets[id] ?? 0, ub: targets[id] ?? 0 },
    })),
  };
  const options = { msglev: glpk.GLP_MSG_OFF, presol: true, tmlim: 5 };
  let solved = glpk.solve(lp, options).result;
  if (solved.status !== glpk.GLP_OPT) throw new ToolError('NO_SOLUTION', '所选配方、地点和输入条件无法得到最优可行解。', { solverStatus: solved.status, provenance: c.provenance });
  // Lexicographic objective: minimize weighted boundary inputs, then total
  // recipe seconds. A second pass eliminates arbitrary circulating loops.
  if (inputVars.length) lp.subjectTo.push({ name: 'optimal_inputs', vars: inputVars, bnds: { type: glpk.GLP_UP, lb: 0, ub: solved.z + 1e-9 } });
  lp.objective = { direction: glpk.GLP_MIN, name: 'recipe_time', vars: recipes.map((r, i) => ({ name: `r${i}`, coef: Math.max(0.001, amount(r.recipe.time)) })) };
  const second = glpk.solve(lp, options).result;
  if (second.status === glpk.GLP_OPT) solved = second;
  const rates = recipes.map((r, i) => Math.max(0, solved.vars[`r${i}`] ?? 0));
  const flows = [...ids].map(id => {
    const consumed = recipes.reduce((s, r, i) => s + (r.inputs[id] ?? 0) * rates[i], 0);
    const produced = recipes.reduce((s, r, i) => s + (r.outputs[id] ?? 0) * rates[i], 0);
    const imported = inputs.includes(id) ? Math.max(0, solved.vars[`i${inputs.indexOf(id)}`] ?? 0) : 0;
    const surplus = Math.max(0, produced + imported - consumed - (targets[id] ?? 0));
    return { id, name: c.itemName(id), produced: clean(produced), consumed: clean(consumed), imported: clean(imported), target: clean(targets[id] ?? 0), surplus: clean(surplus), balanceError: Math.abs(produced + imported - consumed - (targets[id] ?? 0) - (solved.vars[surplusVars.find(x => x.id === id).name] ?? 0)) };
  });
  const maxBalanceError = Math.max(...flows.map(x => x.balanceError));
  if (maxBalanceError > 1e-5) throw new ToolError('NUMERICAL_ERROR', '解未通过物料守恒检查。', { maxBalanceError });
  const steps = recipes.flatMap((r, i) => rates[i] > EPS ? [{
    id: r.id, name: c.recipeName(r.id), craftsPerMinute: clean(rates[i]), machine: r.machine, quality: r.quality, modules: r.modules, productivityBonus: r.productivityBonus,
    productivityMultiplier: clean(r.productivity), speed: r.speed == null ? null : clean(r.speed), machines: r.secondsPerCraft == null ? null : clean(rates[i] * r.secondsPerCraft / 60),
    allowedLocations: r.recipe.locations ?? [], machineAllowedLocations: c.items.get(r.machine)?.machine?.locations ?? [], inputsPerCraft: r.inputs, outputsPerCraft: r.outputs, source: c.provenance.source,
  }] : []);
  return {
    provenance: c.provenance, rateUnit: 'per_minute', location,
    targets: Object.entries(targets).map(([id, rate]) => ({ id, name: c.itemName(id), rate: clean(rate) })),
    inputs: flows.filter(x => x.imported > EPS).map(x => ({ id: x.id, name: x.name, rate: x.imported, reason: external.has(x.id) ? 'explicit_external_input' : 'no_available_producing_recipe_in_scope' })),
    surplus: flows.filter(x => x.surplus > EPS).map(x => ({ id: x.id, name: x.name, rate: x.surplus })),
    steps, flows: flows.filter(x => x.consumed > EPS || x.produced > EPS || x.imported > EPS).map(({ balanceError, ...x }) => x), maxBalanceError,
    startupInventory: null,
    accountingScope: 'recipe_materials_only',
    acquisition: steps.filter(s => Object.keys(s.inputsPerCraft).length === 0).map(s => ({ recipe: s.id, machine: s.machine, outputs: Object.entries(s.outputsPerCraft).map(([id, n]) => ({ id, name: c.itemName(id), rate: clean(n * s.craftsPerMinute) })) })),
    warnings: steps.filter(s => c.items.get(s.machine)?.machine?.fuelTypes?.length).map(s => ({ code: 'FUEL_NOT_INCLUDED', recipe: s.id, machine: s.machine, message: '该设备使用燃料/食物；当前仅统计配方原料，未计燃料或食物。不能把此结果称为完整资源需求。' })),
    assumptions: ['默认普通品质产物、无插件、无研究加成；机器采用各配方首个 producer，已计入机器自带增产。显式 settings 会覆盖默认配置。', '所有结果统一为每分钟。没有 location 时允许跨地点生产，步骤保留地点限制，不能把整条链解释为在同一星球生产。', '外部输入和不能在所选配方范围内生产的物料作为计算边界；inputs 是边界需求，不等于这些物料能在当地开采。', '优先最小化边界物品需求之和（流体权重 0.1），再最小化基础配方时间；这不是运输成本或玩家建造成本最优。'],
    limitations: ['不计算电力、燃料、热量、腐败时效、火箭/平台运行成本或物流延迟。', '循环启动库存需额外提供管道容量、设备缓存和物流周期；稳态配方无法确定。', '不计算品质插件随机产物、信标、采矿研究及资源耗尽、科技解锁进度。'],
  };
}

export function calculateBarrelTransport({ fluid, rate, returnEmptyBarrels = true, roundTripMinutes, dataset }) {
  finiteRate(rate);
  if (roundTripMinutes != null && (!Number.isFinite(roundTripMinutes) || roundTripMinutes <= 0)) invalid('运输往返时间必须为正数分钟。');
  const c = getCatalog(dataset);
  const id = c.resolve(fluid).id;
  if (!c.items.get(id)?.types?.includes('fluid')) invalid('必须指定流体。');
  const fill = [...c.recipes.values()].find(r => amount(r.in[id]) > 0 && amount(r.in.barrel) > 0 && Object.keys(r.out).some(k => k !== id && c.items.get(k)?.types?.includes('item')) && r.id.endsWith('-barrel'));
  if (!fill) throw new ToolError('NO_BARREL_RECIPE', '数据中没有该流体的装桶配方。', { id });
  const barrelId = Object.keys(fill.out).find(k => k !== 'barrel');
  const empty = [...c.recipes.values()].find(r => amount(r.in[barrelId]) > 0 && amount(r.out[id]) > 0 && amount(r.out.barrel) > 0 && r.id.startsWith('empty-'));
  if (!empty) throw new ToolError('NO_BARREL_RECIPE', '数据中没有对应的倒桶返还配方。');
  const perBarrel = amount(fill.in[id]) / amount(fill.out[barrelId]);
  const barrelsPerMinute = rate / perBarrel;
  const used = barrelsPerMinute * amount(fill.in.barrel) / amount(fill.out[barrelId]);
  const returned = barrelsPerMinute * amount(empty.out.barrel) / amount(empty.in[barrelId]);
  const newBarrelsPerMinute = Math.max(0, used - (returnEmptyBarrels ? returned : 0));
  const barrelRecipe = c.recipes.get('barrel');
  return {
    provenance: c.provenance, fluid: id, fluidName: c.itemName(id), rateUnit: 'per_minute', fluidRate: rate, fluidPerBarrel: perBarrel, filledBarrel: barrelId,
    barrelsPerMinute: clean(barrelsPerMinute), emptyBarrelsProducedPerMinute: clean(returned), returnEmptyBarrels,
    newBarrelsPerMinute: clean(newBarrelsPerMinute),
    barrelMaterials: Object.entries(barrelRecipe.in).map(([id, n]) => ({ id, name: c.itemName(id), rate: clean(amount(n) * newBarrelsPerMinute / amount(barrelRecipe.out.barrel)) })),
    initialBarrels: returnEmptyBarrels && roundTripMinutes ? Math.ceil(used * roundTripMinutes - 1e-9) : null,
    sourceRecipes: [fill.id, empty.id, barrelRecipe.id],
    note: '装桶/倒桶物流层计算，未使用插件或增产。若空桶返运，按无损闭环计算；不返运时列出每分钟需新造的空桶。initialBarrels 是给定往返周期的理论下限，未含设备缓存和安全库存。',
    limitations: ['不包含火箭材料、火箭装载取整、燃料、平台航程、目的地生产合法性或热量需求。运输量应由生产工具的明确方案决定。'],
  };
}
