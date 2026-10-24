import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getCatalog, listDatasets, ToolError } from './catalog.js';
import { getRecipeDetails, calculateProduction, calculateBarrelTransport } from './calculator.js';
import { SERVER_NAME, SERVER_VERSION } from './version.js';

export const instructions = `Use these tools for Factorio recipe facts and material calculations rather than guessing. 默认使用服务数据，无需先问游戏版本，也不检测用户本机。先搜索不明确的中文/俗称，使用明确 ID 查配方或计算。地点冲突必须先告知用户，不能把多星球链解释为当地可生产。输入产量默认每分钟，用户没给单位时在答案说明此假设。已有配置沿用到后续调用；无配置时先算默认方案并说明假设，不因可选配置而停止回答。区分 consumed/produced 的总流量、inputs 的外部输入、surplus 的剩余/返还和未知启动库存。需要冷却液循环时把冷却配方加入 recipeIds，明确比较开放与闭环方案。不得编造工具不包含的发射成本、燃料、热量或存档状态。get_recipe 提供配方和机器效果，calculate_production 求稳态收支，calculate_barrel_transport 根据已算出的流量计算桶和空桶返运。结果注明数据版本和关键配置，出错时按结构化建议修正参数。工具失败时不能声称已核实数值。`;

const text = z.string().min(1).max(160);
const dataset = text.optional().describe('Optional dataset ID. Omit to use the service default; do not ask the user for a version before trying.');
const quality = z.enum(['normal', 'uncommon', 'rare', 'epic', 'legendary']);
const rate = z.number().finite().positive().max(1e9);
const recipeSettings = z.object({
  machine: text.optional().describe('Machine item ID/name, must be an allowed producer.'),
  quality: quality.optional().describe('Machine quality only. Products remain normal quality.'),
  modules: z.array(z.object({ id: text, quality: quality.optional(), count: z.number().int().min(1).max(100) }).strict()).max(16).optional(),
  productivityBonus: z.number().finite().min(0).max(100000).optional().describe('Additional research productivity percentage: 20 means +20%. Not total productivity.'),
}).strict();

function handler(fn) {
  return async args => {
    try {
      const output = await fn(args);
      return { content: [{ type: 'text', text: JSON.stringify(output) }], structuredContent: output };
    } catch (error) {
      const known = error instanceof ToolError;
      if (!known) console.error('Tool failure:', error);
      const output = { error: { code: known ? error.code : 'INTERNAL_ERROR', message: known ? error.message : '计算服务内部错误，请重试。', details: known ? error.details : {} } };
      return { isError: true, content: [{ type: 'text', text: JSON.stringify(output) }], structuredContent: output };
    }
  };
}

export function createServer() {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION }, { instructions });
  const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  const register = (name, description, inputSchema, fn) => server.registerTool(name, { description, inputSchema: z.object(inputSchema).strict(), annotations }, handler(fn));
  register('list_datasets', 'List available pinned FactorioLab datasets. Use only when selecting a dataset or resolving a missing recipe/version; default calculation needs no prior version question.', {}, () => listDatasets());
  register('search_entities', 'Search authoritative Factorio items, recipes and locations by English/Chinese/colloquial name, e.g. 黑瓶, 冷氟酮. Use this to resolve names before recipe lookup or calculation; does not search general game mechanics.', {
    query: text, kind: z.enum(['item', 'recipe', 'location']).optional(), limit: z.number().int().min(1).max(50).default(20), dataset,
  }, ({ query, kind, limit, dataset }) => { const c = getCatalog(dataset); return { provenance: c.provenance, results: c.search(query, kind, limit) }; });
  register('get_recipe', 'Get a sourced recipe with base inputs/outputs, returned catalysts, producers, allowed production locations and adjusted machine/productivity settings. Use to verify game facts before explaining them. No specified settings means a baseline result, not a request to question the user.', {
    recipe: text.describe('Recipe ID or an unambiguous exact name. Search first for ambiguous names.'), dataset, settings: recipeSettings.optional(),
  }, getRecipeDetails);
  register('calculate_production', 'Calculate deterministic steady-state Factorio production, including loops and byproducts. Use for quantities, ratios, material needs and machine counts. Returns gross flows, external inputs, surplus, settings and data provenance. Report LOCATION_CONFLICT instead of inventing locally impossible production. No location means a multi-location chain, not all recipes on one planet. Power/fuel/transport/startup inventory are excluded. For a focused question, scope recipeIds and treat its other ingredients as boundary inputs.', {
    targets: z.record(text, rate).refine(x => Object.keys(x).length >= 1 && Object.keys(x).length <= 10, 'Use 1–10 targets').describe('Map of target item IDs/names to desired rates. Example {"黑瓶":120}.'),
    rateUnit: z.enum(['minute', 'second', 'hour']).default('minute').describe('Input target units. Output always per minute. State minute assumption if user omitted units.'),
    dataset,
    location: text.optional().describe('Optional production location ID/name. Only set when user specifies one; never infer that all upstream processes share it.'),
    externalInputs: z.array(text).max(100).optional().describe('Items supplied externally; ancestry expansion stops at these inputs. Explicit recipeIds may still regenerate them in a loop.'),
    recipeIds: z.array(text).min(1).max(1000).optional().describe('Optional exact recipe network. For coolant accounting use quantum-processor + fluoroketone-cooling; other missing ingredients become external inputs. Omit for automatic upstream expansion.'),
    disabledRecipes: z.array(text).max(1000).optional(),
    settings: z.record(text, recipeSettings).optional().describe('Per-recipe settings. Reuse previously supplied settings on follow-up calls. Unspecified recipes use baseline settings.'),
  }, calculateProduction);
  register('calculate_barrel_transport', 'Calculate filled barrels/minute, returned empty barrels and new barrel materials from a known fluid rate per minute. Use after production calculation. Distinguishes no-return consumables from a lossless return loop. Does not determine rocket costs or local recipe legality.', {
    fluid: text, rate: rate.describe('Fluid units per MINUTE; use gross or net replenishment rate appropriate to the chosen production/cooling scenario.'),
    returnEmptyBarrels: z.boolean().default(true), roundTripMinutes: z.number().finite().positive().max(1e6).optional().describe('Optional full barrel circulation time. Enables theoretical minimum circulating barrel inventory, not actual safe startup stock.'), dataset,
  }, calculateBarrelTransport);
  return server;
}
