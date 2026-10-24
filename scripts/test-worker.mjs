import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const base = process.argv[2] ?? 'http://127.0.0.1:8787';
assert.equal((await fetch(`${base}/health`)).status, 200);
assert.equal((await fetch(base)).status, 200);
assert.equal((await fetch(`${base}/mcp`)).status, 405);
assert.equal((await fetch(`${base}/mcp`, {method: 'POST', headers: { Origin: 'https://untrusted.invalid', 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
const oversized = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ junk: 'x'.repeat(110000) }) });
assert.equal(oversized.status, 413);
const client = new Client({ name: 'workerd-acceptance', version: '1' });
try {
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
  assert.equal((await client.listTools()).tools.length, 5);
  const call = async (name, args) => {
    const r = await client.callTool({ name, arguments: args });
    assert.ok(!r.isError, JSON.stringify(r));
    return r.structuredContent;
  };
  const search = await call('search_entities', {query: '黑瓶', kind: 'item'});
  assert.equal(search.results[0].id, 'promethium-science-pack');
  const recipe = await call('get_recipe', {recipe: 'quantum-processor'});
  assert.equal(recipe.adjusted.productivityMultiplier, 1.5);
  const result = await call('calculate_production', {targets: {'quantum-processor': 12}, recipeIds: ['quantum-processor', 'fluoroketone-cooling'], externalInputs: ['fluoroketone-cold'], location: 'aquilo'});
  assert.ok(Math.abs(result.inputs.find(x => x.id === 'fluoroketone-cold').rate - 40) < 1e-6);
  const conflict = await client.callTool({name:'calculate_production',arguments:{targets:{'黑瓶':120},location:'nauvis'}});
  assert.equal(conflict.structuredContent.error.code, 'LOCATION_CONFLICT');
  const barrel = await call('calculate_barrel_transport', {fluid:'冷氟酮',rate:40,returnEmptyBarrels:false});
  assert.ok(Math.abs(barrel.barrelMaterials[0].rate - 0.8) < 1e-6);
  console.log(JSON.stringify({base, runtime:'workerd / Cloudflare', initialize:'passed', tools:5, search:'passed', recipe:'passed', coolantCycle:'passed', locationConflict:'passed', barrel:'passed', originAndBodyLimits:'passed'},null,2));
} finally {await client.close();}
