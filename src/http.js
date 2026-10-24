import { pathToFileURL } from 'node:url';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './server.js';
import { SERVER_NAME, SERVER_VERSION } from './version.js';

export function createApp({ host = '127.0.0.1', allowedHosts } = {}) {
  const app = createMcpExpressApp({ host, allowedHosts });
  app.disable('x-powered-by');
  const buckets = new Map();
  app.use('/mcp', (req, res, next) => {
    const now = Date.now();
    const ip = req.socket.remoteAddress;
    if (buckets.size > 1000) for (const [key, value] of buckets) if (now - value.start > 60000) buckets.delete(key);
    let bucket = buckets.get(ip);
    if (!bucket || now - bucket.start > 60000) { bucket = { start: now, count: 0 }; buckets.set(ip, bucket); }
    if (++bucket.count > 120) return res.status(429).json({ error: 'Too many requests; retry after one minute.' });
    const origin = req.headers.origin;
    if (origin) {
      try { if (new URL(origin).host !== req.headers.host) return res.status(403).json({ error: 'Origin not allowed' }); }
      catch { return res.status(403).json({ error: 'Invalid Origin' }); }
    }
    next();
  });
  app.get('/health', (_req, res) => res.json({ status: 'ok', name: SERVER_NAME, version: SERVER_VERSION }));
  app.post('/mcp', async (req, res) => {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { void transport.close(); void server.close(); });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('MCP HTTP failure:', error);
      if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
    }
  });
  app.all('/mcp', (_req, res) => res.status(405).set('Allow', 'POST').json({ jsonrpc: '2.0', error: { code: -32000, message: 'Stateless endpoint supports POST only.' }, id: null }));
  app.use((error, _req, res, _next) => {
    const status = error.status === 413 ? 413 : 400;
    res.status(status).json({ error: status === 413 ? 'Request body too large' : 'Invalid request body' });
  });
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const host = process.env.HOST ?? '127.0.0.1';
  const port = Number(process.env.PORT ?? 3000);
  const allowedHosts = process.env.ALLOWED_HOSTS?.split(',').map(s => s.trim()).filter(Boolean);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be 1–65535');
  const listener = createApp({ host, allowedHosts }).listen(port, host, () => console.error(`FactorioLab MCP listening on http://${host}:${port}/mcp`));
  listener.on('error', error => { console.error(error.message); process.exitCode = 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => listener.close(() => process.exit(0)));
}
