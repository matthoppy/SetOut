/**
 * Review step — show exactly what the glazier will receive, then send it.
 *
 * Since there is no pricing, this screen is the product: if the customer can
 * see their own measurements laid out clearly here, the email that lands in
 * the workshop is trustworthy.
 */

import { useEffect, useMemo, useState, useRef } from 'react';
import { ensureTurnstile } from '@/lib/turnstile';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle, Info } from 'lucide-react';
import { buildSpec } from '@setout/engine';
import { finishLabel, handleLabel } from '../config';
import type { CustomerDetails } from '@setout/engine';
import { PhotoUpload } from '../PhotoUpload';
import { useEngine } from '../engine';
import type { StepProps } from './types';

interface ReviewStepProps extends StepProps {
  customer: CustomerDetails;
  setCustomer: (patch: Partial<CustomerDetails>) => void;
  onTurnstileToken: (token: string | null) => void;
  /** Lets the shell stop blocking submission when the challenge cannot load. */
  onChallengeState: (state: 'loading' | 'ready' | 'failed') => void;
  honeypot: string;
  setHoneypot: (value: string) => void;
}

export function ReviewStep({
  config,
  state,
  customer,
  setCustomer,
  photos,
  setPhotos,
  onTurnstileToken,
  onChallengeState,
  honeypot,
  setHoneypot,
}: ReviewStepProps) {
  const engine = useEngine();
  const spec = useMemo(() => buildSpec(state, engine), [state, engine]);
  const [challenge, setChallenge] = useState<'loading' | 'ready' | 'failed'>('loading');
  const challengeRef = useRef<'loading' | 'ready' | 'failed'>('loading');
  const [, setWidgetId] = useState<string | null>(null);
  const [, setHasToken] = useState(false);
  
  // Keep ref in sync with state
  useEffect(() => {
    challengeRef.current = challenge;
  }, [challenge]);
  
  // Debug mode diagnostics (only shown with ?debug=1)
  const [debugInfo, setDebugInfo] = useState({
    scriptTagPresent: false,
    windowTurnstileExists: false,
    onloadFired: false,
    containerInDOM: false,
    widgetId: null as string | null,
    errorCode: null as string | null,
    timeoutFired: false,
    expiredFired: false,
    beforeInteractiveFired: false,
    afterInteractiveFired: false,
    renderAttempts: 0,
    renderError: null as string | null,
    renderSuccess: false,
    successFired: false,
    tokenReceived: false,
  });
  const debugMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1';

  // Manual Turnstile rendering with proper lifecycle management
  useEffect(() => {
    const sitekey = config.turnstileSiteKey;
    if (!sitekey) return;
    
    const container = document.getElementById('turnstile-widget');
    if (!container) return;
    
    let mounted = true;
    let currentWidgetId: string | null = null;
    
    const tryRender = () => {
      if (!mounted || !container || currentWidgetId) return;
      
      try {
        if (typeof window === 'undefined' || !window.turnstile) {
          if (debugMode) {
            setDebugInfo(prev => ({ 
              ...prev, 
              renderError: 'window.turnstile not available',
              renderAttempts: prev.renderAttempts + 1 
            }));
          }
          return;
        }
        
        if (debugMode) {
          setDebugInfo(prev => ({ 
            ...prev, 
            renderAttempts: prev.renderAttempts + 1,
            renderError: null 
          }));
        }
        
        currentWidgetId = window.turnstile.render(container, {
          sitekey,
          appearance: 'interaction-only',
          theme: 'light',
          size: 'normal',
          callback: (token: string) => {
            console.log('Turnstile success, token length:', token?.length);
            if (mounted && token) {
              setHasToken(true);
              setChallenge('ready');
              onTurnstileToken(token);
              if (debugMode) {
                setDebugInfo(prev => ({ 
                  ...prev, 
                  successFired: true,
                  tokenReceived: true 
                }));
              }
            }
          },
          'expired-callback': () => {
            console.log('Turnstile expired');
            if (mounted) {
              setHasToken(false);
              setChallenge('loading');
              onTurnstileToken(null);
              if (debugMode) {
                setDebugInfo(prev => ({ ...prev, expiredFired: true }));
              }
            }
          },
          'error-callback': (error: string) => {
            console.error('Turnstile error:', error);
            if (mounted) {
              setChallenge('failed');
              onTurnstileToken(null);
              if (debugMode) {
                setDebugInfo(prev => ({ ...prev, errorCode: String(error) }));
              }
            }
          },
          'before-interactive-callback': () => {
            console.log('Turnstile before interactive');
            if (debugMode) {
              setDebugInfo(prev => ({ ...prev, beforeInteractiveFired: true }));
            }
          },
          'after-interactive-callback': () => {
            console.log('Turnstile after interactive');
            if (debugMode) {
              setDebugInfo(prev => ({ ...prev, afterInteractiveFired: true }));
            }
          },
        });
        
        setWidgetId(currentWidgetId);
        console.log('Turnstile rendered, widget ID:', currentWidgetId);
        
        // Immediately update debug panel with the returned widget ID
        if (debugMode) {
          setDebugInfo(prev => ({ 
            ...prev, 
            widgetId: currentWidgetId,
            renderSuccess: true 
          }));
        }
      } catch (err) {
        console.error('Turnstile render error:', err);
        if (debugMode) {
          setDebugInfo(prev => ({ 
            ...prev, 
            renderError: err instanceof Error ? err.message : String(err) 
          }));
        }
        if (mounted) {
          setChallenge('failed');
        }
      }
    };
    
    // Try render immediately if turnstile already loaded
    if (window.turnstile) {
      tryRender();
    }
    
    // Also try on script load event
    const script = document.querySelector('script[src*="challenges.cloudflare.com"]');
    if (script) {
      script.addEventListener('load', () => {
        if (debugMode) {
          setDebugInfo(prev => ({ ...prev, onloadFired: true }));
        }
        tryRender();
      });
    }
    
    // Fallback: retry after short delay
    const retryTimer = setTimeout(tryRender, 1500);

    // The script is loaded on demand; render as soon as it is there.
    ensureTurnstile()
      .then(() => {
        if (mounted) tryRender();
      })
      .catch(() => {
        if (mounted) setChallenge('failed');
      });
    
    // Cleanup on unmount
    return () => {
      mounted = false;
      clearTimeout(retryTimer);
      if (currentWidgetId && window.turnstile?.remove) {
        try {
          window.turnstile.remove(currentWidgetId);
          console.log('Turnstile widget removed');
        } catch (err) {
          console.warn('Turnstile remove error:', err);
        }
      }
    };
  }, [config.turnstileSiteKey, onTurnstileToken, debugMode]);
  
  // Update debug info periodically
  useEffect(() => {
    if (!debugMode || !config.turnstileSiteKey) return;
    
    const updateDebug = () => {
      const container = document.getElementById('turnstile-widget');
      setDebugInfo(prev => ({
        ...prev,
        scriptTagPresent: !!document.querySelector('script[src*="challenges.cloudflare.com"]'),
        windowTurnstileExists: typeof window !== 'undefined' && !!window.turnstile,
        containerInDOM: !!container,
      }));
    };
    
    updateDebug();
    const interval = setInterval(updateDebug, 1000);
    return () => clearInterval(interval);
  }, [debugMode, config.turnstileSiteKey]);

  // Timeout fallback if widget never loads
  useEffect(() => {
    if (!config.turnstileSiteKey || challenge !== 'loading') return;
    
    const timer = setTimeout(() => {
      // Use ref to check current state (avoids stale closure)
      if (challengeRef.current === 'loading') {
        console.warn('Turnstile widget timed out after 20 seconds');
        setChallenge('failed');
        if (debugMode) {
          setDebugInfo(prev => ({ ...prev, timeoutFired: true }));
        }
      } else {
        console.log('Timeout fired but challenge already resolved:', challengeRef.current);
      }
    }, 20000);
    
    return () => {
      clearTimeout(timer);
      if (debugMode && challengeRef.current !== 'loading') {
        console.log('Timeout cleared due to challenge state change:', challengeRef.current);
      }
    };
  }, [config.turnstileSiteKey, challenge, debugMode]);

  useEffect(() => {
    onChallengeState(challenge);
  }, [challenge, onChallengeState]);

  return (
    <div className="space-y-6">
      {/* Panel schedule. */}
      <div className="rounded-lg border">
        <div className="border-b bg-muted/40 px-4 py-3">
          <h3 className="text-sm font-semibold">Panel schedule</h3>
          <p className="text-xs text-muted-foreground">
            Cut sizes shown after {state.mounting === 'channel' ? 'channel' : 'clamp'} deductions.
          </p>
        </div>
        <div className="divide-y">
          {spec.panels.map((p) => (
            <div key={p.id} className="px-4 py-3 text-sm">
              <div className="flex items-baseline justify-between gap-4">
                <span className="font-medium">{p.label}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  measured {p.tightWidthMm} × {p.tightHeightMm}
                </span>
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-4">
                <span className="text-muted-foreground">Cut size</span>
                <span className="font-mono font-semibold">
                  {p.cutWidthMm} × {p.cutHeightMm} mm
                </span>
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-4 text-xs text-muted-foreground">
                <span>Weight</span>
                <span className="font-mono">{p.weightKg} kg</span>
              </div>

              {p.door && (
                <div className="mt-2 rounded bg-muted/50 px-3 py-2 text-xs">
                  <div className="flex justify-between">
                    <span>Hinges</span>
                    <span className="font-medium">
                      {p.door.hingeCount} × {p.door.hingeBrand} · {p.door.hingeSide} hand
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Hinge centres</span>
                    <span className="font-mono">
                      {p.door.hingeHeightsMm.join(' / ')}mm from the bottom
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Handle centre</span>
                    <span className="font-mono">{p.door.handlePlacement.handleHeight}mm</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Opens</span>
                    <span>{p.door.swing === 'both' ? 'Both ways' : 'Outwards only'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Seal</span>
                    <span>{p.door.sealType}</span>
                  </div>
                </div>
              )}

              {p.notches.length > 0 && (
                <div className="mt-2 text-xs text-muted-foreground">
                  Notches:{' '}
                  {p.notches
                    .map((n) => `${n.corner.toLowerCase()} ${n.widthMm}×${n.heightMm}mm`)
                    .join(', ')}
                </div>
              )}

              {p.cutouts.length > 0 && (
                <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  <div className="font-medium text-foreground/70">Cutouts</div>
                  {p.cutouts.map((c) => (
                    <div key={`${c.description}-${c.heightMm}`} className="flex justify-between gap-3">
                      <span>{c.description}</span>
                      <span className="shrink-0 font-mono">
                        {c.heightMm}mm · {c.edge}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Run summary. */}
      <dl className="grid overflow-hidden rounded-lg border sm:grid-cols-2">
        {[
          ...(spec.wallRuns.length > 0 
            ? spec.wallRuns.map(wr => [wr.wall, `${wr.widthMm}mm`] as [string, string])
            : [['Overall run', `${spec.totalRunWidthMm}mm`] as [string, string]]
          ),
          ['Corners', `${spec.cornerCount}`],
          ['Height', `${spec.heightMm}mm${spec.isFloorToCeiling ? ' (floor to ceiling)' : ''}`],
          ...(state.mounting === 'channel' ? [['Channel required', `${spec.totalChannelLengthMm}mm`]] : []),
          ['Glass type', state.glassType.charAt(0).toUpperCase() + state.glassType.slice(1).replace('-', ' ')],
          ['Glass thickness', `${spec.glassThicknessMm}mm toughened`],
          ['Coating', state.glassCoating === 'easy-clean' ? 'Easy-clean' : 'None'],
          ['Total weight', `${spec.totalGlassWeightKg}kg`],
          ['Fixing', state.mounting === 'channel' ? 'U-channel' : 'Glass clamps'],
          ['Finish', finishLabel(config, state.finishId)],
          ['Handle', handleLabel(config, state.handleId)],
        ].map(([label, value]) => (
          // Borders on the cells rather than a gap-px grid, so an odd number
          // of entries doesn't leave a bare grey square in the last slot.
          <div key={label} className="border-b border-r px-4 py-3 last:border-b-0">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-sm font-semibold">{value}</dd>
          </div>
        ))}
      </dl>

      {spec.rakeNotes.length > 0 && (
        <div className="flex gap-3 rounded-lg border bg-muted/40 p-4">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="space-y-1 text-sm">
            {spec.rakeNotes.map((n) => (
              <div key={n}>{n}</div>
            ))}
          </div>
        </div>
      )}

      {/* Blocking issues come before warnings and read differently: these are
          not "worth checking", they are "we cannot build this as drawn". */}
      {spec.blockingIssues.length > 0 && (
        <div className="flex gap-3 rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/40">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <div className="space-y-1 text-sm">
            <div className="font-semibold text-red-900 dark:text-red-200">
              This needs changing before we can make it
            </div>
            {spec.blockingIssues.map((w) => (
              <div key={w} className="text-red-800 dark:text-red-300">
                {w}
              </div>
            ))}
            <div className="pt-1 text-red-800/80 dark:text-red-300/80">
              Send it anyway if you like — we will come back with an alternative that works.
            </div>
          </div>
        </div>
      )}

      {spec.warnings.length > 0 && (
        <div className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/40">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="space-y-1 text-sm">
            <div className="font-semibold text-amber-900 dark:text-amber-200">
              Worth checking before we cut
            </div>
            {spec.warnings.map((w) => (
              <div key={w} className="text-amber-800 dark:text-amber-300">
                {w}
              </div>
            ))}
          </div>
        </div>
      )}

      <PhotoUpload photos={photos} onChange={setPhotos} />

      {/* Contact. */}
      <div className="space-y-4 rounded-lg border p-4">
        <h3 className="text-sm font-semibold">Your details</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cust-name">Name</Label>
            <Input
              id="cust-name"
              value={customer.name}
              onChange={(e) => setCustomer({ name: e.target.value })}
              autoComplete="name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cust-email">Email</Label>
            <Input
              id="cust-email"
              type="email"
              value={customer.email}
              onChange={(e) => setCustomer({ email: e.target.value })}
              autoComplete="email"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cust-phone">Phone</Label>
            <Input
              id="cust-phone"
              type="tel"
              value={customer.phone}
              onChange={(e) => setCustomer({ phone: e.target.value })}
              autoComplete="tel"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cust-postcode">Postcode</Label>
            <Input
              id="cust-postcode"
              value={customer.postcode}
              onChange={(e) => setCustomer({ postcode: e.target.value })}
              autoComplete="postal-code"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cust-notes">Anything else we should know?</Label>
            <Textarea
              id="cust-notes"
              value={customer.notes}
              onChange={(e) => setCustomer({ notes: e.target.value })}
              rows={3}
            />
          </div>
        </div>
      </div>

      {/* Who is responsible for the measurements. */}
      <label className="flex cursor-pointer gap-3 rounded-lg border p-4">
        <Checkbox
          checked={customer.measurementsAcknowledged}
          onCheckedChange={(v) => setCustomer({ measurementsAcknowledged: v === true })}
          className="mt-0.5"
        />
        <span className="text-sm text-muted-foreground">{config.measurementDisclaimer}</span>
      </label>

      {/*
        Honeypot. Hidden from sight and from screen readers, and skipped by
        keyboard tabbing, so no real customer can fill it in. Naive form bots
        populate every input they find.
      */}
      <div
        aria-hidden="true"
        // Positioned off-screen rather than display:none, because some bots
        // skip hidden fields but will happily fill one that is merely out of
        // view. Inline styles so this cannot be undone by a stylesheet change.
        style={{ position: 'absolute', left: '-9999px', top: '-9999px', width: 1, height: 1, overflow: 'hidden' }}
      >
        <label htmlFor="company-website">Company website</label>
        <input
          id="company-website"
          name="company-website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </div>

      {config.turnstileSiteKey && (
        <div className="space-y-3">
          {/* Manual Turnstile widget container - rendered via window.turnstile.render() */}
          <div id="turnstile-widget" className="flex justify-center" />

          {challenge === 'failed' && (
            <div className="flex gap-3 rounded-lg border bg-muted/40 p-4">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="text-sm text-muted-foreground">
                The security check couldn't load. You can still send your design.
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Debug diagnostics panel - only shown with ?debug=1 */}
      {debugMode && config.turnstileSiteKey && (
        <div className="rounded-lg border-2 border-purple-500 bg-purple-50 p-4 dark:bg-purple-950/20">
          <h3 className="mb-3 text-sm font-bold text-purple-900 dark:text-purple-100">
            🔧 Turnstile Debug Panel (visible with ?debug=1)
          </h3>
          <div className="space-y-2 text-xs font-mono">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="font-semibold">Hostname:</span> {typeof window !== 'undefined' ? window.location.hostname : 'N/A'}
              </div>
              <div>
                <span className="font-semibold">Sitekey:</span> {config.turnstileSiteKey}
              </div>
            </div>
            
            <div className="mt-3 border-t border-purple-300 pt-2 dark:border-purple-700">
              <div className="mb-1 font-semibold">Script Load State:</div>
              <div className="grid grid-cols-2 gap-1">
                <div className={debugInfo.scriptTagPresent ? 'text-green-600' : 'text-red-600'}>
                  {debugInfo.scriptTagPresent ? '✓' : '✗'} Script tag present
                </div>
                <div className={debugInfo.windowTurnstileExists ? 'text-green-600' : 'text-red-600'}>
                  {debugInfo.windowTurnstileExists ? '✓' : '✗'} window.turnstile
                </div>
                <div className={debugInfo.onloadFired ? 'text-green-600' : 'text-red-600'}>
                  {debugInfo.onloadFired ? '✓' : '✗'} Onload fired
                </div>
              </div>
            </div>
            
            <div className="mt-2 border-t border-purple-300 pt-2 dark:border-purple-700">
              <div className="mb-1 font-semibold">Render State:</div>
              <div className="grid grid-cols-2 gap-1">
                <div className={debugInfo.containerInDOM ? 'text-green-600' : 'text-red-600'}>
                  {debugInfo.containerInDOM ? '✓' : '✗'} Container in DOM
                </div>
                <div className={debugInfo.renderSuccess ? 'text-green-600' : 'text-gray-500'}>
                  {debugInfo.renderSuccess ? '✓' : '○'} Render succeeded
                </div>
                <div className="col-span-2">
                  <span className="font-semibold">Widget ID:</span>{' '}
                  <span className={debugInfo.widgetId ? 'text-green-600' : 'text-gray-500'}>
                    {debugInfo.widgetId || 'none'}
                  </span>
                </div>
                <div>
                  Attempts: {debugInfo.renderAttempts}
                </div>
              </div>
            </div>
            
            <div className="mt-2 border-t border-purple-300 pt-2 dark:border-purple-700">
              <div className="mb-1 font-semibold">Callbacks:</div>
              <div className="grid grid-cols-2 gap-1">
                <div className={debugInfo.successFired ? 'text-green-600 font-semibold' : 'text-gray-500'}>
                  {debugInfo.successFired ? '✓ Success' : '○ Success'}
                </div>
                <div className={debugInfo.tokenReceived ? 'text-green-600 font-semibold' : 'text-gray-500'}>
                  {debugInfo.tokenReceived ? '✓ Token received' : '○ Token received'}
                </div>
                <div className={debugInfo.beforeInteractiveFired ? 'text-green-600' : 'text-gray-500'}>
                  {debugInfo.beforeInteractiveFired ? '✓' : '○'} Before interactive
                </div>
                <div className={debugInfo.afterInteractiveFired ? 'text-green-600' : 'text-gray-500'}>
                  {debugInfo.afterInteractiveFired ? '✓' : '○'} After interactive
                </div>
                <div className={debugInfo.expiredFired ? 'text-yellow-600' : 'text-gray-500'}>
                  {debugInfo.expiredFired ? '⚠' : '○'} Expired
                </div>
                <div className={debugInfo.timeoutFired ? 'text-red-600' : 'text-gray-500'}>
                  {debugInfo.timeoutFired ? '✗' : '○'} Timeout (20s)
                </div>
              </div>
            </div>
            
            {debugInfo.errorCode && (
              <div className="mt-2 rounded border border-red-300 bg-red-50 p-2 text-red-900 dark:bg-red-950/40">
                <span className="font-semibold">Error callback:</span> {debugInfo.errorCode}
              </div>
            )}
            
            {debugInfo.renderError && (
              <div className="mt-2 rounded border border-red-300 bg-red-50 p-2 text-red-900 dark:bg-red-950/40">
                <span className="font-semibold">Render error:</span> {debugInfo.renderError}
              </div>
            )}
            
            <div className="mt-2 border-t border-purple-300 pt-2 dark:border-purple-700">
              <div className="mb-1 font-semibold">Challenge State:</div>
              <div className={
                challenge === 'ready' ? 'text-green-600' :
                challenge === 'failed' ? 'text-red-600' :
                'text-yellow-600'
              }>
                {challenge === 'ready' ? '✓ Ready' :
                 challenge === 'failed' ? '✗ Failed' :
                 '⏳ Loading'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
