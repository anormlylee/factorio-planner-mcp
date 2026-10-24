import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { request } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const implementation = await import('../src/server.js').catch(() => ({}));
const http = await import('../src/http.js').catch(() => ({}));

test('MCP implementation exists', () => assert.equal(typeof implementation.createServer, 'function'));
test('real MCP initialize, list and call return sourced results and structured errors', async t => {
  const server = implementation.createServer();
  const client = new Client({ name: 'integration-test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  t.after(async () => { await client.close(); await server.close(); });
  await server.connect(b);
  await client.connect(a);
  const tools = await client.listTools();
  assert.equal(tools.tools.length, 5);
  assert.ok(tools.tools.every(x => x.annotations.readOnlyHint === true));
  const result = await client.callTool({ name: 'calculate_production', arguments: { targets: { 'quantum-processor': 12 }, recipeIds: ['quantum-processor'] } });
  assert.ok(!result.isError);
  assert.ok(Math.abs(result.structuredContent.inputs.find(x => x.id === 'fluoroketone-cold').rate - 80) < 1e-6);
  const failed = await client.callTool({ name: 'calculate_production', arguments: { targets: { '黑瓶': 120 }, location: 'nauvis' } });
  assert.equal(failed.isError, true);
  assert.equal(failed.structuredContent.error.code, 'LOCATION_CONFLICT');
  const unsupported = await client.callTool({ name: 'calculate_production', arguments: { targets: { 'quantum-processor': 12 }, recipeIds: ['quantum-processor'], beacons: 8 } });
  assert.equal(unsupported.isError, true, 'unsupported settings must not be silently discarded');
});
test('Streamable HTTP can be used by a real SDK client across stateless requests', async t => {
  const listener = http.createApp().listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const client = new Client({ name: 'http-test', version: '1' });
  t.after(async () => { await client.close(); await new Promise(resolve => listener.close(resolve)); });
  const url = `http://127.0.0.1:${listener.address().port}`;
  await client.connect(new StreamableHTTPClientTransport(new URL(`${url}/mcp`)));
  assert.equal((await client.listTools()).tools.length, 5);
  const result = await client.callTool({ name: 'search_entities', arguments: { query: '黑瓶', kind: 'item' } });
  assert.equal(result.structuredContent.results[0].id, 'promethium-science-pack');
  assert.equal((await fetch(`${url}/health`)).status, 200);
  assert.equal((await fetch(`${url}/mcp`)).status, 405);
  // Node's fetch may normalize Host; use http.request to send the actual header.
  const hostStatus = await new Promise((resolve, reject) => {
    const req = request(`${url}/health`, { headers: { Host: 'untrusted.invalid' } }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject); req.end();
  });
  assert.equal(hostStatus, 403);
});
test('stdio can be used by a real SDK client without stdout log corruption', async t => {
  const client = new Client({ name: 'stdio-test', version: '1' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('../src/stdio.js', import.meta.url))] });
  t.after(() => client.close());
  await client.connect(transport);
  const r = await client.callTool({ name: 'list_datasets', arguments: {} });
  assert.equal(r.structuredContent.defaultDataset, '2x1');
});
