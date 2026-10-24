import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const url = new URL(process.argv[2] ?? 'http://127.0.0.1:3037/mcp');
const client = new Client({ name: 'factoriolab-smoke', version: '0.1.0' });
try {
  await client.connect(new StreamableHTTPClientTransport(url));
  const listed = await client.listTools();
  assert.equal(listed.tools.length, 5);
  const r = await client.callTool({ name: 'calculate_production', arguments: { targets: { 'quantum-processor': 12 }, recipeIds: ['quantum-processor', 'fluoroketone-cooling'], externalInputs: ['fluoroketone-cold'], location: 'aquilo' } });
  assert.ok(!r.isError);
  assert.ok(Math.abs(r.structuredContent.inputs.find(x => x.id === 'fluoroketone-cold').rate - 40) < 1e-6);
  const conflict = await client.callTool({ name: 'calculate_production', arguments: { targets: { '黑瓶': 120 }, location: '地星' } });
  assert.equal(conflict.structuredContent.error.code, 'LOCATION_CONFLICT');
  console.log(JSON.stringify({ endpoint: url.href, initialize: 'passed', tools: listed.tools.map(x => x.name), coolantCycle: 'passed', locationConflict: 'passed' }, null, 2));
} finally {
  await client.close();
}
