/**
 * CRL's catalogue number for each thing a shower's fitter takes, with the
 * company's own codes for its finishes and handles, and its standard hinges.
 * The CRL order and the installation sheet both read from here.
 */

import {
  crlFinishCode,
  crlPartOf,
  hingeStylesOf,
  type ConfiguratorSpec,
  type ConfiguratorState,
  type CrlPart,
  type Fitting,
} from '@setout/engine';
import type { JobDetail } from './api';
import { humanise } from './format';
import { fittings, hingeStyle } from './panes';

export interface ShowerPart {
  fitting: Fitting;
  part: CrlPart | null;
  /** What it is, in the fitters' words: "Geneva hinge, wall to glass, offset back plate". */
  what: string;
  /** The shower's finish, for parts made in finishes. */
  finish: string | null;
}

const HUNG: Record<string, string> = {
  'wall-to-glass': 'wall to glass',
  'glass-to-glass-180': 'glass to glass, 180°',
  'glass-to-glass-90': 'glass to glass, 90°',
};

const named = (list: { id: string; label: string }[], id: string) => list.find((o) => o.id === id)?.label ?? humanise(id);

export function showerParts(design: ConfiguratorState, spec: ConfiguratorSpec, labels: JobDetail['labels']): ShowerPart[] {
  const option = labels.finishes.find((o) => o.id === design.finishId);
  const finish = named(labels.finishes, design.finishId);
  const finishCode = crlFinishCode(option ?? { label: finish });
  const hinges = hingeStylesOf(design, labels.hinges);
  return fittings(design, spec).map((fitting) => {
    const handleCode = fitting.kind === 'handle' ? (labels.handles.find((o) => o.id === fitting.handleId)?.code ?? null) : null;
    const part = crlPartOf(fitting, { glassMm: spec.glassThicknessMm, finishCode, handleCode, hinges });
    switch (fitting.kind) {
      case 'hinges': {
        const style = hingeStyle(design, spec, fitting.pane, labels.hinges);
        return { fitting, part, what: `${fitting.brand} hinge, ${HUNG[fitting.mount]}${style ? `, ${style}` : ''}`, finish };
      }
      case 'handle':
        return { fitting, part, what: named(labels.handles, fitting.handleId), finish };
      case 'seal':
        return { fitting, part, what: fitting.seal.charAt(0).toUpperCase() + fitting.seal.slice(1), finish: null };
      case 'bottom-seal':
        return { fitting, part, what: 'Bottom wipe with drip rail', finish: null };
      case 'channel':
        return { fitting, part, what: 'Deep U-channel', finish };
      case 'clamps':
        return { fitting, part, what: 'Glass clamps', finish };
      case 'support-bar':
        return { fitting, part, what: 'Support bar', finish };
      case 'support-panel':
        return { fitting, part, what: 'Support panel', finish: null };
      case 'sliding-kit':
        return { fitting, part, what: 'Serenity sliding door kit', finish };
      case 'sliding-return-kit':
        return { fitting, part, what: 'Serenity 90° return kit', finish };
    }
  });
}

/** The pieces a fitting is cut from stock lengths in, in mm, or null for a part bought by number. */
export function piecesOf(fitting: Fitting, spec: ConfiguratorSpec): number[] | null {
  switch (fitting.kind) {
    case 'seal':
    case 'bottom-seal':
      return [fitting.lengthMm];
    case 'channel': {
      // A length of channel for each run, and what is left (up the notches) as one more piece.
      const runs = spec.wallRuns.map((r) => r.widthMm).filter((w) => w > 0);
      const rest = fitting.lengthMm - runs.reduce((sum, w) => sum + w, 0);
      return runs.length ? [...runs, ...(rest > 0 ? [rest] : [])] : [fitting.lengthMm];
    }
    default:
      return null;
  }
}
