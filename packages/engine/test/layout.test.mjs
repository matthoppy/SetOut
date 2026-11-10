/** Panels follow the measured run. Run with: npm test */
import { test } from 'vitest';
import assert from 'node:assert';
import { rebalanceRun, runAddsUp, scaleRunPanels } from '../src/layout';

const fixed = (id, w) => ({ id, kind: 'fixed', width_mm: w });
const door = (id, w) => ({ id, kind: 'door', width_mm: w, door: { hinge_side: 'right', swing: 'out' } });

test('scaling keeps proportions and lands exactly on the target', () => {
  const panels = scaleRunPanels([fixed('a', 400), door('b', 700)], [0, 1], 1210);
  assert.strictEqual(panels[0].width_mm + panels[1].width_mm, 1210);
  assert.strictEqual(panels[0].width_mm, 440);
  assert.strictEqual(panels[1].width_mm, 770);
});

test('scaling a run inside a longer chain leaves the other panels alone', () => {
  const chain = [fixed('side', 800), fixed('a', 300), door('b', 700)];
  const next = scaleRunPanels(chain, [1, 2], 1100);
  assert.strictEqual(next[0].width_mm, 800);
  assert.strictEqual(next[1].width_mm + next[2].width_mm, 1100);
});

test('changing the door makes the fixed panel whatever is left', () => {
  const chain = [fixed('a', 400), door('b', 700)];
  const next = rebalanceRun(chain, [0, 1], 1, 650, 1100);
  assert.strictEqual(next[1].width_mm, 650);
  assert.strictEqual(next[0].width_mm, 450);
  assert.ok(runAddsUp(next, [0, 1], 1100));
});

test('a door cannot swallow the fixed panel entirely', () => {
  const next = rebalanceRun([fixed('a', 400), door('b', 700)], [0, 1], 1, 1200, 1100);
  assert.strictEqual(next[0].width_mm, 100);
  assert.strictEqual(next[1].width_mm, 1000);
});

test('three panels share the remainder in proportion', () => {
  const chain = [fixed('a', 300), door('b', 700), fixed('c', 300)];
  const next = rebalanceRun(chain, [0, 1, 2], 1, 800, 1300);
  assert.strictEqual(next[1].width_mm, 800);
  assert.strictEqual(next[0].width_mm, 250);
  assert.strictEqual(next[2].width_mm, 250);
});

test('a single-panel run is the measurement itself and is left alone', () => {
  const chain = [fixed('a', 900)];
  assert.deepStrictEqual(rebalanceRun(chain, [0], 0, 950, 900), chain);
});
