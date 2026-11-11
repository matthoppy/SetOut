import type { Photo } from '../photos';
import type { ConfiguratorState } from '@setout/engine';
import type { DesignerConfig } from '../config';

export interface StepProps {
  config: DesignerConfig;
  state: ConfiguratorState;
  update: (patch: Partial<ConfiguratorState>) => void;
  /**
   * Photos live outside ConfiguratorState: they are evidence about the job
   * rather than part of the design, and the Measure and Review steps both
   * add to the same list.
   */
  photos: Photo[];
  setPhotos: (photos: Photo[]) => void;
  /**
   * Which measuring screen is showing, on every device. Owned by the shell
   * because its Back/Next buttons drive it — the Measure step is the only
   * step with more than one screen inside it.
   */
  measureCard?: number;
  /** Jump to a measuring screen: the progress rail and the summary's Change links. */
  setMeasureCard?: (index: number) => void;
  /** The template the customer started from, or null for a shape built by hand. */
  templateId?: string | null;
  activePanelId: string | null;
  setActivePanelId: (id: string | null) => void;
  /** Drawing box the step should render its view into. */
  canvasWidth: number;
  canvasHeight: number;
}

export type StepId = 'shape' | 'measure' | 'sizes' | 'hardware' | 'review';

export const STEPS: { id: StepId; label: string; heading: string; blurb: string }[] = [
  {
    id: 'shape',
    label: 'Shape',
    heading: 'Which one looks like your shower?',
    blurb: 'Pick the closest match. You can change every size and move things around next.',
  },
  {
    id: 'measure',
    label: 'Measure',
    heading: 'Measuring your shower',
    blurb: 'One measurement at a time, with a picture of exactly where to put the tape. We cut the glass to these numbers, so this is the part worth getting right.',
  },
  {
    id: 'sizes',
    label: 'Layout',
    heading: 'How the glass is arranged',
    blurb: 'Split the opening into panels, and say where the door goes.',
  },
  {
    id: 'hardware',
    label: 'Hardware',
    heading: 'Hardware and glass',
    blurb: 'Choose how the glass is fixed and which finish you want.',
  },
  {
    id: 'review',
    label: 'Review',
    heading: 'Check and send',
    blurb: 'Here is what we will receive. Add your details and send it over.',
  },
];
