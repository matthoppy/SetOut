/** How the workspace writes dates, stages, layouts and sizes. */

import { TEMPLATES } from '@setout/engine';
import type { Stage } from './api';

export const STAGE_NAMES: Record<Stage, string> = {
  new: 'New',
  reviewing: 'Reviewing',
  quoted: 'Quoted',
  ordered: 'Ordered',
  done: 'Done',
  closed: 'Closed',
};

/** The layout the customer started from, as the designer names it. */
export function layoutName(id: string | null): string {
  return TEMPLATES.find((t) => t.id === id)?.name ?? 'Their own layout';
}

const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const DAY_YEAR = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const TIME = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

/** "14:32" today, "Yesterday", "9 Nov" this year, "9 Nov 2025" before that. */
export function when(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const days = Math.floor((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days === 0) return TIME.format(date);
  if (days === 1) return 'Yesterday';
  return date.getFullYear() === now.getFullYear() ? DAY.format(date) : DAY_YEAR.format(date);
}

/** "9 Nov 2026, 14:32", for the timeline. */
export function whenExactly(iso: string): string {
  const date = new Date(iso);
  return `${DAY_YEAR.format(date)}, ${TIME.format(date)}`;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export const mm = (value: number | null | undefined) => (value === null || value === undefined ? '' : `${Math.round(value)}mm`);

/** "matte-black" as "Matte black", for an option the company's settings name no better. */
export function humanise(id: string | null | undefined): string {
  if (!id) return '';
  const words = id.replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function bytes(size: number): string {
  if (size < 1024) return `${size} bytes`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)}KB`;
  return `${(size / 1024 / 1024).toFixed(1)}MB`;
}
