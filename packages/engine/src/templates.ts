/**
 * Starting shapes.
 *
 * The chain model underneath can express any run of panels, but "add a panel,
 * now make that junction a corner" is how a fabricator thinks, not how someone
 * replacing their shower thinks. They know they have a corner enclosure with a
 * door in it.
 *
 * So a template is nothing more than a preset chain. Picking one drops the
 * customer straight into editing sizes, and every layout control is still
 * there for anyone who needs to go off-piste.
 */

import type { ConfiguratorJunction, ConfiguratorPanel } from './types';

export interface ShowerTemplate {
  id: string;
  name: string;
  /** One line, in the customer's language rather than the workshop's. */
  description: string;
  panels: ConfiguratorPanel[];
  junctions: ConfiguratorJunction[];
  leftWall: boolean;
  rightWall: boolean;
  /** Overrides the default height — bath screens are shorter. */
  heightMm?: number;
}

const door = (id: string, width: number, hinge: 'left' | 'right' = 'right'): ConfiguratorPanel => ({
  id,
  kind: 'door',
  width_mm: width,
  door: { hinge_side: hinge, swing: 'out' },
});

const fixed = (id: string, width: number): ConfiguratorPanel => ({
  id,
  kind: 'fixed',
  width_mm: width,
});

const straight: ConfiguratorJunction = { angle_deg: 180 };
const corner: ConfiguratorJunction = { angle_deg: 90 };

export const TEMPLATES: ShowerTemplate[] = [
  {
    id: 'alcove-door',
    name: 'Door only',
    description: 'A single door between two walls.',
    panels: [door('p1', 700)],
    junctions: [],
    leftWall: true,
    rightWall: true,
  },
  {
    id: 'alcove-panel-door',
    name: 'Panel and door',
    description: 'A fixed panel beside the door, wall to wall.',
    panels: [fixed('p1', 400), door('p2', 700)],
    junctions: [straight],
    leftWall: true,
    rightWall: true,
  },
  {
    id: 'walk-in',
    name: 'Walk-in screen',
    description: 'One fixed panel with an open walk-in gap. No door.',
    panels: [fixed('p1', 900)],
    junctions: [],
    leftWall: true,
    rightWall: false,
  },
  {
    id: 'walk-in-return',
    name: 'Walk-in with return',
    description: 'A walk-in screen with a short panel turned in at the end.',
    panels: [fixed('p1', 900), fixed('p2', 300)],
    junctions: [corner],
    leftWall: true,
    rightWall: false,
  },
  {
    id: 'corner-door-return',
    name: 'Corner, door and side',
    description: 'A door on the front with one side panel returning to the wall.',
    panels: [fixed('p1', 800), door('p2', 700)],
    junctions: [corner],
    leftWall: true,
    rightWall: true,
  },
  {
    id: 'corner-panel-door-return',
    name: 'Corner, wider front',
    description: 'A side panel, then a fixed panel and door across the front.',
    panels: [fixed('p1', 800), fixed('p2', 300), door('p3', 700)],
    junctions: [corner, straight],
    leftWall: true,
    rightWall: true,
  },
  {
    id: 'three-sided',
    name: 'Three sided',
    description: 'Panels down both sides with a door in the middle.',
    panels: [fixed('p1', 600), door('p2', 700), fixed('p3', 600)],
    junctions: [corner, corner],
    leftWall: true,
    rightWall: true,
  },
  {
    id: 'over-bath',
    name: 'Over a bath',
    description: 'A shorter screen at one end of the bath.',
    panels: [fixed('p1', 850)],
    junctions: [],
    leftWall: true,
    rightWall: false,
    heightMm: 1500,
  },
];

export function getTemplate(id: string): ShowerTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
