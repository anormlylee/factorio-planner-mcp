import createGLPK from './generated/glpk-worker-factory.js';
import wasm from './generated/glpk.wasm';

export default function createSolver() {
  return createGLPK({
    instantiateWasm(imports, receiveInstance) {
      // Emscripten installs its pending instance before this callback. Calling
      // it synchronously would overwrite the exports with the pending Promise.
      queueMicrotask(() => receiveInstance(new WebAssembly.Instance(wasm, imports), wasm));
      return {};
    },
  });
}
