import test from 'node:test';
import assert from 'node:assert/strict';

const catalog = await import('../src/catalog.js').catch(() => ({}));

test('catalog implementation exists', () => assert.equal(typeof catalog.getCatalog, 'function'));
test('search resolves 黑瓶 and cold fluoroketone without requiring version', () => {
  const c = catalog.getCatalog();
  assert.equal(c.resolve('黑瓶').id, 'promethium-science-pack');
  assert.equal(c.resolve('冷氟酮').id, 'fluoroketone-cold');
  assert.equal(c.resolve('地星', 'location').id, 'nauvis');
  assert.ok(c.search('量子').some(x => x.id === 'quantum-processor'));
});
test('recipes expose real locations and pinned data provenance', () => {
  const c = catalog.getCatalog();
  assert.deepEqual(c.recipe('promethium-science-pack').locations, ['space-platform']);
  assert.deepEqual(c.recipe('quantum-processor').out, { 'quantum-processor': 1, 'fluoroketone-hot': 5 });
  assert.equal(c.provenance.commit, 'eef44c6be28e251a22a211c2302ed43368d09ed0');
});
test('unsupported version and unknown names give actionable errors', () => {
  assert.throws(() => catalog.getCatalog('missing'), e => e.code === 'UNSUPPORTED_DATASET');
  assert.throws(() => catalog.getCatalog().resolve('imaginary-item'), e => e.code === 'UNKNOWN_ENTITY');
});
