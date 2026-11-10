# The engine

One package, used in three places: the designer in the browser, the workspace in the browser, and the API on the server. It is pure TypeScript with no dependencies. It reads no clock, makes no request and touches no screen, so the same design and the same rules give the same answer everywhere.

```ts
import { buildSpec, resolveRuleset, upgradeDocument } from '@setout/engine';

const document = upgradeDocument(received);           // checked, and in today's format
const rules = resolveRuleset(company.overrides);      // SetOut's defaults with this company's changes
const spec = buildSpec(document.design, { rules, companyName: company.name });

spec.panels[0].cutWidthMm;   // what to cut
spec.warnings;               // what to look at by hand
spec.blockingIssues;         // what cannot be made as drawn
```

## What is in it

| File | Holds |
| --- | --- |
| `document.ts` | The design document: its format number, upgrading older formats, and checking a document from outside field by field. |
| `ruleset.ts` | The making rules as data, which of them a company may change, and how far. |
| `spec.ts` | The cut list for a design: sizes, deductions, hinges, handle, cutouts, warnings. |
| `rules.ts`, `fabrication.ts` | The calculations the cut list is built from. |
| `measure.ts` | What the customer measured, and the checks on it. |
| `geometry.ts`, `layout.ts` | The shape of the enclosure worked out from its panels, and keeping panel widths in step with a measured run. |
| `cards.ts`, `journey.ts` | The measuring card deck, and the older screen list it is replacing. |
| `templates.ts` | The standard layouts. |
| `selfCheck.ts` | One known design, worked out on the spot, for health checks. |

## Three versions

Every stored cut list can be traced to what produced it. A design revision records all three:

- **The document format** (`DOCUMENT_FORMAT`). Raise it when the shape of a design changes, and add a step to `UPGRADES` in `document.ts` that turns the old shape into the new one. Stored documents are never rewritten. They are upgraded each time they are read.
- **The engine version** (`ENGINE_VERSION`, kept equal to `package.json`). Raise it when the engine would cut any design differently.
- **The company's ruleset version.** A new row in the `rulesets` table each time a company changes a rule.

## Rules are an input

Nothing in the calculations is a constant. Every number is in the `Ruleset` passed in, which has two halves:

- `making` is what a company may adjust: clearances, deductions, default heights and its own size limits. A company's changes are stored as overrides by rule name, such as `{ "deductions.door.outOnlyMm": 6 }`, and `resolveRuleset` refuses anything that is not listed in `ADJUSTABLE` or is outside its bounds.
- `fixed` is what SetOut holds for everyone: hinge ratings, fabrication limits and hardware geometry.

The bounds in `ADJUSTABLE` are provisional. They are to be agreed with a glazier before the company settings screen lets anyone use them. Until then every company is on the defaults.

## Known designs, known cut lists

`test/goldens` holds 33 designs, each with the full spec the Custom Showers configurator's own engine produced for it before that code moved here (commit `73ca0b6` of the Custom Showers website). `test/goldens.test.ts` runs every one on each change.

When the code moved, the original engine and this one were also run side by side over 20,000 generated designs and compared field by field. They matched on every one.

**If a golden fails, the engine now cuts that shower differently.** That is one of two things:

1. A bug. Fix the code.
2. A deliberate change to how something is made. Then, on purpose and in one commit: change the rule, update the golden so the difference is visible in review, raise `ENGINE_VERSION`, and say in the commit message what changed and why.

Never update a golden to make a test pass without knowing why the number moved.

To add a golden, add a JSON file with a `document` and the `expected.spec` that has been checked by hand or against a real job. Real past jobs, with the sizes that were actually ordered and fitted, make the best ones.
