export const notFound = ({ to }) => `
    <section class="page-head">
      <div class="wrap narrow">
        <p class="eyebrow">Not found</p>
        <h1>This page is not here</h1>
        <p class="lede">The address may be wrong, or the page may have moved.</p>
        <p class="actions">
          <a class="button" href="${to('/')}">Go to the home page</a>
          <a class="link-on" href="${to('/how-it-works/')}">How SetOut works</a>
        </p>
      </div>
    </section>
`;
