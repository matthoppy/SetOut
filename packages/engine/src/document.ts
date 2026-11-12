/**
 * The design document.
 *
 * One document describes one shower: its panels, its options and everything
 * the customer measured. It is the only thing that is stored. Drawings, cut
 * sizes, hardware and prices are always worked out from it, so it is the one
 * shape that must never be read carelessly.
 *
 * Two rules follow:
 *
 * 1. A document carries the number of the format it was written in. Reading
 *    one goes through upgradeDocument, which brings an older format up to
 *    today's one step at a time. Stored documents are never rewritten; they
 *    are upgraded each time they are read.
 *
 * 2. A document from outside is checked before the engine touches it. A
 *    width of "wide" or NaN must be a refused request, not a cut size.
 */

import { runWidthsMm } from './geometry';
import {
  createOpeningMeasurements,
  hydrateOpening,
  keepSetup,
  syncRuns,
  type CrossReadings,
  type OpeningMeasurements,
  type RunMeasurement,
  type WallMeasurement,
} from './measure';
import { getTemplate, type ShowerTemplate } from './templates';
import {
  createInitialState,
  BELLAGIO_FITS,
  IN_LINE_HINGES,
  SLIDING_SYSTEMS,
  VIENNA_CUTOUTS,
  WALL_HINGES,
  type ConfiguratorJunction,
  type ConfiguratorPanel,
  type ConfiguratorState,
  type GlassThickness,
} from './types';

/** The format this engine writes. Raise it, and add an upgrade, to change the shape. */
export const DOCUMENT_FORMAT = 1;

export interface DesignDocument {
  format: typeof DOCUMENT_FORMAT;
  design: ConfiguratorState;
}

export class DocumentError extends Error {
  constructor(
    readonly code: 'invalid' | 'too-new',
    message: string
  ) {
    super(message);
    this.name = 'DocumentError';
  }
}

export function createDocument(design: ConfiguratorState): DesignDocument {
  return { format: DOCUMENT_FORMAT, design };
}

// ---------------------------------------------------------------------------
// Starting a design
// ---------------------------------------------------------------------------

/**
 * Drop a template's shape into a design, keeping anything already chosen that
 * is not about shape (finish, handle, mounting), so switching layout does not
 * silently undo the hardware.
 */
export function applyTemplate(design: ConfiguratorState, template: ShowerTemplate): ConfiguratorState {
  const panels = structuredClone(template.panels);
  const junctions = structuredClone(template.junctions);
  // The template's own widths become the opening until the customer measures
  // it, so the two never start out contradicting each other. Anything they
  // had already confirmed about the shape no longer applies.
  const widths = runWidthsMm(panels, junctions);
  const next: ConfiguratorState = {
    ...design,
    panels,
    junctions,
    leftWall: template.leftWall,
    rightWall: template.rightWall,
    heightMm: template.heightMm ?? design.heightMm,
    // New shape, new measurements, but the same person with the same tools.
    opening: keepSetup(design.opening, syncRuns(createOpeningMeasurements(widths), widths)),
  };
  // A layout says whether its door slides; one that does not leaves no trace
  // of the last one that did.
  if (template.sliding) next.sliding = { ...template.sliding };
  else delete next.sliding;
  return next;
}

/** A fresh design in one of the standard layouts. */
export function designFromTemplate(
  templateId: string,
  glassThicknessMm: GlassThickness = 10
): ConfiguratorState {
  const template = getTemplate(templateId);
  if (!template) throw new DocumentError('invalid', `There is no layout called "${templateId}".`);
  return applyTemplate(createInitialState(glassThicknessMm), template);
}

// ---------------------------------------------------------------------------
// Upgrading
// ---------------------------------------------------------------------------

type Loose = Record<string, unknown>;

const isObject = (v: unknown): v is Loose => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * One step per format: UPGRADES[n] turns a format n document into n + 1.
 *
 * Format 0 is a design as the Custom Showers configurator saved it, with no
 * wrapper and possibly missing fields that were added later.
 */
const UPGRADES: Record<number, (doc: Loose) => Loose> = {
  0: (doc) => {
    const saved = isObject(doc.design) ? doc.design : {};
    const thickness = typeof saved.glassThicknessMm === 'number' ? saved.glassThicknessMm : 10;
    const design: Loose = { ...createInitialState(thickness as GlassThickness), ...saved };
    if (Array.isArray(design.panels) && Array.isArray(design.junctions)) {
      try {
        const widths = runWidthsMm(
          design.panels as ConfiguratorPanel[],
          design.junctions as ConfiguratorJunction[]
        );
        design.opening = hydrateOpening(
          isObject(saved.opening) ? (saved.opening as Partial<OpeningMeasurements>) : null,
          widths
        );
      } catch {
        // Panels too malformed to trace. Validation below says what is wrong.
      }
    }
    return { format: 1, design };
  },
};

/**
 * Read a document from storage or from outside, whatever format it was
 * written in, and return it in today's format.
 *
 * Throws a DocumentError when it is not a design document, when a value in
 * it is not usable, or when it was written by a newer engine than this one.
 */
export function upgradeDocument(raw: unknown): DesignDocument {
  if (!isObject(raw)) throw new DocumentError('invalid', 'A design document must be an object.');

  let doc: Loose;
  if (raw.format === undefined && Array.isArray(raw.panels)) {
    doc = { format: 0, design: raw };
  } else {
    doc = raw;
  }

  const format = doc.format;
  if (typeof format !== 'number' || !Number.isInteger(format) || format < 0) {
    throw new DocumentError('invalid', 'A design document must say which format it is in.');
  }
  if (format > DOCUMENT_FORMAT) {
    throw new DocumentError(
      'too-new',
      `This design is in format ${format}, and this engine reads up to format ${DOCUMENT_FORMAT}.`
    );
  }

  for (let from = format; from < DOCUMENT_FORMAT; from++) {
    doc = UPGRADES[from](doc);
  }

  return { format: DOCUMENT_FORMAT, design: readDesign(doc.design) };
}

// ---------------------------------------------------------------------------
// Checking
// ---------------------------------------------------------------------------

/** Nothing in a bathroom is longer than this. Bounds every length in a document. */
const MAX_MM = 20000;
const MAX_PANELS = 12;
const MAX_TEXT = 100;

function fail(path: string, expected: string): never {
  throw new DocumentError('invalid', `${path} must be ${expected}.`);
}

function mm(v: unknown, path: string, min = 0): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > MAX_MM) {
    fail(path, `a number from ${min} to ${MAX_MM}`);
  }
  return v;
}

function mmOrNull(v: unknown, path: string): number | null {
  return v === null || v === undefined ? null : mm(v, path);
}

function bool(v: unknown, path: string): boolean {
  if (typeof v !== 'boolean') fail(path, 'true or false');
  return v;
}

function text(v: unknown, path: string): string {
  if (typeof v !== 'string' || v.length === 0 || v.length > MAX_TEXT) {
    fail(path, `text of 1 to ${MAX_TEXT} characters`);
  }
  return v;
}

function oneOf<T extends string | number>(v: unknown, allowed: readonly T[], path: string): T {
  if (!allowed.includes(v as T)) fail(path, `one of ${allowed.join(', ')}`);
  return v as T;
}

function oneOfOrNull<T extends string>(v: unknown, allowed: readonly T[], path: string): T | null {
  return v === null || v === undefined ? null : oneOf(v, allowed, path);
}

function object(v: unknown, path: string): Loose {
  if (!isObject(v)) fail(path, 'an object');
  return v;
}

function readPanel(v: unknown, path: string): ConfiguratorPanel {
  const p = object(v, path);
  const kind = oneOf(p.kind, ['fixed', 'door'] as const, `${path}.kind`);
  const panel: ConfiguratorPanel = {
    id: text(p.id, `${path}.id`),
    kind,
    width_mm: mm(p.width_mm, `${path}.width_mm`, 1),
  };
  if (kind === 'door') {
    const door = object(p.door, `${path}.door`);
    panel.door = {
      hinge_side: oneOf(door.hinge_side, ['left', 'right'] as const, `${path}.door.hinge_side`),
      swing: oneOf(door.swing, ['out', 'both'] as const, `${path}.door.swing`),
    };
  }
  if (p.notches !== undefined && p.notches !== null) {
    const n = object(p.notches, `${path}.notches`);
    panel.notches = {
      bottom_left: bool(n.bottom_left, `${path}.notches.bottom_left`),
      bottom_right: bool(n.bottom_right, `${path}.notches.bottom_right`),
      width_mm: mm(n.width_mm, `${path}.notches.width_mm`),
      height_mm: mm(n.height_mm, `${path}.notches.height_mm`),
    };
  }
  return panel;
}

function readWall(v: unknown, path: string): WallMeasurement {
  const w = object(v, path);
  return {
    gapBottomMm: mmOrNull(w.gapBottomMm, `${path}.gapBottomMm`),
    gapMiddleMm: mmOrNull(w.gapMiddleMm, `${path}.gapMiddleMm`),
    gapTopMm: mmOrNull(w.gapTopMm, `${path}.gapTopMm`),
  };
}

const OPTIONAL_RUN_READINGS = [
  'halfAMm',
  'halfBMm',
  'wholeMm',
  'floorStartMm',
  'floorEndMm',
  'ceilingStartMm',
  'ceilingEndMm',
  'widthAtMiddleCheckMm',
] as const;

function readRun(v: unknown, path: string): RunMeasurement {
  const r = object(v, path);
  const run: RunMeasurement = {
    widthAtFloorMm: mm(r.widthAtFloorMm, `${path}.widthAtFloorMm`),
    widthAtTopCheckMm: mmOrNull(r.widthAtTopCheckMm, `${path}.widthAtTopCheckMm`),
    floorFallMm: mm(r.floorFallMm, `${path}.floorFallMm`),
    floorLowEnd: oneOfOrNull(r.floorLowEnd, ['start', 'end'] as const, `${path}.floorLowEnd`),
  };
  for (const key of OPTIONAL_RUN_READINGS) {
    if (r[key] !== undefined) run[key] = mmOrNull(r[key], `${path}.${key}`);
  }
  return run;
}

const CROSS_KEYS = [
  'leftBottomMm',
  'leftTopMm',
  'rightBottomMm',
  'rightTopMm',
  'floorLeftMm',
  'floorRightMm',
  'ceilingLeftMm',
  'ceilingRightMm',
] as const satisfies readonly (keyof CrossReadings)[];

function readCross(v: unknown, path: string): CrossReadings {
  const c = object(v, path);
  const cross = {} as CrossReadings;
  for (const key of CROSS_KEYS) cross[key] = mmOrNull(c[key], `${path}.${key}`);
  return cross;
}

function readOpening(v: unknown, runCount: number): OpeningMeasurements {
  const o = object(v, 'opening');
  if (!Array.isArray(o.runs) || o.runs.length !== runCount) {
    fail('opening.runs', `a list of ${runCount}, one for each straight run of glass`);
  }
  const opening: OpeningMeasurements = {
    runs: o.runs.map((r, i) => readRun(r, `opening.runs[${i}]`)),
    startWall: readWall(o.startWall, 'opening.startWall'),
    endWall: readWall(o.endWall, 'opening.endWall'),
    method: oneOfOrNull(
      o.method,
      ['laser', 'packers', 'level', 'assumed-square'] as const,
      'opening.method'
    ),
    shapeConfirmed: bool(o.shapeConfirmed, 'opening.shapeConfirmed'),
  };
  if (o.crossReadings !== undefined) {
    opening.crossReadings =
      o.crossReadings === null ? null : readCross(o.crossReadings, 'opening.crossReadings');
  }
  if (o.ceilingHeightMm !== undefined) {
    opening.ceilingHeightMm = mmOrNull(o.ceilingHeightMm, 'opening.ceilingHeightMm');
  }
  if (o.laserOffsetMm !== undefined) {
    opening.laserOffsetMm = mm(o.laserOffsetMm, 'opening.laserOffsetMm');
  }
  if (o.walkInOpeningMm !== undefined) {
    opening.walkInOpeningMm = mmOrNull(o.walkInOpeningMm, 'opening.walkInOpeningMm');
  }
  if (o.aboveGlass !== undefined) {
    opening.aboveGlass = oneOfOrNull(o.aboveGlass, ['clear', 'ceiling'] as const, 'opening.aboveGlass');
  }
  return opening;
}

/**
 * A design rebuilt from only the fields the engine knows, each one checked.
 * Anything else in the input is dropped.
 */
function readDesign(v: unknown): ConfiguratorState {
  const d = object(v, 'design');

  if (!Array.isArray(d.panels) || d.panels.length < 1 || d.panels.length > MAX_PANELS) {
    fail('panels', `a list of 1 to ${MAX_PANELS} panels`);
  }
  const panels = d.panels.map((p, i) => readPanel(p, `panels[${i}]`));
  if (new Set(panels.map((p) => p.id)).size !== panels.length) {
    fail('panels', 'a list in which every panel has its own id');
  }

  if (!Array.isArray(d.junctions) || d.junctions.length !== panels.length - 1) {
    fail('junctions', 'a list with one junction between each pair of panels');
  }
  const junctions: ConfiguratorJunction[] = d.junctions.map((j, i) => ({
    angle_deg: oneOf(object(j, `junctions[${i}]`).angle_deg, [90, 180] as const, `junctions[${i}].angle_deg`),
  }));

  const design: ConfiguratorState = {
    panels,
    junctions,
    leftWall: bool(d.leftWall, 'leftWall'),
    rightWall: bool(d.rightWall, 'rightWall'),
    heightMm: mm(d.heightMm, 'heightMm', 1),
    isFloorToCeiling: bool(d.isFloorToCeiling, 'isFloorToCeiling'),
    mounting: oneOf(d.mounting, ['channel', 'clamps'] as const, 'mounting'),
    glassThicknessMm: oneOf(d.glassThicknessMm, [6, 8, 10, 12] as const, 'glassThicknessMm'),
    glassType: oneOf(d.glassType, ['clear', 'low-iron', 'satin', 'bronze', 'grey'] as const, 'glassType'),
    glassCoating: oneOf(d.glassCoating, ['none', 'easy-clean'] as const, 'glassCoating'),
    finishId: text(d.finishId, 'finishId'),
    handleId: text(d.handleId, 'handleId'),
    opening: readOpening(d.opening, runWidthsMm(panels, junctions).length),
  };
  if (d.topGapMm !== undefined) design.topGapMm = mm(d.topGapMm, 'topGapMm');
  if (d.aboveDoor !== undefined) {
    design.aboveDoor = oneOfOrNull(d.aboveDoor, ['open', 'glass'] as const, 'aboveDoor');
  }
  if (d.doorHeightMm !== undefined) design.doorHeightMm = mm(d.doorHeightMm, 'doorHeightMm', 1);
  if (d.wallHinge !== undefined) design.wallHinge = oneOf(d.wallHinge, WALL_HINGES, 'wallHinge');
  if (d.inLineHinge !== undefined) design.inLineHinge = oneOf(d.inLineHinge, IN_LINE_HINGES, 'inLineHinge');
  if (d.viennaCutout !== undefined) design.viennaCutout = oneOf(d.viennaCutout, VIENNA_CUTOUTS, 'viennaCutout');
  if (d.bellagioFit !== undefined) design.bellagioFit = oneOf(d.bellagioFit, BELLAGIO_FITS, 'bellagioFit');
  if (d.sliding !== undefined && d.sliding !== null) {
    design.sliding = { system: oneOf(object(d.sliding, 'sliding').system, SLIDING_SYSTEMS, 'sliding.system') };
  }
  return design;
}
