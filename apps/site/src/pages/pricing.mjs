import { placeholder } from '../layout.mjs';

export const pricing = ({ to }) => `
    <section class="page-head">
      <div class="wrap narrow">
        <p class="eyebrow">Pricing</p>
        <h1>One subscription for your company</h1>
        <p class="lede">SetOut is paid for by subscription. It covers the designer on your website, the workspace for your whole team, and the paperwork.</p>
      </div>
    </section>

    <section class="band">
      <div class="wrap price-grid">
        <div class="price-card">
          <h2>What it costs</h2>
          <p class="price" aria-label="Price to be confirmed">Price to be confirmed</p>
          ${placeholder('prices', 'No price has been decided, so none is shown. Matt to say what SetOut costs, how it is counted, and whether there is a trial or a set-up charge.')}
          <p>Until prices are published here, ask and we will tell you what it would cost for your company.</p>
          <p class="actions"><a class="button" href="${to('/get-started/')}">Ask for a price</a></p>
        </div>
        <div>
          <h2>What a subscription includes</h2>
          <ul class="ticks">
            <li><strong>The designer on your own website</strong>, in your colours, with the finishes, handles, glass thicknesses and hinge styles you choose to offer.</li>
            <li><strong>The workspace for your whole team</strong>: the job inbox, job pages, sign-off, changes kept as revisions, and owners and staff.</li>
            <li><strong>Quotes</strong> written from the showers, emailed to your customer and accepted online.</li>
            <li><strong>The paperwork</strong>: making sheets, glass orders and installation sheets.</li>
            <li><strong>Emails</strong> to you and your customer when a design arrives, with the drawings and photos attached.</li>
            <li><strong>Storage</strong> of your jobs, drawings and photos, kept in the EU.</li>
            <li><strong>Setting up.</strong> We add your company, your options and your team, and give you the snippet of code for your website.</li>
          </ul>
        </div>
      </div>
    </section>

    <section class="band band-plain">
      <div class="wrap narrow">
        <h2>Questions</h2>
        <dl class="facts">
          <dt>Can I sign up and pay online?</dt>
          <dd>Not yet. We set each company up ourselves. <a href="${to('/get-started/')}">Tell us about yours</a> and we will be in touch.</dd>
          <dt>Does my customer pay through SetOut?</dt>
          <dd>No. Your customer accepts your quote online. Taking payment stays with you.</dd>
          <dt>Does my customer see a price in the designer?</dt>
          <dd>No. The designer shows no prices. Your customer sees a price when you send them a quote.</dd>
          <dt>Will it work with the showers we make?</dt>
          <dd>It draws showers made of flat panels joined straight or at a right angle, with hinged doors. Sliding doors, bi-folds and curved glass are not in it yet. <a href="${to('/how-it-works/')}">See how it works</a>.</dd>
        </dl>
      </div>
    </section>
`;
