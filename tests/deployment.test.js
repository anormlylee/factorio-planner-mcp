import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('self-host config is standalone and preserves runtime settings without maintainer routes', () => {
  const read = name => JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url)));
  const production = read('wrangler.jsonc');
  const self = read('wrangler.self-host.jsonc');
  assert.equal(self.main, production.main);
  assert.equal(self.compatibility_date, production.compatibility_date);
  assert.deepEqual(self.alias, production.alias);
  assert.deepEqual(self.build, production.build);
  assert.deepEqual(self.ratelimits, production.ratelimits);
  assert.deepEqual(self.routes, []);
  assert.equal(self.extends, undefined);
});
