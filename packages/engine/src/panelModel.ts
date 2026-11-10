/**
 * The fabrication calculations' own view of a panel.
 *
 * The design holds a chain of panels and junctions; the deduction and support
 * checks were written against this flatter shape, one record per panel with
 * its plane and wall fixings worked out. spec.ts bridges from one to the other.
 */

export type PlaneType = 'front' | 'return_left' | 'return_right' | 'back';

export type PanelType = 'fixed' | 'door_hinged';

export type MountingStyle = 'channel' | 'clamps';

export interface PanelWallFix {
  left: boolean;
  right: boolean;
}

export interface PanelNotches {
  bottom_left: boolean;
  bottom_right: boolean;
  width_mm: number | null;
  height_mm: number | null;
}

export interface PanelTopEdge {
  type: 'level' | 'sloped';
  direction: 'left' | 'right' | null;
  drop_mm: number | null;
}

export interface PanelModel {
  panel_id: string;
  panel_type: PanelType;
  plane: PlaneType;
  position_index: number;
  hinge_side: 'left' | 'right' | null;
  handle_side: 'left' | 'right' | null;
  notches: PanelNotches;
  top_edge: PanelTopEdge;
  mounting_style: MountingStyle;
  wall_fix: PanelWallFix;
  door_swing?: 'inward' | 'outward' | 'both' | null;
  width_mm?: number;
  height_mm?: number;
}
