# Factorio Planner MCP

[简体中文](README.zh-CN.md)

A community MCP server for asking accurate Factorio recipe and production questions in ChatGPT and other MCP clients. Uses pinned **FactorioLab** datasets and a deterministic GLPK material-balance solver.

## With heartfelt thanks to FactorioLab

This project exists because of **[FactorioLab](https://github.com/factoriolab/factoriolab)**, created by **[Doug Broad / dcbroad3](https://github.com/dcbroad3)**, and maintained with the help of its contributors.

> From Dyson Sphere Program to Factorio, I have relied on FactorioLab's calculator to make sense of my factories. It has saved me more times than I can count. This MCP service is a small way to build on that work and make reliable calculations accessible in everyday AI conversations.

Thank you, Doug, and everyone who has contributed data, translations, code, bug reports, and maintenance. Please visit the [original calculator](https://factoriolab.github.io/) and consider supporting its author through the links on the [upstream project](https://github.com/factoriolab/factoriolab).

Factorio Planner MCP is independently maintained. It is **not an official FactorioLab or Wube product**. Original MIT copyright and license notices are retained in [data/FACTORIOLAB-LICENSE](data/FACTORIOLAB-LICENSE); dataset commit and hashes are recorded in [data/manifest.json](data/manifest.json).

## Use the hosted service

- MCP endpoint: **https://factorio-mcp.anormlylee.com/mcp**
- Homepage: https://factorio-mcp.anormlylee.com/
- Authentication: **No authentication**
- Transport: stateless **Streamable HTTP**

In ChatGPT, add a custom MCP server, paste the endpoint, create and install the plugin, then start a new Chat conversation and select it with `@`. Account/workspace permissions determine whether custom connections are available. See the [official connection instructions](https://developers.openai.com/api/docs/guides/custom-mcp-server). This project does not require a public ChatGPT directory listing for self-hosting or personal custom connections.

Try:

> Use Factorio Planner to look up the recipes and allowed locations for promethium science packs and quantum processors. Calculate the quantum processors needed for 120 science packs per minute, then compare open-loop coolant input with a cooling loop.

Inspect the actual tool calls. Connecting a server does not guarantee that a model will choose the right tools on every turn. Optional conversation instructions are in [examples/chatgpt-instructions.md](examples/chatgpt-instructions.md).

The hosted service is a best-effort community endpoint. You can deploy your own copy using any method below. The server itself does not call an LLM and needs no OpenAI API key.

## What it does

- Search English/Chinese names, IDs and selected aliases such as 黑瓶, 冷氟酮 and 地星.
- Inspect recipes, returned catalysts, machine producers, and both recipe and machine location restrictions.
- Calculate steady-state production networks with external inputs, byproducts and recycling loops.
- Apply machine base productivity, machine quality, speed/productivity modules and module quality, and supported productivity research.
- Report gross flows, boundary inputs, resource acquisition, surplus and fractional machine counts.
- Account for barrel filling/emptying and empty-barrel return; estimate minimum circulating barrels if a round-trip duration is provided.

| Tool | Purpose |
|---|---|
| `list_datasets` | List available pinned snapshots; no upfront version question is required |
| `search_entities` | Resolve item, recipe and location names |
| `get_recipe` | Inspect base recipe and adjusted machine configuration |
| `calculate_production` | Solve steady-state material balances |
| `calculate_barrel_transport` | Calculate barrels and replacement barrel materials for a known fluid rate |

Default dataset: `2x1` (Space Age 2.1 snapshot). Also bundled: `2.1`, `spa` (Space Age 2.0), `2.0`. Every result reports provenance. These are bundled snapshots, not detection of the user's Steam installation.

## Self-host on Cloudflare Workers

Requirements: Node.js 22.18+ and a Cloudflare account.

```sh
git clone https://github.com/anormlylee/factorio-planner-mcp.git
cd factorio-planner-mcp
npm ci --ignore-scripts
npm run check
npx wrangler login
npm run deploy:self
```

`deploy:self` uses [wrangler.self-host.jsonc](wrangler.self-host.jsonc), with no custom domain routes. Wrangler prints your own `workers.dev` hostname; append `/mcp`. To bind your own domain, add a route with `custom_domain: true` to that config. Do not reuse the maintainer's hostname in your account.

Local Worker development:

```sh
npm run dev:worker
# In a second terminal:
npm run test:worker
```

Workers use the same tools and calculation logic as Node. JSON datasets and GLPK WASM are bundled at build time. [scripts/prepare-worker.js](scripts/prepare-worker.js) verifies dataset hashes and generates a compatibility adapter from pinned GLPK.js 5.0.0. It does not change the optimization model or solver mathematics. Details: [docs/worker-adapter.md](docs/worker-adapter.md).

The Worker has an IP-based limit of 120 MCP requests/minute and a 100 KiB request body limit. Cloudflare plan CPU, memory, request and billing limits still apply; broad automatic production chains may need more CPU than focused recipe queries. Deployment does not purchase or upgrade a Cloudflare plan. No database, container subscription, secrets or LLM account is required by this implementation.

## Self-host with Docker

```sh
git clone https://github.com/anormlylee/factorio-planner-mcp.git
cd factorio-planner-mcp
docker compose up -d --build
```

The service listens at `http://127.0.0.1:3000/mcp`. Put your own HTTPS reverse proxy in front of it for remote ChatGPT use. Set `ALLOWED_HOSTS` to your own hostname(s), without schemes or ports, and preserve the Host header at your proxy. The optional settings are shown in [.env.example](.env.example).

The Node prototype uses a per-connection-source memory rate limit. Users behind the same reverse proxy may share it; configure appropriate edge/proxy limits for a public installation. The Cloudflare Worker uses the platform rate limiter keyed by the connecting client IP.

## Run locally or over stdio

```sh
npm ci --ignore-scripts
npm start
# Or:
npm run start:stdio
```

A local stdio client can use:

```json
{
  "mcpServers": {
    "factorio-planner": {
      "command": "node",
      "args": ["/absolute/path/to/factorio-planner-mcp/src/stdio.js"]
    }
  }
}
```

Stdio and localhost are for clients that can access that machine. A remote ChatGPT connection requires reachable HTTPS or a separately configured supported secure tunnel.

## Calculation example

```json
{
  "targets": {"quantum-processor": 12},
  "location": "aquilo",
  "recipeIds": ["quantum-processor", "fluoroketone-cooling"],
  "externalInputs": ["fluoroketone-cold"]
}
```

The baseline uses normal-quality products, no modules/research, and the first producer valid at the specified location, including its inherent productivity. For this network, cold coolant is consumed at 80/minute, regenerated at 40/minute and imported at 40/minute. Returned hot coolant is not multiplied by productivity. `npm run example` generates the complete worked example.

`targets` defaults to per-minute; `rateUnit` also accepts `second` and `hour`. Output always uses per-minute. `recipeIds` limits the exact recipe network; missing upstream ingredients become boundary inputs. Without it, the solver expands upstream recipes. `externalInputs` stops automatic upstream expansion, while explicit recipes can still regenerate those inputs in loops.

Optional per-recipe settings:

```json
{
  "settings": {
    "quantum-processor": {
      "machine": "electromagnetic-plant",
      "quality": "legendary",
      "modules": [{"id": "productivity-module-3", "quality": "legendary", "count": 5}]
    }
  }
}
```

`quality` here describes machines/modules; products remain normal quality. Calls are stateless: repeat the user's prior settings on follow-up calculations. `get_recipe` lists whether the recipe supports a research productivity bonus.

## Scope and limitations

- Results are **recipe material balances**, not a complete factory utility or transport budget. Energy, fuel/food, heat, spoilage timing, technology progression and rocket/platform logistics costs are excluded. `FUEL_NOT_INCLUDED` warns about affected machines.
- `inputs` are boundary imports. `acquisition` lists mining/pumping/other recipes with no recipe ingredients; do not omit those resource sources or describe food-powered machines as requiring no supplies.
- Recipe and machine location conflicts are rejected. Without `location`, the network may span multiple locations; it must not be described as a single-planet build.
- No beacon effects, quality-module random outputs, mining research/depletion, or full logistics simulation. Unknown startup inventory is `null`.
- Optimization first minimizes weighted boundary inputs (fluid weight 0.1), then base recipe time. It is not a construction, energy, or transport cost optimum.
- The headless adapter follows FactorioLab's net-balance and catalyst rules but is not a complete port of the Angular application. Critical scenarios have tests; full upstream feature parity has not been established.

## Development and data maintenance

```sh
npm run check
npm run build:worker
npm run example
npm audit
node scripts/smoke-http.js https://YOUR-HOST/mcp
```

To update the bundled data, explicitly select a reviewed upstream commit:

```sh
npm run sync:data -- UPSTREAM_40_CHARACTER_COMMIT_SHA
npm run check
npm run build:worker
npm run example
```

The sync command downloads all snapshots and translations before replacing files, retains upstream licensing, and updates the manifest. Review the diff and calculation changes before committing. It does not automatically change datasets at runtime.

Bug reports and contributions are welcome. Include the question, exact tool input/output and dataset provenance, without private chat history or credentials. CI tests Node and the actual local Workers runtime. No deployment credentials are stored in this repository.

## License

**GPL-3.0-only** for this project, including its GLPK.js integration. FactorioLab datasets/translations retain the upstream MIT license. See [LICENSE](LICENSE), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and the retained [FactorioLab license](data/FACTORIOLAB-LICENSE).
