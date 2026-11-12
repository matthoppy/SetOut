/**
 * The site's pages. Each has a path within the site, a title and description
 * for search engines, and a body.
 *
 * The Worker serves exactly these paths: apps/api/src/site-pages.json lists
 * them, and the build fails if the two differ.
 */
import { getStarted } from './get-started.mjs';
import { home } from './home.mjs';
import { howItWorks } from './how-it-works.mjs';
import { notFound } from './not-found.mjs';
import { pricing } from './pricing.mjs';
import { privacy } from './privacy.mjs';

/** The site's real address. Canonical links and the sitemap use it wherever the site is served. */
export const SITE_URL = 'https://setoutglass.com';
/** Where a company already using SetOut signs in. */
export const WORKSPACE_URL = 'https://app.setoutglass.com/';

export const PAGES = [
  {
    path: '/',
    title: 'SetOut: software for frameless shower companies',
    description:
      'Your customer designs and measures their shower on your website. You check it, quote it and make it from that same design.',
    body: home,
  },
  {
    path: '/how-it-works/',
    title: 'How SetOut works: designer, workspace, quotes and paperwork',
    description:
      'The designer on your website, the workspace your team works in, quotes your customer accepts online, and the sheets for the toughener and the fitters.',
    body: howItWorks,
  },
  {
    path: '/pricing/',
    title: 'SetOut pricing: what a subscription includes',
    description: 'SetOut is a subscription for frameless shower companies. What it includes, and how to ask for a price.',
    body: pricing,
  },
  {
    path: '/get-started/',
    title: 'Get started with SetOut',
    description: 'Tell us about your shower company and we will set SetOut up for you.',
    body: getStarted,
    scripts: ['form.js'],
  },
  {
    path: '/privacy/',
    title: 'Privacy: what SetOut keeps and why',
    description: 'What this site collects, where it is kept, and who is responsible for the designs sent through SetOut.',
    body: privacy,
  },
];

export const NOT_FOUND = {
  path: '/not-found/',
  title: 'Page not found: SetOut',
  description: 'This page is not here.',
  canonical: false,
  body: notFound,
};
