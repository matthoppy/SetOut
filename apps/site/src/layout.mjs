/**
 * What every page has: the head, the header, the footer.
 *
 * Nothing here is styled inline and no script is written into the page: the
 * Worker sends the site with a policy that allows only its own files.
 */
import { SITE_URL, WORKSPACE_URL } from './pages/index.mjs';

const NAV = [
  ['/how-it-works/', 'How it works'],
  ['/pricing/', 'Pricing'],
];

/** The mark: a corner being set out, as a square and a line struck from it. */
const MARK = `<svg class="mark" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
  <path d="M4 4v16h16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square"/>
  <path d="M10 14V4h10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" opacity="0.45"/>
</svg>`;

/**
 * Something only Matt can settle, shown where it will go. Each one is listed
 * by the build and in docs/site-plan.md, and must be gone before the site is
 * put on its real address.
 */
export const placeholder = (name, text) =>
  `<p class="placeholder" data-placeholder="${name}"><strong>To be confirmed.</strong> ${text}</p>`;

export function layout(page, body, { root, asset, to }) {
  const current = (path) => (path === page.path ? ' aria-current="page"' : '');
  const canonical = page.canonical === false ? '' : `\n  <link rel="canonical" href="${SITE_URL}${page.path}">`;
  const scripts = (page.scripts ?? []).map((name) => `\n  <script src="${asset(name)}" defer></script>`).join('');
  return `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${page.title}</title>
  <meta name="description" content="${page.description}">${page.canonical === false ? '\n  <meta name="robots" content="noindex">' : ''}${canonical}
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="SetOut">
  <meta property="og:title" content="${page.title}">
  <meta property="og:description" content="${page.description}">
  <meta name="color-scheme" content="light dark">
  <link rel="icon" href="${root}favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="${asset('site.css')}">${scripts}
</head>
<body>
  <a class="skip" href="#main">Skip to the page</a>
  <header class="top">
    <div class="wrap top-row">
      <a class="brand" href="${to('/')}"${page.path === '/' ? ' aria-current="page"' : ''}>${MARK}<span>SetOut</span></a>
      <nav aria-label="Main">
        <ul class="nav">
${NAV.map(([path, label]) => `          <li><a href="${to(path)}"${current(path)}>${label}</a></li>`).join('\n')}
          <li class="nav-quiet"><a href="${WORKSPACE_URL}">Sign in</a></li>
          <li><a class="button button-small" href="${to('/get-started/')}"${current('/get-started/')}>Get started</a></li>
        </ul>
      </nav>
    </div>
  </header>
  <main id="main">
${body}
  </main>
  <footer class="foot">
    <div class="wrap foot-row">
      <p class="foot-brand">${MARK}<span>SetOut</span></p>
      <p class="foot-line">Software for frameless shower companies.</p>
      <nav aria-label="Footer">
        <ul class="foot-nav">
          <li><a href="${to('/how-it-works/')}">How it works</a></li>
          <li><a href="${to('/pricing/')}">Pricing</a></li>
          <li><a href="${to('/get-started/')}">Get started</a></li>
          <li><a href="${to('/privacy/')}">Privacy</a></li>
          <li><a href="${WORKSPACE_URL}">Sign in to the workspace</a></li>
        </ul>
      </nav>
    </div>
  </footer>
</body>
</html>
`;
}
