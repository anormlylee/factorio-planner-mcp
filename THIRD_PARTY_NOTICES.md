# Third-party notices

FactorioLab data and Chinese translations are copied unchanged from https://github.com/factoriolab/factoriolab at commit `eef44c6be28e251a22a211c2302ed43368d09ed0`. Original MIT license is retained in `data/FACTORIOLAB-LICENSE`. Dataset SHA-256 values and upstream versions are in `data/manifest.json`.

This project is independently implemented and is not an official FactorioLab or Wube product. It does not import or run the Angular application. The production adapter follows the net material-balance and catalyst-productivity rules inspected in FactorioLab `src/state/adjustment.ts` and `src/solver/solver.ts`; it does not claim complete feature parity with FactorioLab.

The runtime depends on GLPK.js 5.0.0 (https://github.com/jvail/glpk.js), licensed GPL-3.0, and its bundled GLPK WebAssembly solver. This project is distributed under GPL-3.0-only. The GPL license is in `LICENSE`; original dependency notices and source references remain in their npm packages. Dependency versions and integrity hashes are pinned in `package-lock.json`.

The Worker-only adapter is generated reproducibly by `scripts/prepare-worker.js` from the pinned GLPK.js distribution, with changes limited to initialization/options and filesystem environment compatibility. The upstream WASM binary is copied unchanged. Details and source/build references are in `docs/worker-adapter.md`. Node/Docker retain the unmodified upstream Node factory.

MCP SDK is MIT licensed; Express is MIT licensed; Zod is MIT licensed. Their license files remain in their installed packages.
