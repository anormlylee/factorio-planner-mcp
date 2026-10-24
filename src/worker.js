import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createServer } from './server.js';
import { SERVER_NAME, SERVER_VERSION } from './version.js';

const repository = 'https://github.com/anormlylee/factorio-planner-mcp';
const homepage = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Factorio Planner MCP</title><style>body{max-width:760px;margin:64px auto;padding:0 24px;font:18px/1.8 system-ui;color:#23312b;background:#f5f5ef}a{color:#275f44}code{background:#e5e9df;padding:3px 6px;border-radius:4px}h1{line-height:1.2}</style><h1>Factorio Planner MCP</h1><p>在 ChatGPT 等支持 MCP 的客户端中，查询异星工厂配方并计算产线物料收支。</p><p>MCP 地址：<code id="endpoint"></code> · 无需认证</p><p>在 ChatGPT 添加自定义 MCP 服务，安装后新建对话，通过 @ 选择插件即可使用。</p><p>支持配方查询、生产链、冷却循环及装桶收支。计算不含完整燃料、食物、热量和火箭运输成本；请查看工具返回的范围与限制。</p><h2>感谢 FactorioLab</h2><p>特别感谢 <a href="https://github.com/dcbroad3">Doug Broad</a> 和 <a href="https://github.com/factoriolab/factoriolab">FactorioLab</a> 的所有贡献者。从《戴森球计划》到《异星工厂》，它的计算器一直帮助这个项目的发起者规划产线、理清复杂配方。没有 FactorioLab，就不会有这个 MCP 服务。</p><p>本项目独立维护，数据来自 FactorioLab，并非 FactorioLab 或 Wube 官方产品。</p><p><a href="${repository}">开源代码、自建说明与计算限制</a> · <a href="/health">服务状态</a></p><script>document.getElementById('endpoint').textContent=location.origin+'/mcp'</script></html>`;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    if (request.method === 'GET' && url.pathname === '/') return new Response(homepage, { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
    if (request.method === 'GET' && url.pathname === '/health') return Response.json({ status: 'ok', name: SERVER_NAME, version: SERVER_VERSION, runtime: 'cloudflare-workers' }, { headers });
    if (url.pathname !== '/mcp') return new Response('Not found', { status: 404, headers });
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) return new Response('Origin not allowed', { status: 403, headers });
    if (request.method !== 'POST') return new Response('Stateless MCP endpoint supports POST only', { status: 405, headers: { ...headers, Allow: 'POST' } });
    if (env.MCP_RATE_LIMITER) {
      const { success } = await env.MCP_RATE_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') ?? 'unknown' });
      if (!success) return new Response('Too many requests', { status: 429, headers: { ...headers, 'Retry-After': '60' } });
    }
    const server = createServer();
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: 100 * 1024 });
    try {
      await server.connect(transport);
      const response = await transport.handleRequest(request);
      // JSON-only stateless responses have no ongoing SSE streams. Close once
      // the request was handled; no user/session state survives this request.
      ctx.waitUntil(server.close());
      return response;
    } catch (error) {
      console.error('MCP request failed', error instanceof Error ? error.message : 'unknown error');
      ctx.waitUntil(server.close());
      return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Internal MCP error' } }, { status: 500, headers });
    }
  },
};
