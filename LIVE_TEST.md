# Production connection

The maintained MCP address is `https://factorio-mcp.anormlylee.com/mcp`.

Use **No authentication** when adding it as a custom MCP server. Create/install the plugin, then start a new Chat conversation and select it with `@`.

The production implementation runs on Cloudflare Workers, independently of the maintainer's laptop. Earlier `trycloudflare.com` URLs were temporary development endpoints and are not part of the supported configuration. No user should depend on those ephemeral addresses.

For self-hosting, see README.md or README.zh-CN.md. Use your own Worker hostname and domain. `node scripts/smoke-http.js https://YOUR-HOST/mcp` exercises a real MCP client against a deployed endpoint.
