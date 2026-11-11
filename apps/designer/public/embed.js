/**
 * SetOut designer embed.
 *
 * Put this on any page, with the designer's site key:
 *
 *   <div data-setout-designer="pk_live_..."></div>
 *   <script src="https://SETOUT-ADDRESS/designer/embed.js" async></script>
 *
 * Optional attributes on the element:
 *   data-mode     "inline" (the default) shows the designer in the page.
 *                 "button" shows a button that opens it over the page.
 *   data-label    the button's words, for button mode
 *   data-theme    "light" or "dark"
 *   data-height   starting height in px, before the designer reports its own
 *
 * The designer runs in a frame served by SetOut. This page never sees the
 * customer's details. It is told two things, as events on the element:
 *
 *   setout:sent     a design was sent. event.detail.reference is the job's
 *                   reference, for a thank-you page or a conversion count.
 *   setout:height   the designer's height changed.
 *
 * No dependencies, one guard flag, and safe to include more than once.
 */
(function () {
  'use strict';

  if (window.__setoutDesignerLoaded) return;
  window.__setoutDesignerLoaded = true;

  // The frame always loads from wherever this script came from.
  var script =
    document.currentScript ||
    (function () {
      var scripts = document.getElementsByTagName('script');
      return scripts[scripts.length - 1];
    })();

  var origin;
  var base;
  try {
    var url = new URL(script.src, window.location.href);
    origin = url.origin;
    base = url.href.replace(/embed\.js(\?.*)?$/, '');
  } catch {
    return;
  }

  function announce(el, name, detail) {
    try {
      el.dispatchEvent(new CustomEvent(name, { detail: detail, bubbles: true }));
    } catch {
      // A page old enough not to have CustomEvent simply is not told.
    }
  }

  function makeFrame(el, key, grows) {
    var theme = el.getAttribute('data-theme') || '';
    var frame = document.createElement('iframe');
    frame.src = base + '?key=' + encodeURIComponent(key) + (theme ? '&theme=' + encodeURIComponent(theme) : '');
    frame.title = 'Shower designer';
    frame.style.width = '100%';
    frame.style.border = '0';
    frame.style.display = 'block';
    // Scripts and forms for the designer itself, and its own storage so a
    // half-finished design survives a locked phone. Deliberately no way to
    // navigate this page.
    frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-same-origin allow-popups');
    frame.setAttribute('allow', 'camera');

    window.addEventListener('message', function (event) {
      // Only the frame made here is listened to.
      if (event.origin !== origin) return;
      if (event.source !== frame.contentWindow) return;
      var data = event.data;
      if (!data || typeof data.type !== 'string') return;

      if (data.type === 'setout:height') {
        var height = parseInt(data.height, 10);
        if (!height || height < 200 || height > 20000) return;
        if (grows) frame.style.height = height + 'px';
        announce(el, 'setout:height', { height: height });
        return;
      }

      // The frame grows to fit, so when it moves to a new step it is this
      // page that has to scroll back to the top of it.
      if (data.type === 'setout:scrollToTop') {
        if (!grows) return;
        var top = frame.getBoundingClientRect().top + window.pageYOffset - 24;
        try {
          window.scrollTo({ top: top, behavior: 'smooth' });
        } catch {
          window.scrollTo(0, top);
        }
        return;
      }

      if (data.type === 'setout:sent') {
        announce(el, 'setout:sent', {
          reference: typeof data.reference === 'string' ? data.reference : null,
        });
      }
    });

    return frame;
  }

  function mountInline(el, key) {
    var frame = makeFrame(el, key, true);
    frame.loading = 'lazy';
    frame.style.height = (parseInt(el.getAttribute('data-height'), 10) || 900) + 'px';
    el.appendChild(frame);
  }

  function mountButton(el, key) {
    var button = document.createElement('button');
    button.type = 'button';
    button.textContent = el.getAttribute('data-label') || 'Design your shower';
    button.setAttribute('data-setout-button', '');
    el.appendChild(button);

    var overlay = null;

    function close() {
      if (!overlay) return;
      document.body.removeChild(overlay);
      overlay = null;
      document.documentElement.style.overflow = '';
      button.focus();
    }

    button.addEventListener('click', function () {
      if (overlay) return;
      overlay = document.createElement('div');
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', 'Shower designer');
      overlay.style.cssText =
        'position:fixed;inset:0;z-index:2147483000;background:#fff;display:flex;flex-direction:column;';

      var bar = document.createElement('div');
      bar.style.cssText =
        'display:flex;justify-content:flex-end;padding:8px 12px;border-bottom:1px solid #e5e7eb;flex:none;';
      var shut = document.createElement('button');
      shut.type = 'button';
      shut.textContent = 'Close';
      shut.style.cssText =
        'font:600 14px system-ui,sans-serif;padding:10px 14px;min-height:44px;border:1px solid #cbd5e1;background:#fff;color:#0f172a;cursor:pointer;';
      shut.addEventListener('click', close);
      bar.appendChild(shut);

      // Over the page the frame scrolls itself, inside the space it is given.
      var frame = makeFrame(el, key, false);
      frame.style.flex = '1 1 auto';
      frame.style.height = '100%';

      overlay.appendChild(bar);
      overlay.appendChild(frame);
      overlay.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') close();
      });
      document.body.appendChild(overlay);
      document.documentElement.style.overflow = 'hidden';
      shut.focus();
    });
  }

  function mount(el) {
    if (el.getAttribute('data-setout-mounted')) return;
    var key = el.getAttribute('data-setout-designer');
    if (!key) return;
    el.setAttribute('data-setout-mounted', '1');
    if (el.getAttribute('data-mode') === 'button') mountButton(el, key);
    else mountInline(el, key);
  }

  function mountAll() {
    var nodes = document.querySelectorAll('[data-setout-designer]');
    for (var i = 0; i < nodes.length; i++) mount(nodes[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountAll);
  } else {
    mountAll();
  }
})();
