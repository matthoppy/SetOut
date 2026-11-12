/**
 * The get-started form. Its fields, their names and their limits match
 * readSiteEnquiry in apps/api/src/lib/site-enquiry.ts, which is what decides.
 */
const BANDS = [
  ['under-5', 'Fewer than 5'],
  ['5-20', '5 to 20'],
  ['20-50', '20 to 50'],
  ['over-50', 'More than 50'],
  ['unsure', 'Not sure'],
];

export const getStarted = ({ to }) => `
    <section class="page-head">
      <div class="wrap narrow">
        <p class="eyebrow">Get started</p>
        <h1>Tell us about your company</h1>
        <p class="lede">You cannot sign up online yet. We set each company up ourselves, so the first step is to tell us who you are.</p>
      </div>
    </section>

    <section class="band">
      <div class="wrap form-grid">
        <div id="form-area">
          <form id="get-started" class="form" action="/api/site/enquiries" method="post">
            <p class="form-note">Company, name and email are needed. The rest helps us answer you properly.</p>

            <div class="field">
              <label for="company">Company</label>
              <input id="company" name="company" type="text" autocomplete="organization" required minlength="2" maxlength="100">
            </div>
            <div class="field">
              <label for="name">Your name</label>
              <input id="name" name="name" type="text" autocomplete="name" required minlength="2" maxlength="100">
            </div>
            <div class="field">
              <label for="email">Email</label>
              <input id="email" name="email" type="email" autocomplete="email" required maxlength="200" inputmode="email">
            </div>
            <div class="field">
              <label for="phone">Phone <span class="optional">(if you like)</span></label>
              <input id="phone" name="phone" type="tel" autocomplete="tel" maxlength="40">
            </div>
            <div class="field">
              <label for="website">Your website <span class="optional">(if you have one)</span></label>
              <input id="website" name="website" type="text" autocomplete="url" maxlength="200" inputmode="url" autocapitalize="none" spellcheck="false" placeholder="yourcompany.co.uk">
            </div>
            <div class="field">
              <label for="showers">Roughly how many showers do you fit a month? <span class="optional">(if you like)</span></label>
              <select id="showers" name="showers">
                <option value="">Choose one</option>
${BANDS.map(([value, label]) => `                <option value="${value}">${label}</option>`).join('\n')}
              </select>
            </div>
            <div class="field">
              <label for="message">Anything else we should know? <span class="optional">(if you like)</span></label>
              <textarea id="message" name="message" rows="5" maxlength="2000"></textarea>
            </div>

            <!-- No person can see or reach this field. A script that fills it in is ignored. -->
            <div class="hp" aria-hidden="true">
              <label for="company-fax">Leave this empty</label>
              <input id="company-fax" name="company-fax" type="text" tabindex="-1" autocomplete="off">
            </div>

            <div id="bot-check" class="bot-check"></div>

            <p id="form-error" class="form-error" role="alert" tabindex="-1" hidden></p>
            <p class="actions">
              <button id="send" class="button" type="submit">Send</button>
            </p>
            <p class="form-small">We use what you send only to answer you. See <a href="${to('/privacy/')}">privacy</a>.</p>
            <noscript><p class="form-error">This form needs JavaScript switched on in your browser.</p></noscript>
          </form>

          <div id="sent" class="sent" role="status" tabindex="-1" hidden>
            <h2>Thank you. We have your details.</h2>
            <p>We will reply by email to the address you gave. There is nothing else you need to do.</p>
            <p><a class="link-on" href="${to('/how-it-works/')}">See how SetOut works</a></p>
          </div>
        </div>

        <div>
          <h2>What happens next</h2>
          <ol class="steps">
            <li><strong>We reply by email.</strong> We may ask about the showers you make and how you measure and order them now.</li>
            <li><strong>We set your company up.</strong> Your name and colours, the finishes, handles, glass and hinges you offer, and who on your team should have a sign-in.</li>
            <li><strong>You add the designer to your website.</strong> It is a short snippet of code. We tell SetOut which website it is allowed to appear on, so nobody else can use your designer.</li>
            <li><strong>Designs arrive as jobs.</strong> You and your team sign in to the workspace with a link sent to your email.</li>
          </ol>
          <h2>Already using SetOut?</h2>
          <p><a href="https://app.setoutglass.com/">Sign in to the workspace</a>.</p>
        </div>
      </div>
    </section>
`;
