import { placeholder } from '../layout.mjs';

export const privacy = ({ to }) => `
    <section class="page-head">
      <div class="wrap narrow">
        <p class="eyebrow">Privacy</p>
        <h1>What SetOut keeps, and why</h1>
        <p class="lede">This page covers two things: this website, and the designs that customers send to shower companies through SetOut.</p>
      </div>
    </section>

    <section class="band">
      <div class="wrap narrow prose">
        <h2>Who we are</h2>
        <p>SetOut is run by Custom Showers, a frameless shower company in the UK, which built it for its own customers and its own workshop. For what you send through the get-started form on this website, Custom Showers is the controller: it decides what it is used for, and answers for it.</p>
        ${placeholder('legal-details', 'Custom Showers’ registered company name and number, its registered address, and its ICO registration number if it has one.')}

        <h2>This website</h2>
        <h3>No tracking</h3>
        <p>This site sets no cookies. It has no analytics, no advertising and no tracking of any kind, and it loads no fonts or scripts from other companies, with one exception described below.</p>

        <h3>The get-started form</h3>
        <p>If you fill in the <a href="${to('/get-started/')}">get-started form</a>, we keep what you typed: your company, your name, your email address and, if you gave them, your phone number, your website, roughly how many showers you fit a month and your message. We also keep the time it was sent and whether the bot check passed.</p>
        <p>We use it to answer you and, if you go ahead, to set your company up. We do not use it for anything else, and we do not sell or share it.</p>
        <p>It is stored in our database, which is hosted by Cloudflare and kept in the EU, and it is emailed to us through Resend, the service that sends SetOut’s email.</p>
        ${placeholder('enquiry-retention', 'How long a get-started enquiry is kept before it is deleted. Suggested: two years after the last contact.')}

        <h3>The bot check</h3>
        <p>The get-started page may load Cloudflare Turnstile, which checks that a form is being sent by a person. It is the one thing on this site that comes from another company. It is loaded only on that page, and Cloudflare handles what it collects under its own privacy policy.</p>

        <h3>Hosting</h3>
        <p>The site is served by Cloudflare. Like any web host, Cloudflare processes your IP address in order to send you the pages and to keep the service safe.</p>

        <h2>Designs sent through SetOut</h2>
        <p>When you design and measure a shower on a shower company’s website, the designer you are using is SetOut, and what you send goes to that company.</p>
        <p>That company decides what your details are used for and is responsible for them: in data protection terms it is the controller, and SetOut is its processor. If you want to see, correct or delete what a company holds about you, ask that company.</p>
        <p>For each company, SetOut stores the designs its customers send, their contact details, their photos and drawings, and the quotes and jobs made from them. They are kept in the EU. Each company’s staff can see only their own company’s jobs.</p>
        <p>While you are still working on a design, it is saved in your own browser. If you ask to carry on on another device, the unfinished design is also kept on our server for thirty days after it was last saved. It holds the design and where you had got to, never your name, your contact details or your photos.</p>

        <h2>Asking us about your data</h2>
        <p>You can ask us what we hold about you from this website, and ask us to correct or delete it.</p>
        <p>Email <a href="mailto:sales@customshowers.uk">sales@customshowers.uk</a>.</p>
        <p>If you are not happy with our answer, you can complain to the Information Commissioner’s Office, the UK’s data protection regulator, at <a href="https://ico.org.uk/make-a-complaint/">ico.org.uk</a>.</p>
      </div>
    </section>
`;
