export const howItWorks = ({ to, shot }) => `
    <section class="page-head">
      <div class="wrap narrow">
        <p class="eyebrow">How it works</p>
        <h1>From a customer’s bathroom to a fitted shower</h1>
        <p class="lede">SetOut has three parts that share one design: the designer your customer uses, the workspace your team uses, and the paperwork that goes to the toughener and the fitters.</p>
        <ul class="jump">
          <li><a href="#designer">The designer</a></li>
          <li><a href="#workspace">The workspace</a></li>
          <li><a href="#quotes">Quotes</a></li>
          <li><a href="#paperwork">The paperwork</a></li>
          <li><a href="#not">What SetOut is not</a></li>
        </ul>
      </div>
    </section>

    <section class="band" id="designer">
      <div class="wrap">
        <div class="narrow">
          <p class="eyebrow">1. On your website</p>
          <h2>The designer</h2>
          <p>The designer goes on your own website with a short snippet of code, on the page or behind a button. It shows your name and your colours, and offers the finishes, handles, glass and hinges you choose to offer.</p>
        </div>
        ${shot('designer-layouts', 'The designer’s first step: eight layouts to choose from, such as door only, panel and door, walk-in screen and corner, beside a plan and an elevation of the one chosen.', 'Your customer picks the layout closest to their shower. They can change every size afterwards.')}
        <div class="split split-top">
          <div>
            <h3>What your customer does</h3>
            <ol class="steps">
              <li><strong>Picks a layout.</strong> A single door, a panel and door, a walk-in screen, a corner, three sides, over a bath, or a shape of their own.</li>
              <li><strong>Measures, one card at a time.</strong> Each card has one picture and asks for one number. There are cards for a laser level, and screens for a tape and a spirit level.</li>
              <li><strong>Sees it drawn.</strong> The last card draws the opening from their numbers, with every reading marked. Walls that lean and floors that fall are drawn bigger than they are, so they can be seen.</li>
              <li><strong>Arranges the glass and chooses hardware.</strong> Where the door goes, which way it opens, the fixing, the finish and the handle.</li>
              <li><strong>Adds photos and sends it.</strong> You are emailed the whole job with the drawings and photos, and they are sent a copy.</li>
            </ol>
            <h3>Carrying on on a phone</h3>
            <p>Choosing a layout is comfortable at a computer. Measuring is done standing in a bathroom. So the designer gives a link, and a code to point a phone’s camera at, that open the same design on another device.</p>
          </div>
          <div class="pair">
            ${shot('designer-reading', 'A measuring card on a phone: left wall to the laser, with a picture of the tape hooked on the wall and read where the laser crosses it, and 620mm typed in.', 'A reading with a laser level.', 'phone')}
            ${shot('designer-measurements', 'The measurements card on a phone: the opening drawn with all nine readings numbered on it.', 'Every reading, drawn and listed.', 'phone')}
          </div>
        </div>
        <div class="narrow">
          <h3>What it draws today</h3>
          <p>Showers made of flat panels joined in a straight line or at a right angle, hinged doors included. Sliding doors, bi-folds and curved glass are not in SetOut yet.</p>
        </div>
      </div>
    </section>

    <section class="band band-plain" id="workspace">
      <div class="wrap">
        <div class="narrow">
          <p class="eyebrow">2. In your office</p>
          <h2>The workspace</h2>
          <p>Each design arrives as a job. The workspace is where your team reads it, checks it, changes it and moves it on.</p>
        </div>
        <div class="split split-top">
          ${shot('workspace-inbox', 'The job inbox: a search box, the stages New, Reviewing, Quoted, Ordered, Done and Closed with a count on each, and four jobs listed with the customer, the layout, the size and the postcode.', 'The inbox. These customers are made up.')}
          <div>
            <dl class="facts">
              <dt>The inbox</dt>
              <dd>Every job, newest first, by stage or by search: new, reviewing, quoted, ordered, done and closed.</dd>
              <dt>The job page</dt>
              <dd>The customer, the drawings, each pane’s cut size beside what was measured, the hardware and glass, every reading in the order it was taken, the photos and a timeline of what has happened.</dd>
              <dt>Sign-off</dt>
              <dd>A member of staff looks over the drawings, cut sizes and readings and marks the shower as checked. Only a checked shower can be made. If the design changes afterwards, it needs checking again.</dd>
              <dt>Changes</dt>
              <dd>Staff change a shower in the same screens the customer used. Each change is saved as a new revision with a reason, and the drawings and cut sizes follow.</dd>
              <dt>Your team</dt>
              <dd>Owners add and remove people, as owners or staff. Everyone signs in with a link sent to their email. There are no passwords.</dd>
              <dt>Your settings</dt>
              <dd>The finishes and handles you offer, glass in 8, 10 or 12mm, which CRL hinge styles customers can choose, who is emailed when a design arrives, your colours and logo, and your VAT rate.</dd>
            </dl>
          </div>
        </div>
      </div>
    </section>

    <section class="band" id="quotes">
      <div class="wrap">
        <div class="narrow">
          <p class="eyebrow">3. To your customer</p>
          <h2>Quotes</h2>
          <p>A quote is written from the job’s showers as they stand, so it prices the glass and hardware that will actually be made.</p>
        </div>
        <div class="split split-top">
          <div>
            <ul class="ticks">
              <li><strong>Filled in for you.</strong> Each pane by the square metre at its cut size, the hinges and handle on each door, and the channel or clamps, in the finish chosen.</li>
              <li><strong>Your prices, remembered.</strong> Each line starts at the price you last sent for the same thing. You can change any line, and add fitting, delivery or anything else.</li>
              <li><strong>Only for checked showers.</strong> A quote can be sent once every shower on it has been checked, so a customer is never offered something no one has looked over.</li>
              <li><strong>Accepted online.</strong> Your customer is emailed a link of their own. They read the quote, type their name and accept it. The job moves to ordered and you are emailed.</li>
              <li><strong>Fixed once sent.</strong> A sent quote cannot be edited, only withdrawn, so what the customer accepted is what you have on record.</li>
            </ul>
          </div>
          <div class="pair pair-mixed">
            ${shot('workspace-quote', 'A draft quote in the workspace: a line for each pane of glass with its area and a price per square metre, and a line for the door’s hinges.', 'Writing a quote. The prices are made up.')}
            ${shot('customer-quote', 'The quote as the customer sees it on a phone, under the company’s name: each line with its price, then the totals with VAT.', 'What the customer opens.', 'phone')}
          </div>
        </div>
      </div>
    </section>

    <section class="band band-plain" id="paperwork">
      <div class="wrap">
        <div class="narrow">
          <p class="eyebrow">4. To the workshop, the toughener and the fitters</p>
          <h2>The paperwork</h2>
          <p>Three sheets, each printed on A4 from the revision that was checked. None of them can be printed for a shower nobody has checked.</p>
        </div>
        <ul class="sheets">
          <li>
            ${shot('making-sheet', 'A making sheet: the glass and fixing, a cut list with each pane’s cut size beside what was measured and its notches and holes, the door’s hinge centres and handle holes, the notes from measuring, and an elevation and plan.', 'Making sheet')}
            <p>One page per shower for the workshop. Each pane’s cut size beside what was measured, its notches and holes with their heights, the hinge centres and handle holes on each door, the notes from measuring, and who checked it.</p>
          </li>
          <li>
            ${shot('glass-order', 'A glass order page for one door: drawn to scale with its width and height, two hinge notches lettered A and two handle holes lettered B, each dimensioned, and where the toughening stamp goes.', 'Glass order')}
            <p>For the toughener. A first page lists every pane. Then each pane has its own page, drawn to scale, with every edge dimensioned, each cut-out lettered and measured, and where the stamp goes. A last page draws each cut-out template large, with its sizes.</p>
          </li>
          <li>
            ${shot('installation-sheet', 'An installation sheet: the shower seen from outside, how far the opening is out of square, each pane as cut with the gaps to leave around it, and the fittings listed with CRL catalogue numbers.', 'Installation sheet')}
            <p>One page per shower for the fitters. The shower seen from outside, how far the opening is out of square, each pane with the gaps to set it out by, and the fittings with CRL’s catalogue numbers.</p>
          </li>
        </ul>
        <div class="narrow">
          <h3>Cut to the opening</h3>
          <p>Walls lean and floors fall. A pane’s edge against a wall follows the wall, and a fixed pane’s bottom follows the floor. The glass order draws the shape inside its rectangle, and every cut-out stays where it should be on the glass.</p>
          <h3>Hinge cut-outs</h3>
          <p>SetOut knows CRL’s Geneva, Vienna and Bellagio hinges. Where it has CRL’s drawing of a hinge’s cut-out, the glass is cut to it. Where it has not, the glass order says so and tells you to check against the template in the hinge’s box.</p>
        </div>
      </div>
    </section>

    <section class="band" id="not">
      <div class="wrap narrow">
        <h2>What SetOut is not</h2>
        <p>It is not a website builder, a general drawing package, an accounts system or a toughener’s production system. It does its own job and hands off to those.</p>
        <p>It does not take card payments from your customers, and it does not yet let a company sign itself up: we set each company up by hand.</p>
        <p class="actions"><a class="button" href="${to('/get-started/')}">Get started</a> <a class="link-on" href="${to('/pricing/')}">What a subscription includes</a></p>
      </div>
    </section>
`;
