import { placeholder } from '../layout.mjs';

export const home = ({ to, shot }) => `
    <section class="hero">
      <div class="wrap hero-grid">
        <div>
          <p class="eyebrow">Software for frameless shower companies</p>
          <h1>Measured once. Quoted and made from the same design.</h1>
          <p class="lede">Your customer designs and measures their shower on your website. You check it, quote it and make it from that same design. Nothing is typed in twice.</p>
          <p class="actions">
            <a class="button" href="${to('/get-started/')}">Get started</a>
            <a class="link-on" href="${to('/how-it-works/')}">See how it works</a>
          </p>
        </div>
        <div class="hero-shots">
          ${shot('designer-card', 'A measuring card on a phone: a picture of a laser line and a tape measure against the left wall, and one box holding 53mm.', 'One card, one reading.', 'phone')}
          ${shot('designer-measurements', 'The last card on a phone: the opening drawn from the customer’s nine readings, each numbered, with the walls’ lean and the floor’s fall written underneath.', 'The opening, drawn from their numbers.', 'phone')}
        </div>
      </div>
    </section>

    <section class="band">
      <div class="wrap">
        <h2>Three parts, one set of numbers</h2>
        <ul class="cards">
          <li class="card">
            <h3><a href="${to('/how-it-works/#designer')}">The designer</a></h3>
            <p>It sits on your own website, in your colours. Your customer picks a layout, chooses glass and hardware, and follows the measuring cards with a laser or a tape. Then they send it to you.</p>
          </li>
          <li class="card">
            <h3><a href="${to('/how-it-works/#workspace')}">The workspace</a></h3>
            <p>Each design arrives as a job. Your team checks it, changes it if it needs changing, and writes the quote from it. Your customer accepts the quote online.</p>
          </li>
          <li class="card">
            <h3><a href="${to('/how-it-works/#paperwork')}">The paperwork</a></h3>
            <p>A making sheet for the workshop, a glass order for the toughener and an installation sheet for the fitters. All three are printed from the design your team checked.</p>
          </li>
        </ul>
      </div>
    </section>

    <section class="band band-plain">
      <div class="wrap split">
        <div>
          <h2>A wrong number is toughened glass in a skip</h2>
          <p>So SetOut is built around not getting one.</p>
          <ul class="ticks">
            <li><strong>Every size comes from the design.</strong> Drawings, cut sizes, hardware and quotes are all worked out from what was measured. Nobody copies a figure from one place to another.</li>
            <li><strong>Our server works every design out again.</strong> When a design is sent or changed, it is checked and worked out afresh with your rules. What a browser calculated is thrown away.</li>
            <li><strong>Nothing is made unchecked.</strong> A making sheet, a glass order and an installation sheet can only be printed for a design one of your staff has looked over and marked as checked.</li>
            <li><strong>Every change is kept.</strong> An edit is saved as a new revision, with who made it and why. The customer’s original is never overwritten.</li>
          </ul>
        </div>
        ${shot('workspace-job', 'A job in the workspace: the customer, the shower’s size, the measuring notes written out, and a green line saying who checked it and when, with links to the making sheet, glass order and installation sheet.', 'A job, checked and ready to make. The customer here is made up.')}
      </div>
    </section>

    <section class="band">
      <div class="wrap split split-flip">
        ${shot('glass-order', 'A page of a glass order: a door drawn to scale, 760 by 1980mm, with two hinge notches and two handle holes dimensioned from its edges.', 'One pane of a glass order, as the toughener gets it.')}
        <div>
          <h2>Paperwork your toughener and fitters can work from</h2>
          <p>The glass order gives each pane a page, drawn to scale, with every edge dimensioned and every notch and hole measured from the nearer end.</p>
          <p>Where a wall leans or a floor falls, the pane is cut to the shape of the opening, and the installation sheet tells the fitters the gap to leave under each corner.</p>
          <p><a class="link-on" href="${to('/how-it-works/#paperwork')}">What is on each sheet</a></p>
        </div>
      </div>
    </section>

    <section class="band band-plain">
      <div class="wrap narrow">
        <h2>Built in a shower company</h2>
        <p>SetOut was built inside Custom Showers UK, a frameless shower company, for its own customers and its own workshop. Its website runs the SetOut designer: <a href="https://customshowers.uk/design-shower">customshowers.uk/design-shower</a>.</p>
        ${placeholder('custom-showers-line', 'This paragraph names Custom Showers. It needs Matt’s OK before the site goes live.')}
      </div>
    </section>

    <section class="band band-accent">
      <div class="wrap narrow centre">
        <h2>Put the designer on your website</h2>
        <p>Tell us about your company and we will set SetOut up for you.</p>
        <p class="actions"><a class="button button-invert" href="${to('/get-started/')}">Get started</a></p>
      </div>
    </section>
`;
