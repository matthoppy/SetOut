/**
 * The company chooses what its customers can have. What it has not chosen
 * yet stays as it was before it could choose: every fixing, glass type and
 * coating offered, and a new design in U-channel, clear glass, no coating.
 */
import { describe, expect, test } from 'vitest';
import {
  GLASS_COATING_TEXT,
  GLASS_COATINGS,
  GLASS_TYPE_TEXT,
  GLASS_TYPES,
  MOUNTING_TEXT,
  MOUNTINGS,
  STANDARD_CHOICES,
  createDocument,
  createInitialState,
  offerOf,
  upgradeDocument,
} from '../src';

describe('offerOf', () => {
  test('nothing stored offers every one, with SetOut’s standard', () => {
    expect(offerOf(MOUNTINGS, undefined, STANDARD_CHOICES.mounting)).toEqual({ offered: ['channel', 'clamps'], standard: 'channel' });
    expect(offerOf(GLASS_TYPES, null, STANDARD_CHOICES.glassType)).toEqual({ offered: [...GLASS_TYPES], standard: 'clear' });
  });

  test('a stored offer is kept in SetOut’s order, without anything SetOut does not know', () => {
    expect(offerOf(GLASS_TYPES, { offered: ['grey', 'clear', 'pink'], standard: 'clear' }, 'clear')).toEqual({ offered: ['clear', 'grey'], standard: 'clear' });
  });

  test('the standard is always offered, and one SetOut does not know gives way to its own', () => {
    expect(offerOf(MOUNTINGS, { offered: ['clamps'], standard: 'channel' }, 'channel')).toEqual({ offered: ['channel', 'clamps'], standard: 'channel' });
    expect(offerOf(MOUNTINGS, { offered: ['clamps'], standard: 'glue' }, 'channel')).toEqual({ offered: ['channel', 'clamps'], standard: 'channel' });
    expect(offerOf(GLASS_COATINGS, { offered: [], standard: 'easy-clean' }, 'none')).toEqual({ offered: ['easy-clean'], standard: 'easy-clean' });
  });
});

describe('the lists', () => {
  test('every one has a name and a line for the customer', () => {
    const texts = [...MOUNTINGS.map((id) => MOUNTING_TEXT[id]), ...GLASS_TYPES.map((id) => GLASS_TYPE_TEXT[id]), ...GLASS_COATINGS.map((id) => GLASS_COATING_TEXT[id])];
    for (const text of texts) {
      expect(text.label).toBeTruthy();
      expect(text.description).toBeTruthy();
      expect(text.words).toBeTruthy();
    }
  });

  test('a design is read with every one SetOut knows', () => {
    for (const mounting of MOUNTINGS) {
      for (const glassType of GLASS_TYPES) {
        for (const glassCoating of GLASS_COATINGS) {
          const design = { ...createInitialState(), mounting, glassType, glassCoating };
          const read = upgradeDocument(JSON.parse(JSON.stringify(createDocument(design))));
          expect([read.design.mounting, read.design.glassType, read.design.glassCoating]).toEqual([mounting, glassType, glassCoating]);
        }
      }
    }
  });

  test('a new design starts at the standards', () => {
    const fresh = createInitialState();
    expect({ mounting: fresh.mounting, glassType: fresh.glassType, glassCoating: fresh.glassCoating }).toEqual(STANDARD_CHOICES);
  });
});
