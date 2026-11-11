/**
 * The configurator.
 *
 * Self-contained: it takes a company's DesignerConfig and renders the whole
 * flow. Nothing in here knows about any one company, so the same component
 * serves every company's embedded designer.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { ensureTurnstile } from '@/lib/turnstile';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight, Check, Loader2, RotateCcw, X } from 'lucide-react';
import { PlanView } from './views/PlanView';
import { ElevationView } from './views/ElevationView';
import { ShapeStep } from './steps/ShapeStep';
import {
  checkMeasurements,
  hydrateOpening,
  keepSetup,
  syncRuns,
} from '@setout/engine';
import { buildCards, hasDeck, openingContext, runPanelIndices, runWidthsMm } from '@setout/engine';
import { MeasureStep } from './steps/MeasureStep';
import { MeasureDeck } from './measure/MeasureDeck';
import { CarryOn } from './CarryOn';
import { DraftError, draftBody, draftKey, draftLink, openDraft, saveDraft, startDraft, type OpenedDraft } from './drafts';
import { buildJourney, canLeaveScreen, measureScreenCount } from '@setout/engine';
import { SizesStep } from './steps/SizesStep';
import { HardwareStep } from './steps/HardwareStep';
import { ReviewStep } from './steps/ReviewStep';
import { STEPS, type StepId, type StepProps } from './steps/types';
import { createInitialState, type ConfiguratorState, type CustomerDetails } from '@setout/engine';
import type { DesignerConfig } from './config';
import { applyTemplate, createDocument, TEMPLATES } from '@setout/engine';
import { slotSortKey, type Photo } from './photos';
import { sendDesign, svgToPngBase64, type EnquiryAttachment } from './submit';
import { canSendReview } from './canSendReview';

const EMPTY_CUSTOMER: CustomerDetails = {
  name: '',
  email: '',
  phone: '',
  postcode: '',
  notes: '',
  measurementsAcknowledged: false,
};

/**
 * Progress, saved in the browser.
 *
 * Someone measuring stands in a bathroom with a phone that locks, a battery
 * that dies and a child that needs something. Ten minutes of readings should
 * survive all three. The design, step and contact details go to localStorage
 * as they change; photos do not (they are large, and their previews are
 * object URLs that die with the page), so a resumed design asks for them
 * again. Cleared when the design is sent or the customer starts again.
 */
const STORAGE_VERSION = 1;

interface SavedDesign {
  v: number;
  savedAt: number;
  templateId: string | null;
  state: ConfiguratorState;
  customer: CustomerDetails;
  stepId: StepId;
  measureCard: number;
  /** The draft on the server this design is saved to, when it is being carried on elsewhere. */
  draftToken?: string;
  /** When the server last saved that draft, as this device knows it. */
  draftSyncedAt?: string;
}

function storageKey(designerId: string) {
  return `setout-designer:${designerId}:v${STORAGE_VERSION}`;
}

function loadSaved(key: string): SavedDesign | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const saved = JSON.parse(raw) as SavedDesign;
    if (saved?.v !== STORAGE_VERSION || !Array.isArray(saved.state?.panels) || !saved.state.panels.length) {
      return null;
    }
    return saved;
  } catch {
    return null;
  }
}

/** A saved design is only worth mentioning if the customer had actually begun. */
function worthResuming(saved: SavedDesign): boolean {
  return (
    saved.stepId !== 'shape' ||
    saved.measureCard > 0 ||
    saved.state.opening?.method !== null ||
    !!saved.customer?.name
  );
}

/** Fill in anything a saved design predates, so last week's design still loads. */
function hydrateState(saved: ConfiguratorState, config: DesignerConfig): ConfiguratorState {
  const fresh = createInitialState(config.glassThicknessMm);
  const state: ConfiguratorState = { ...fresh, ...saved };
  state.opening = hydrateOpening(saved.opening, runWidthsMm(state.panels, state.junctions));
  return state;
}

const hydrate = (saved: SavedDesign, config: DesignerConfig) => hydrateState(saved.state, config);

function describeSavedAt(savedAt: number): string {
  const minutes = Math.round((Date.now() - savedAt) / 60000);
  if (minutes < 2) return 'a moment ago';
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? 'an hour ago' : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

interface ConfiguratorProps {
  config: DesignerConfig;
  /** Rendered inside a frame on a company's page: drops the outer page chrome. */
  embedded?: boolean;
  /**
   * Whether the designer has the whole screen: opened on its own, or in the
   * frame that covers the page. False in a frame that grows with its content.
   */
  fillsViewport?: boolean;
  /** A draft opened from a link, to carry on from where another device left it. */
  resume?: OpenedDraft | null;
}

/**
 * What to start from: the draft a link opened, or what this browser saved.
 * This browser's own copy wins when it is the same draft saved more recently,
 * which is what a phone that lost its signal in a bathroom looks like.
 */
function startingPoint(local: SavedDesign | null, resume: OpenedDraft | null | undefined): SavedDesign | null {
  if (!resume) return local;
  if (local?.draftToken === resume.token && local.savedAt > Date.parse(resume.updatedAt)) return local;
  return {
    v: STORAGE_VERSION,
    savedAt: Date.parse(resume.updatedAt),
    templateId: resume.progress.templateId,
    state: resume.state,
    customer: local?.customer ?? EMPTY_CUSTOMER,
    stepId: resume.progress.stepId,
    measureCard: resume.progress.measureCard,
    draftToken: resume.token,
    draftSyncedAt: resume.updatedAt,
  };
}

export function Configurator({ config, embedded = false, fillsViewport = !embedded, resume = null }: ConfiguratorProps) {
  const saveKey = storageKey(config.id);
  const [saved] = useState(() => startingPoint(loadSaved(saveKey), resume));
  const [stepId, setStepId] = useState<StepId>(saved?.stepId ?? 'shape');
  const [templateId, setTemplateId] = useState<string | null>(saved ? saved.templateId : TEMPLATES[0].id);
  const [state, setState] = useState<ConfiguratorState>(() =>
    saved ? hydrate(saved, config) : applyTemplate(createInitialState(config.glassThicknessMm), TEMPLATES[0])
  );
  const [customer, setCustomerState] = useState<CustomerDetails>(saved?.customer ?? EMPTY_CUSTOMER);
  const [activePanelId, setActivePanelId] = useState<string | null>(state.panels[0]?.id ?? null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [measureCard, setMeasureCard] = useState(saved?.measureCard ?? 0);
  // Whether this start came from a link opened on this device, not from what this browser had saved.
  const startedFromLink = !!resume && saved?.draftToken === resume.token && saved.savedAt === Date.parse(resume.updatedAt);
  const [resumedFrom, setResumedFrom] = useState<number | null>(
    saved && !startedFromLink && worthResuming(saved) ? saved.savedAt : null
  );
  // The draft on the server, when this design is being carried on elsewhere.
  const [draftToken, setDraftToken] = useState<string | null>(saved?.draftToken ?? null);
  /** When the server last saved it as far as this device knows, and what it amounted to. */
  const draftSync = useRef<{ at: string; key: string | null }>({ at: saved?.draftSyncedAt ?? '', key: null });
  const [fromOtherDevice, setFromOtherDevice] = useState(startedFromLink);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [, setChallengeState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [honeypot, setHoneypot] = useState('');
  const didMountRef = useRef(false);
  // How long the customer spent on the design. A real one cannot get through
  // four steps in a couple of seconds; a script can.
  const startedAtRef = useRef<number>(Date.now());

  const drawingRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  /**
   * Start each step at the top.
   *
   * Steps differ a lot in length, so without this you press Next at the bottom
   * of a long step and land halfway down the next one, below its heading.
   *
   * Embedded, the iframe has no scrollbar of its own — it grows to fit and the
   * host page does the scrolling — so there is nothing here to scroll and we
   * ask the parent instead.
   */
  // Start fetching the security check now, so it is ready by the review step.
  useEffect(() => {
    if (config.turnstileSiteKey) ensureTurnstile().catch(() => undefined);
  }, [config.turnstileSiteKey]);

  useEffect(() => {
    // Skip the very first render: scrolling on mount would yank a host page
    // down to the widget as soon as it loads.
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }

    if (embedded) {
      window.parent.postMessage({ type: 'setout:scrollToTop' }, '*');
      return;
    }

    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [stepId, submitted, embedded]);

  /**
   * Every state change goes through here, and anything that reshapes the
   * chain — adding a panel, turning a junction into a corner — changes how
   * many straight runs there are to measure. Keeping the measurements in step
   * centrally means no caller has to remember to; forgetting once would leave
   * a corner shower collecting one set of widths for two walls.
   *
   * Measurements already taken are kept by position rather than discarded.
   */
  const update = (patch: Partial<ConfiguratorState>) =>
    setState((s) => {
      const next = { ...s, ...patch };
      if (!patch.panels && !patch.junctions) return next;
      return { ...next, opening: syncRuns(next.opening, runWidthsMm(next.panels, next.junctions)) };
    });
  const setCustomer = (patch: Partial<CustomerDetails>) =>
    setCustomerState((c) => ({ ...c, ...patch }));

  // Save as they go. Debounced, because every keystroke in a measurement box
  // is a state change; flushed at once when the page is hidden or unloaded,
  // because that is what a phone locking in a bathroom looks like. Skipped
  // once the design has been sent.
  const pendingSave = useRef<SavedDesign | null>(null);
  const writeSave = () => {
    const payload = pendingSave.current;
    if (!payload) return;
    try {
      window.localStorage.setItem(saveKey, JSON.stringify({ ...payload, savedAt: Date.now() }));
    } catch {
      // Storage full or blocked: carry on without saving.
    }
  };
  useEffect(() => {
    if (submitted) {
      pendingSave.current = null;
      return;
    }
    pendingSave.current = {
      v: STORAGE_VERSION,
      savedAt: Date.now(),
      templateId,
      state,
      customer,
      stepId,
      measureCard,
      ...(draftToken ? { draftToken, draftSyncedAt: draftSync.current.at } : {}),
    };
    const timer = setTimeout(writeSave, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveKey, templateId, state, customer, stepId, measureCard, submitted, draftToken]);
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') writeSave();
    };
    window.addEventListener('pagehide', writeSave);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', writeSave);
      document.removeEventListener('visibilitychange', onHide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveKey]);

  // Carried on elsewhere: the same design is kept on the server, so another
  // device can open it and this one can pick up what was done there.
  const progress = { stepId, measureCard, templateId };
  const draftNow = draftKey(state, progress);
  useEffect(() => {
    // Opened from a link, the design is what the server already has, so
    // there is nothing to send until something changes.
    if (startedFromLink && draftSync.current.key === null) draftSync.current.key = draftNow;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pushDraft = () => {
    const token = draftToken;
    if (!token || submitted || draftNow === draftSync.current.key) return;
    const key = draftNow;
    saveDraft(token, draftBody(state, progress))
      .then((stamp) => {
        draftSync.current = { at: stamp.updatedAt, key };
      })
      .catch((error: unknown) => {
        // Gone for good: stop trying. Out of reach: the next change tries again.
        if (error instanceof DraftError && error.kind === 'gone') setDraftToken(null);
      });
  };
  const pullDraft = () => {
    const token = draftToken;
    if (!token || submitted || !config.siteKey) return;
    openDraft(token, config.siteKey)
      .then((found) => {
        // Only something saved since this device last knew of it is news.
        if (found.updatedAt <= draftSync.current.at) return;
        const theirs = hydrateState(found.state, config);
        const incoming = draftKey(theirs, found.progress);
        draftSync.current = { at: found.updatedAt, key: incoming };
        if (incoming === draftNow) return;
        setTemplateId(found.progress.templateId);
        setState(theirs);
        setStepId(found.progress.stepId);
        setMeasureCard(found.progress.measureCard);
        setFromOtherDevice(true);
      })
      .catch((error: unknown) => {
        if (error instanceof DraftError && error.kind === 'gone') setDraftToken(null);
      });
  };
  useEffect(() => {
    if (!draftToken || submitted) return;
    const timer = setTimeout(pushDraft, 1200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftToken, draftNow, submitted]);
  useEffect(() => {
    if (!draftToken) return;
    // Coming back to this device: see whether the other one has moved on.
    const onShow = () => {
      if (document.visibilityState === 'visible') pullDraft();
    };
    window.addEventListener('focus', pullDraft);
    window.addEventListener('online', pushDraft);
    document.addEventListener('visibilitychange', onShow);
    return () => {
      window.removeEventListener('focus', pullDraft);
      window.removeEventListener('online', pushDraft);
      document.removeEventListener('visibilitychange', onShow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftToken, draftNow, submitted]);

  /** Make the link for another device: start a draft from the design as it stands. */
  const startCarryOn = async () => {
    if (!config.siteKey) throw new Error('This is a preview, so there is nothing to carry on.');
    const key = draftNow;
    const started = await startDraft(config.siteKey, draftBody(state, progress));
    draftSync.current = { at: started.updatedAt, key };
    setDraftToken(started.token);
  };

  const stepIndex = STEPS.findIndex((s) => s.id === stepId);
  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;

  // The Measure step is a sequence of screens on every device, one task each.
  // The journey decides how many from the shape and the tool in hand; a
  // change of either can shorten it, so the index is clamped to what exists.
  //
  // Measured with a laser, every layout has the card deck, one reading to a
  // card. Measuring with a tape keeps the older screens until its decks are
  // written.
  const usesDeck = hasDeck(state);
  const deckOptions = useMemo(() => ({ overBath: templateId === 'over-bath' }), [templateId]);
  const cardTotal = usesDeck ? buildCards(state, deckOptions).length : measureScreenCount(state);
  const inMeasureCards = stepId === 'measure' && !usesDeck;
  useEffect(() => {
    if (measureCard > cardTotal - 1) setMeasureCard(cardTotal - 1);
  }, [measureCard, cardTotal]);
  const measureScreen = inMeasureCards ? buildJourney(state)[Math.min(measureCard, cardTotal - 1)] : null;
  const onLastMeasureCard = measureCard >= cardTotal - 1;

  // The drawings follow the customer around the bathroom while they measure.
  const runIndices = runPanelIndices(state.panels, state.junctions);
  const highlightPanelIds: string[] | null = (() => {
    if (!measureScreen) return null;
    if ('runIndex' in measureScreen) return (runIndices[measureScreen.runIndex] ?? []).map((i) => state.panels[i].id);
    if (measureScreen.kind === 'cross') return state.panels.map((p) => p.id);
    return null;
  })();
  const highlightWall: 'left' | 'right' | null = (() => {
    if (!measureScreen) return null;
    if (measureScreen.kind === 'wall') return measureScreen.wall === 'start' ? 'left' : 'right';
    if (measureScreen.kind === 'cross' && measureScreen.group === 'left') return 'left';
    if (measureScreen.kind === 'cross' && measureScreen.group === 'right') return 'right';
    return null;
  })();

  const goNext = () => {
    if (inMeasureCards && !onLastMeasureCard) {
      setMeasureCard(measureCard + 1);
      return;
    }
    setStepId(STEPS[stepIndex + 1].id);
  };

  const goBack = () => {
    if (inMeasureCards && measureCard > 0) {
      setMeasureCard(measureCard - 1);
      return;
    }
    setStepId(STEPS[Math.max(0, stepIndex - 1)].id);
  };

  const canProceed = useMemo(() => {
    switch (stepId) {
      case 'shape':
        return state.panels.length > 0;
      case 'measure':
        // Moving between the measuring screens is free; what is gated is the
        // method (everything after it is written for that tool) and leaving
        // the step. A customer who walks past a contradiction in their own
        // numbers ends up paying for a panel that does not fit, so that one
        // gate is held shut.
        return canLeaveScreen(state, measureCard, checkMeasurements(state.opening, openingContext(state)));
      case 'sizes':
        return (
          state.panels.length > 0 &&
          state.panels.every((p) => p.width_mm > 0) &&
          state.heightMm >= 500 &&
          state.heightMm <= 3000
        );
      case 'hardware':
        return true;
      case 'review':
        return canSendReview({
          name: customer.name,
          email: customer.email,
          measurementsAcknowledged: customer.measurementsAcknowledged,
        });
      default:
        return false;
    }
  }, [stepId, state, customer, measureCard]);

  const stepProps: StepProps = {
    config,
    state,
    update,
    activePanelId,
    setActivePanelId,
    photos,
    setPhotos,
    measureCard,
    setMeasureCard,
    templateId,
    canvasWidth: 620,
    canvasHeight: 520,
  };

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);

    const attachments: EnquiryAttachment[] = [];
    const svgs = drawingRef.current?.querySelectorAll('svg') ?? [];
    const names = ['plan-view.png', 'elevation-view.png'];
    let i = 0;
    for (const svg of Array.from(svgs)) {
      const png = await svgToPngBase64(svg as SVGSVGElement);
      if (png) attachments.push({ filename: names[i] ?? `drawing-${i + 1}.png`, content: png, kind: 'drawing' });
      i++;
    }

    // Measurement photos first and in the order they were asked for, so the
    // workshop reads each one alongside the number it backs up, with loose
    // shots of the room last.
    const ordered = [...photos].sort((a, b) => slotSortKey(a.slot) - slotSortKey(b.slot));
    for (const photo of ordered) {
      attachments.push({ filename: photo.filename, content: photo.content, kind: 'photo' });
    }

    const result = await sendDesign(config, {
      document: createDocument(state),
      templateId,
      customer,
      attachments,
      turnstileToken,
      antispam: { honeypot, elapsedMs: Date.now() - startedAtRef.current },
    });

    setSubmitting(false);
    if (result.ok) {
      setSubmitted(true);
      // Tell the company's page, so it can show its own thank-you or count it.
      window.parent.postMessage({ type: 'setout:sent', reference: result.reference ?? null }, '*');
      try {
        window.localStorage.removeItem(saveKey);
      } catch {
        // Nothing to clear.
      }
    } else {
      setError(
        result.error ??
          'We could not send that. Please try again, or email us and quote your measurements.'
      );
    }
  }

  function reset() {
    try {
      window.localStorage.removeItem(saveKey);
    } catch {
      // Nothing to clear.
    }
    const fresh = applyTemplate(createInitialState(config.glassThicknessMm), TEMPLATES[0]);
    setTemplateId(TEMPLATES[0].id);
    setState(fresh);
    setCustomerState(EMPTY_CUSTOMER);
    setActivePanelId(fresh.panels[0]?.id ?? null);
    setPhotos([]);
    setMeasureCard(0);
    setResumedFrom(null);
    // A new design is not the one being carried on elsewhere.
    setDraftToken(null);
    draftSync.current = { at: '', key: null };
    setFromOtherDevice(false);
    setStepId('shape');
    setSubmitted(false);
    setError(null);
    setTurnstileToken(null);
    setChallengeState('loading');
    setHoneypot('');
    startedAtRef.current = Date.now();
  }

  if (stepId === 'measure' && usesDeck && !submitted) {
    return (
      <MeasureDeck
        state={state}
        setState={setState}
        index={measureCard}
        setIndex={setMeasureCard}
        fillsViewport={fillsViewport}
        options={deckOptions}
        onExit={() => setStepId('shape')}
        onDone={() => {
          setState((s) => ({ ...s, opening: { ...s.opening, shapeConfirmed: true } }));
          setStepId(STEPS[STEPS.findIndex((x) => x.id === 'measure') + 1].id);
        }}
      />
    );
  }

  if (submitted) {
    return (
      <div className={embedded ? 'p-8' : 'mx-auto max-w-2xl px-6 py-24'}>
        <div className="rounded-lg border p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
            <Check className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h2 className="text-2xl font-bold">Design sent</h2>
          <p className="mt-2 text-muted-foreground">
            Thanks {customer.name.split(' ')[0] || 'very much'} — your measurements are with{' '}
            {config.brand.name}. We will be in touch to confirm sizes before anything is cut.
          </p>
          <Button variant="outline" onClick={reset} className="mt-6">
            <RotateCcw className="mr-2 h-4 w-4" />
            Design another
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col bg-background">
      {/* Scroll target for step changes. The margin keeps the heading clear of
          the site's sticky header, which would otherwise sit over it. */}
      <div ref={topRef} className="scroll-mt-24" aria-hidden="true" />

      {/* Progress. */}
      <div className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center gap-1 px-4 py-3 sm:gap-2 sm:px-6 sm:py-4 overflow-x-auto">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => i < stepIndex && setStepId(s.id)}
              disabled={i > stepIndex}
              className="flex items-center gap-1.5 disabled:cursor-default shrink-0 sm:gap-2"
              aria-label={`${s.label}${i === stepIndex ? ' (current step)' : i < stepIndex ? ' (completed)' : ''}`}
            >
              <span
                className={`flex h-6 w-6 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                  i < stepIndex
                    ? 'bg-foreground text-background'
                    : i === stepIndex
                      ? 'bg-foreground text-background ring-2 ring-foreground ring-offset-2'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {i < stepIndex ? <Check className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> : i + 1}
              </span>
              <span
                className={`hidden text-xs sm:text-sm md:inline ${
                  i === stepIndex ? 'font-semibold' : 'text-muted-foreground'
                }`}
              >
                {s.label}
              </span>
              {i < STEPS.length - 1 && <span className="mx-0.5 h-px w-2 bg-border sm:mx-1 sm:w-4 md:w-8" />}
            </button>
          ))}
        </div>
      </div>

      {/* Picked up from last time. */}
      {resumedFrom !== null && (
        <div className="border-b bg-muted/40">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2 text-xs sm:px-6 sm:text-sm">
            <p className="flex-1 text-muted-foreground">
              Picked up where you left off, saved {describeSavedAt(resumedFrom)}. Any photos need adding again.
            </p>
            <button
              type="button"
              className="shrink-0 font-medium underline-offset-2 hover:underline"
              onClick={reset}
            >
              Start again
            </button>
            <button
              type="button"
              className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => setResumedFrom(null)}
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Brought up to date from the other device. */}
      {fromOtherDevice && (
        <div className="border-b bg-muted/40" role="status">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2 text-xs sm:px-6 sm:text-sm">
            <p className="flex-1 text-muted-foreground">Carried on from your other device. Any photos need adding again.</p>
            <button
              type="button"
              className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => setFromOtherDevice(false)}
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Body. */}
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
          <div className="mb-4 sm:mb-6">
            <h2 className="text-xl font-bold sm:text-2xl md:text-3xl">{step.heading}</h2>
            <p className="mt-1 text-sm sm:text-base text-muted-foreground">{step.blurb}</p>
          </div>

          <div
            className={`grid gap-6 lg:gap-8 ${
              stepId === 'measure'
                ? 'lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]'
                : 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]'
            }`}
          >
            <div className="min-w-0">
              {stepId === 'shape' && (
                <ShapeStep
                  {...stepProps}
                  selectedTemplateId={templateId}
                  onSelectTemplate={(t) => {
                    setTemplateId(t.id);
                    setState((s) => applyTemplate(s, t));
                    setActivePanelId(t.panels[0].id);
                  }}
                  onStartFromScratch={() => {
                    setTemplateId(null);
                    const fresh = createInitialState(config.glassThicknessMm);
                    setState((s) => ({
                      ...fresh,
                      finishId: s.finishId,
                      handleId: s.handleId,
                      opening: keepSetup(s.opening, fresh.opening),
                    }));
                    setActivePanelId(fresh.panels[0].id);
                  }}
                />
              )}
              {stepId === 'shape' && config.siteKey && (
                <div className="mt-5">
                  <CarryOn link={draftToken ? draftLink(config.siteKey, draftToken) : null} onStart={startCarryOn} />
                </div>
              )}
              {stepId === 'measure' && <MeasureStep {...stepProps} />}
              {stepId === 'sizes' && <SizesStep {...stepProps} />}
              {stepId === 'hardware' && <HardwareStep {...stepProps} />}
              {stepId === 'review' && (
                <>
                  <ReviewStep
                    {...stepProps}
                    customer={customer}
                    setCustomer={setCustomer}
                    onTurnstileToken={setTurnstileToken}
                    onChallengeState={setChallengeState}
                    honeypot={honeypot}
                    setHoneypot={setHoneypot}
                  />
                  
                  {/* Mobile nav buttons - shown inline on mobile, hidden on desktop */}
                  <div className="mt-6 flex items-center justify-between gap-3 lg:hidden">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={goBack}
                      disabled={(stepIndex === 0 && measureCard === 0) || submitting}
                    >
                      <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                      <span className="text-xs">Back</span>
                    </Button>

                    {error && <p className="flex-1 text-xs text-destructive">{error}</p>}

                    <Button 
                      size="sm"
                      onClick={handleSubmit} 
                      disabled={!canProceed || submitting}
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          <span className="text-xs">Sending</span>
                        </>
                      ) : (
                        <span className="text-xs">Send my design</span>
                      )}
                    </Button>
                  </div>
                </>
              )}
            </div>

            {/* Drawings. Kept mounted on every step so the review step can
                rasterise them without a re-render race on submit.
                On mobile (sizes step), make it sticky and collapsible. */}
            <div className="lg:sticky lg:top-6 lg:self-start min-w-0">
              <div ref={drawingRef} className="space-y-3 sm:space-y-4">
                <figure className="overflow-hidden rounded-lg border bg-card">
                  <figcaption className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:px-4">
                    Plan
                  </figcaption>
                  <div className="flex justify-center overflow-x-auto p-2">
                    <PlanView
                      panels={state.panels}
                      junctions={state.junctions}
                      leftWall={state.leftWall}
                      rightWall={state.rightWall}
                      width={Math.min(560, typeof window !== 'undefined' ? window.innerWidth - 80 : 560)}
                      height={stepId === 'shape' ? 420 : 300}
                      activePanelId={activePanelId}
                      highlightPanelIds={highlightPanelIds}
                      highlightWall={highlightWall}
                      onPanelClick={setActivePanelId}
                      onToggleJunction={(i) => {
                        const junctions = [...state.junctions];
                        junctions[i] = {
                          angle_deg: junctions[i].angle_deg === 90 ? 180 : 90,
                        };
                        update({ junctions });
                      }}
                      accent={config.brand.primary}
                    />
                  </div>
                </figure>

                <figure className="overflow-hidden rounded-lg border bg-card">
                  <figcaption className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:px-4">
                    Elevation
                  </figcaption>
                  <div className="flex justify-center overflow-x-auto p-2">
                    <ElevationView
                      panels={state.panels}
                      junctions={state.junctions}
                      heightMm={state.heightMm}
                      handleId={state.handleId}
                      mounting={state.mounting}
                      finishColor={config.finishes.find(f => f.id === state.finishId)?.swatch ?? '#d4d8db'}
                      width={Math.min(560, typeof window !== 'undefined' ? window.innerWidth - 80 : 560)}
                      height={stepId === 'shape' ? 260 : 380}
                      activePanelId={activePanelId}
                      highlightPanelIds={highlightPanelIds}
                      onPanelClick={setActivePanelId}
                      accent={config.brand.primary}
                    />
                  </div>
                </figure>
              </div>
              <p className="mt-2 text-center text-xs text-muted-foreground sm:mt-3">
                {stepId === 'measure'
                  ? 'The part you are measuring is lit. Drawings are to scale but indicative.'
                  : 'Drawings are to scale but indicative. The cut sizes come from your measurements, on the Review step.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Nav. Hidden on mobile for review step (buttons shown inline instead) */}
      <div className={`sticky bottom-0 border-t bg-background/95 backdrop-blur ${stepId === 'review' ? 'hidden lg:flex' : 'flex'}`}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:gap-4 sm:px-6 sm:py-4">
          <Button
            variant="outline"
            size="sm"
            onClick={goBack}
            disabled={(stepIndex === 0 && measureCard === 0) || submitting}
            className="sm:size-default"
          >
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" />
            <span className="text-xs sm:text-sm">Back</span>
          </Button>

          {error && <p className="flex-1 text-xs text-destructive sm:text-sm">{error}</p>}

          {isLast ? (
            <Button 
              size="sm"
              onClick={handleSubmit} 
              disabled={!canProceed || submitting}
              className="sm:size-default"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin sm:mr-2 sm:h-4 sm:w-4" />
                  <span className="text-xs sm:text-sm">Sending</span>
                </>
              ) : (
                <span className="text-xs sm:text-sm">Send my design</span>
              )}
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={goNext}
              disabled={!canProceed}
              className="sm:size-default"
            >
              <span className="text-xs sm:text-sm">Next</span>
              <ArrowRight className="ml-1.5 h-3.5 w-3.5 sm:ml-2 sm:h-4 sm:w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
