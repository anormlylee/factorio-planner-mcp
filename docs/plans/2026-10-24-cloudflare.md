# Cloudflare deployment and independent repository

Goal: publish the user's authorized independent public repository and deploy a permanent Cloudflare Worker at `factorio-mcp.anormlylee.com`, preserving Node/Docker/stdio self-hosting and prominently thanking FactorioLab/Doug Broad.

Architecture: retain the calculation and MCP tool implementation; separate platform-specific data loading and solver initialization through package import aliases. Node keeps filesystem loading and the unmodified GLPK node factory. Workers bundle JSON and instantiate the same GLPK WASM module using a small reproducibly generated compatibility shim. Use the official SDK WebStandardStreamableHTTPServerTransport. No container subscription, API key or local machine dependency is required for the Worker.

1. Establish Worker runtime acceptance tests: real initialize/list/call, Chinese search, recipe data, catalyst loop, location conflict, invalid origin, body limits, homepage/health. Run before implementation to establish missing support.
2. Add platform providers; preserve existing tests. Generate the Worker GLPK factory with pinned, asserted transformations (forward instantiateWasm options, disable Node environment detection, use memory FS). Bundle the upstream wasm as a module. Document GPL source/build provenance.
3. Add Worker entry, bounded requests, rate limit, homepage links and Cloudflare configuration. Test in actual workerd using Wrangler, not Node alone. Compare results to existing tests and run production dry-run.
4. Rewrite README around public use, self-hosting, Cloudflare and acknowledgements. Add Docker Compose, CI, data sync/check instructions. Explain limitations and ownership. Remove ephemeral host and machine-specific paths from published material.
5. Read-only review, fix issues, rerun tests. Initialize independent Git repository, create `anormlylee/factorio-planner-mcp`, commit and push only intended source/data/licenses.
6. Authenticate Cloudflare (already verified), inspect target hostname for conflicts, deploy Worker/custom domain, run public SDK acceptance. Link final repository and permanent MCP URL; retain temporary tunnel until new endpoint is verified.

Execution is authorized by the user's request; no further design confirmation is needed. If a real account/domain permission prevents publication, finish the independently reviewable work and report the exact blocker.
