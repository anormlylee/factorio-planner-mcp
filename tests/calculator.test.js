import test from 'node:test';
import assert from 'node:assert/strict';

const api = await import('../src/calculator.js').catch(() => ({}));
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);

test('calculator implementation exists', () => assert.equal(typeof api.calculateProduction, 'function'));
test('12 quantum processors include base productivity and preserve hot coolant catalyst', async () => {
  const r = await api.calculateProduction({ targets: { 'quantum-processor': 12 }, recipeIds: ['quantum-processor'], location: '玄冥星' });
  close(r.inputs.find(x => x.id === 'fluoroketone-cold').rate, 80);
  close(r.surplus.find(x => x.id === 'fluoroketone-hot').rate, 40);
  close(r.steps[0].craftsPerMinute, 8);
});
test('cooling loop distinguishes gross cold flow from net imported cold', async () => {
  const r = await api.calculateProduction({ targets: { 'quantum-processor': 12 }, recipeIds: ['quantum-processor', 'fluoroketone-cooling'], externalInputs: ['fluoroketone-cold'], location: 'aquilo' });
  close(r.inputs.find(x => x.id === 'fluoroketone-cold').rate, 40);
  close(r.flows.find(x => x.id === 'fluoroketone-cold').consumed, 80);
  close(r.flows.find(x => x.id === 'fluoroketone-cold').produced, 40);
  assert.equal(r.startupInventory, null);
});
test('legendary productivity modules reduce inputs without multiplying returned catalyst', async () => {
  const r = await api.calculateProduction({ targets: { 'quantum-processor': 12 }, recipeIds: ['quantum-processor'], settings: { 'quantum-processor': { quality: 'legendary', modules: [{ id: 'productivity-module-3', quality: 'legendary', count: 5 }] } } });
  close(r.inputs.find(x => x.id === 'fluoroketone-cold').rate, 120 / 2.75);
  close(r.surplus.find(x => x.id === 'fluoroketone-hot').rate, 60 / 2.75);
  close(r.steps[0].speed, 1.25);
});
test('impossible Nauvis production returns location evidence, never plausible numbers', async () => {
  await assert.rejects(() => api.calculateProduction({ targets: { '黑瓶': 120 }, location: '地星' }), e => e.code === 'LOCATION_CONFLICT' && e.details.recipes.some(x => x.id === 'promethium-science-pack'));
});
test('barrel transport accounts for steel, returned barrels and unknown initial stock', () => {
  const r = api.calculateBarrelTransport({ fluid: '冷氟酮', rate: 40, returnEmptyBarrels: false });
  close(r.barrelsPerMinute, 0.8);
  close(r.newBarrelsPerMinute, 0.8);
  close(r.barrelMaterials.find(x => x.id === 'steel-plate').rate, 0.8);
  assert.equal(r.initialBarrels, null);
  const loop = api.calculateBarrelTransport({ fluid: '冷氟酮', rate: 40, returnEmptyBarrels: true, roundTripMinutes: 10 });
  close(loop.newBarrelsPerMinute, 0);
  assert.equal(loop.initialBarrels, 8);
});
test('recipe chain conserves mass and scales linearly', async () => {
  const r = await api.calculateProduction({ targets: { 'iron-plate': 60 }, recipeIds: ['iron-plate'] });
  close(r.inputs.find(x => x.id === 'iron-ore').rate, 60);
  assert.ok(r.maxBalanceError < 1e-7);
});
test('bad settings and missing targets fail explicitly', async () => {
  await assert.rejects(() => api.calculateProduction({ targets: { 'quantum-processor': 12 }, recipeIds: ['quantum-processor'], settings: { 'quantum-processor': { modules: [{ id: 'productivity-module-3', count: 6 }] } } }), e => e.code === 'INVALID_SETTINGS');
  await assert.rejects(() => api.calculateProduction({ targets: { '黑瓶': 120 }, recipeIds: ['iron-plate'] }), e => e.code === 'UNPRODUCIBLE_TARGET');
});
test('machine location restrictions are enforced and legal default producers are selected', async () => {
  await assert.rejects(() => api.calculateProduction({ targets: { 'biter-egg': 120 }, location: 'aquilo' }), e => e.code === 'LOCATION_CONFLICT');
  const r = await api.calculateProduction({ targets: { 'iron-plate': 60 }, recipeIds: ['iron-plate'], location: 'space-platform' });
  assert.equal(r.steps[0].machine, 'electric-furnace');
  await assert.rejects(() => api.calculateProduction({ targets: { 'iron-plate': 60 }, recipeIds: ['iron-plate'], location: 'space-platform', settings: { 'iron-plate': { machine: 'stone-furnace' } } }), e => e.code === 'LOCATION_CONFLICT');
});
test('research bonus cannot create cold fluoroketone from nothing', async () => {
  await assert.rejects(() => api.calculateProduction({ targets: { 'fluoroketone-cold': 60 }, recipeIds: ['fluoroketone-cooling'], settings: { 'fluoroketone-cooling': { productivityBonus: 100 } } }), e => e.code === 'INVALID_SETTINGS');
});
