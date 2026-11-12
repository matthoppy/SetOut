/**
 * The design document: its format, reading older formats, and refusing
 * anything the engine should not be given.
 */
import { describe, expect, test } from 'vitest';
import {
  createDocument,
  designFromTemplate,
  DOCUMENT_FORMAT,
  DocumentError,
  TEMPLATES,
  upgradeDocument,
} from '../src';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tests break documents on purpose
type Loose = Record<string, any>;

const valid = (): Loose => structuredClone(createDocument(designFromTemplate('alcove-panel-door')));

function refused(raw: unknown, code: 'invalid' | 'too-new' = 'invalid'): string {
  let error: unknown;
  try {
    upgradeDocument(raw);
  } catch (e) {
    error = e;
  }
  expect(error).toBeInstanceOf(DocumentError);
  expect((error as DocumentError).code).toBe(code);
  return (error as DocumentError).message;
}

describe('reading a document', () => {
  test.each(TEMPLATES)('a fresh $id design reads back unchanged', (template) => {
    const doc = createDocument(designFromTemplate(template.id));
    expect(doc.format).toBe(DOCUMENT_FORMAT);
    expect(upgradeDocument(structuredClone(doc))).toEqual(doc);
  });

  test('reading does not change what was passed in', () => {
    const doc = valid();
    const before = structuredClone(doc);
    upgradeDocument(doc);
    expect(doc).toEqual(before);
  });

  test('fields the engine does not know are dropped', () => {
    const doc = valid();
    doc.design.junk = 'x'.repeat(10_000);
    doc.design.panels[0].colour = 'red';
    doc.design.opening.runs[0].extra = 1;
    doc.extra = true;
    const read = upgradeDocument(doc) as Loose;
    expect(read.extra).toBeUndefined();
    expect(read.design.junk).toBeUndefined();
    expect(read.design.panels[0].colour).toBeUndefined();
    expect(read.design.opening.runs[0].extra).toBeUndefined();
    expect(read).toEqual(valid());
  });

  test('a design from an unknown layout is refused', () => {
    expect(() => designFromTemplate('hexagon')).toThrow(DocumentError);
  });
});

describe('older formats', () => {
  test('a bare design, as Custom Showers saved it, becomes format 1', () => {
    const saved = designFromTemplate('corner-door-return');
    const read = upgradeDocument(structuredClone(saved));
    expect(read).toEqual({ format: 1, design: saved });
  });

  test('a design saved before newer fields existed is filled in', () => {
    const saved: Loose = structuredClone(designFromTemplate('alcove-door'));
    // As it would have been saved before halves, ceiling readings, the laser
    // offset and the coating existed.
    delete saved.glassCoating;
    delete saved.opening.laserOffsetMm;
    delete saved.opening.aboveGlass;
    delete saved.opening.walkInOpeningMm;
    for (const run of saved.opening.runs) {
      delete run.halfAMm;
      delete run.halfBMm;
      delete run.ceilingStartMm;
      delete run.ceilingEndMm;
      delete run.widthAtMiddleCheckMm;
    }
    const read = upgradeDocument(saved);
    expect(read.format).toBe(1);
    expect(read.design.glassCoating).toBe('none');
    expect(read.design.opening.laserOffsetMm).toBe(50);
    expect(read.design.opening.runs[0].halfAMm).toBeNull();
    expect(read.design.opening.runs[0].widthAtFloorMm).toBe(700);
  });

  test('a saved design keeps what the customer measured', () => {
    const saved: Loose = structuredClone(designFromTemplate('alcove-panel-door'));
    saved.opening.method = 'packers';
    saved.opening.startWall = { gapBottomMm: 0, gapMiddleMm: null, gapTopMm: 6 };
    saved.opening.runs[0].widthAtFloorMm = 1104;
    const read = upgradeDocument(saved);
    expect(read.design.opening.method).toBe('packers');
    expect(read.design.opening.startWall.gapTopMm).toBe(6);
    expect(read.design.opening.runs[0].widthAtFloorMm).toBe(1104);
  });

  test("a shower's own wall hinge is kept, and a design without one has none", () => {
    const doc = valid();
    doc.design.wallHinge = 'full';
    expect(upgradeDocument(structuredClone(doc)).design.wallHinge).toBe('full');
    expect('wallHinge' in upgradeDocument(valid()).design).toBe(false);
  });

  test('a document from a newer engine is refused, not guessed at', () => {
    const doc = valid();
    doc.format = DOCUMENT_FORMAT + 1;
    expect(refused(doc, 'too-new')).toContain(`format ${DOCUMENT_FORMAT + 1}`);
  });
});

describe('refusing what is not a design', () => {
  test.each([null, undefined, 42, 'design', [], {}, { format: 1 }, { format: '1', design: {} }, { format: -1 }, { format: 1.5 }])(
    'refuses %j',
    (raw) => {
      refused(raw);
    }
  );

  const broken: [string, (d: Loose) => void, string][] = [
    ['no panels', (d) => (d.panels = []), 'panels'],
    ['too many panels', (d) => (d.panels = Array.from({ length: 13 }, (_, i) => ({ id: `p${i}`, kind: 'fixed', width_mm: 300 }))), 'panels'],
    ['a width that is text', (d) => (d.panels[0].width_mm = '400'), 'panels[0].width_mm'],
    ['a width that is not a number', (d) => (d.panels[0].width_mm = Number.NaN), 'panels[0].width_mm'],
    ['a width of nothing', (d) => (d.panels[0].width_mm = 0), 'panels[0].width_mm'],
    ['a negative width', (d) => (d.panels[1].width_mm = -700), 'panels[1].width_mm'],
    ['an absurd width', (d) => (d.panels[0].width_mm = 1e9), 'panels[0].width_mm'],
    ['an unknown kind of panel', (d) => (d.panels[0].kind = 'sliding'), 'panels[0].kind'],
    ['a door with no hinge side', (d) => delete d.panels[1].door, 'panels[1].door'],
    ['a door hinged at the top', (d) => (d.panels[1].door.hinge_side = 'top'), 'panels[1].door.hinge_side'],
    ['two panels with one id', (d) => (d.panels[1].id = d.panels[0].id), 'panels'],
    ['a missing junction', (d) => (d.junctions = []), 'junctions'],
    ['a 45 degree junction', (d) => (d.junctions[0].angle_deg = 45), 'junctions[0].angle_deg'],
    ['a wall that is "yes"', (d) => (d.leftWall = 'yes'), 'leftWall'],
    ['no height', (d) => delete d.heightMm, 'heightMm'],
    ['an infinite height', (d) => (d.heightMm = Number.POSITIVE_INFINITY), 'heightMm'],
    ['a mounting we do not make', (d) => (d.mounting = 'glue'), 'mounting'],
    ['7mm glass', (d) => (d.glassThicknessMm = 7), 'glassThicknessMm'],
    ['a glass we do not offer', (d) => (d.glassType = 'mirror'), 'glassType'],
    ['an empty finish', (d) => (d.finishId = ''), 'finishId'],
    ['a handle that is a script', (d) => (d.handleId = 'x'.repeat(101)), 'handleId'],
    ['a notch with no size', (d) => (d.panels[0].notches = { bottom_left: true, bottom_right: false }), 'panels[0].notches.width_mm'],
    ['a negative air gap', (d) => (d.topGapMm = -30), 'topGapMm'],
    ['something else above the door', (d) => (d.aboveDoor = 'brick'), 'aboveDoor'],
    ['a wall hinge CRL does not make', (d) => (d.wallHinge = 'glued'), 'wallHinge'],
    ['no measurements at all', (d) => delete d.opening, 'opening'],
    ['measurements for the wrong number of runs', (d) => d.opening.runs.push(d.opening.runs[0]), 'opening.runs'],
    ['a run width that is text', (d) => (d.opening.runs[0].widthAtFloorMm = 'wide'), 'opening.runs[0].widthAtFloorMm'],
    ['a negative wall reading', (d) => (d.opening.startWall.gapTopMm = -3), 'opening.startWall.gapTopMm'],
    ['a method we do not know', (d) => (d.opening.method = 'guess'), 'opening.method'],
    ['a floor that is low in the middle', (d) => (d.opening.runs[0].floorLowEnd = 'middle'), 'opening.runs[0].floorLowEnd'],
    ['cross readings that are text', (d) => (d.opening.crossReadings = { leftBottomMm: 'fifty' }), 'opening.crossReadings.leftBottomMm'],
    ['a shape confirmed as "ok"', (d) => (d.opening.shapeConfirmed = 'ok'), 'opening.shapeConfirmed'],
  ];

  test.each(broken)('refuses %s', (_name, breakIt, path) => {
    const doc = valid();
    breakIt(doc.design);
    expect(refused(doc)).toContain(path);
  });

  test('the same faults are refused in a bare saved design', () => {
    const saved: Loose = structuredClone(designFromTemplate('alcove-door'));
    saved.panels[0].width_mm = 'wide';
    expect(refused(saved)).toContain('panels[0].width_mm');
    expect(refused({ panels: [null] })).toContain('panels[0]');
    expect(refused({ panels: 'p1' })).toBeTruthy();
  });
});
