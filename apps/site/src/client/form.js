/**
 * The get-started form.
 *
 * The page is plain HTML. This sends the form to the API as JSON, shows what
 * the API says, and loads Cloudflare's bot check when the site has one. It
 * sets no cookie and stores nothing in the browser.
 */
(() => {
  const form = document.getElementById('get-started');
  if (!(form instanceof HTMLFormElement)) return;

  const error = document.getElementById('form-error');
  const sent = document.getElementById('sent');
  const button = document.getElementById('send');
  const botCheck = document.getElementById('bot-check');
  const openedAt = Date.now();
  let token = null;

  // The API is at the root of whatever address the site is on.
  const API = '/api/site';

  /** Cloudflare's bot check, only when the site has a key for it. Without one the form still sends. */
  async function loadBotCheck() {
    try {
      const response = await fetch(`${API}/config`);
      const { turnstileSiteKey } = await response.json();
      if (!turnstileSiteKey || !botCheck) return;
      window.setoutBotCheck = () => {
        window.turnstile.render(botCheck, {
          sitekey: turnstileSiteKey,
          callback: (value) => {
            token = value;
          },
          'expired-callback': () => {
            token = null;
          },
          'error-callback': () => {
            token = null;
          },
        });
      };
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=setoutBotCheck&render=explicit';
      script.async = true;
      document.head.appendChild(script);
    } catch {
      // No bot check. The enquiry is marked as unchecked on the server.
    }
  }

  function say(message) {
    if (!error) return;
    error.textContent = message;
    error.hidden = false;
    error.focus();
  }

  const value = (name) => {
    const field = form.elements.namedItem(name);
    return field && 'value' in field ? String(field.value) : '';
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (error) error.hidden = true;
    if (button) {
      button.disabled = true;
      button.textContent = 'Sending';
    }
    const again = () => {
      if (!button) return;
      button.disabled = false;
      button.textContent = 'Send';
    };

    try {
      const response = await fetch(`${API}/enquiries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: value('company'),
          name: value('name'),
          email: value('email'),
          phone: value('phone'),
          website: value('website'),
          showers: value('showers'),
          message: value('message'),
          turnstileToken: token,
          antispam: { honeypot: value('company-fax'), elapsedMs: Date.now() - openedAt },
        }),
      });
      if (response.ok) {
        form.hidden = true;
        if (sent) {
          sent.hidden = false;
          sent.focus();
        }
        return;
      }
      const answer = await response.json().catch(() => null);
      say(answer && typeof answer.message === 'string' ? answer.message : 'Something went wrong. Please try again.');
      if (window.turnstile && token) {
        // A token works once.
        token = null;
        window.turnstile.reset();
      }
      again();
    } catch {
      say('That did not send. Check your connection and try again.');
      again();
    }
  });

  loadBotCheck();
})();
