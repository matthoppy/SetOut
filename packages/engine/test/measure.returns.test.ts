/**
 * Short return panels. A run with no door in it can be a few hundred
 * millimetres long, and the checks that catch wrong units must not refuse it.
 */
import { describe, expect, test } from 'vitest';
import {
  checkMeasurements,
  designFromTemplate,
  openingContext,
  TEMPLATES,
  type ConfiguratorState,
} from '../src';

const blocking = (state: ConfiguratorState) =>
  checkMeasurements(state.opening, openingContext(state))
    .filter((c) => c.level === 'blocking' && c.code !== 'shape-unconfirmed')
    .map((c) => c.code);

/** A layout as it starts, with the walls left unchecked so only the widths are in question. */
function layout(id: string, widths?: number[]): ConfiguratorState {
  const state = designFromTemplate(id);
  return {
    ...state,
    opening: {
      ...state.opening,
      method: 'assumed-square',
      runs: state.opening.runs.map((run, i) => ({ ...run, widthAtFloorMm: widths?.[i] ?? run.widthAtFloorMm })),
    },
  };
}

describe('how short a run may be', () => {
  test.each(TEMPLATES)("$id is not refused at the sizes it starts with", (template) => {
    expect(blocking(layout(template.id))).toEqual([]);
  });

  test.each([150, 200, 300, 399])('a %imm return on a walk-in is a real size', (width) => {
    expect(blocking(layout('walk-in-return', [900, width]))).toEqual([]);
  });

  test('a return typed in centimetres is still caught, with the right size offered', () => {
    const state = layout('walk-in-return', [900, 30]);
    const check = checkMeasurements(state.opening, openingContext(state)).find((c) => c.runIndex === 1);
    expect(check?.code).toBe('run1-widthAtFloor-unit-centimetres');
    expect(check?.suggestionMm).toBe(300);
  });

  test('a run with a door in it is still held to the size of an opening', () => {
    // The front of a corner shower has the door in it.
    expect(blocking(layout('corner-door-return', [800, 300]))).toEqual(['run1-widthAtFloor-unit-centimetres']);
    // Its side has not, so it may be short.
    expect(blocking(layout('corner-door-return', [300, 700]))).toEqual([]);
  });

  test('a single opening between two walls is unchanged', () => {
    expect(blocking(layout('alcove-door', [90]))).toEqual(['run0-widthAtFloor-unit-centimetres']);
    expect(blocking(layout('alcove-door', [300]))).toEqual(['run0-widthAtFloor-unit-centimetres']);
  });

  test('the checks work as before when they are not told about the shape', () => {
    const state = layout('walk-in-return', [900, 300]);
    const ctx = { hasStartWall: true, hasEndWall: false, glassHeightMm: 2000 };
    expect(checkMeasurements(state.opening, ctx).some((c) => c.code === 'run1-widthAtFloor-unit-centimetres')).toBe(true);
  });
});
