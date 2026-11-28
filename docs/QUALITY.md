# Quality gates

What is checked automatically, what is checked by hand, and what is not checked yet. The last column is the honest part.

## Automatic, on every push

| Gate | Command | Covers |
| --- | --- | --- |
| Lint | `npm run lint` | Every script parses, all JSON is valid, `index.html` keeps `lang`, `dir`, viewport, title, `main`, labelled `nav`, `alt` on images, no `console.log` in shared code |
| Logic tests | `npm run test:logic` | Sessions, pace, grades, the planner, calendar export, merge |
| Migration tests | `npm run test:migrations` | Numbering, same tables as `schema.sql`, RLS on every table, safe to re-run |
| Automation tests | `npm run test:automations` | Each generated workflow executed against fake Supabase, Moodle and Claude |
| UI smoke tests | `npm run test:ui` | No console errors, one task plus the plan, saved marks, empty semester, no sideways scroll at 375px |
| Types | `npm run typecheck` | `tsc --checkJs` on `js/logic.js` with JSDoc types. TypeScript is fetched on demand and is not a dependency of the app |
| Coverage | `npm run coverage` | Node's built-in coverage over the logic, automation and migration tests, failing below 90% lines and 85% functions. Measured at the time of writing: 94.6% lines, 74.2% branches, 91.8% functions |
| Uptime | `uptime` workflow, every 6 hours | The public demo and the Supabase project, from outside the app ([SLO.md](SLO.md)) |
| Dependency updates | Dependabot, actions pinned by commit hash | Supply chain |

## By hand, before showing the project

Lighthouse 12 on the published demo (`?demo=1`), 28 November 2026, before the font and script changes in this branch. Re-run after the next deploy and replace the numbers.

| Category | Mobile | Desktop |
| --- | --- | --- |
| Performance | 57 | 88 |
| Accessibility | 93 | 93 |
| Best practices | 100 | 100 |
| SEO | 100 | 100 |

Mobile detail: first contentful paint 3.1 s, largest contentful paint 3.3 s, total blocking time 1.75 s, layout shift 0. Lighthouse blamed render-blocking resources (the Google Fonts stylesheet and the scripts) and 5.4 s of main-thread work, mostly style and layout. Its mobile profile throttles the CPU 4x, so real phones will do better, but it is the number to improve.

Fixed in this branch: fonts are self-hosted, all scripts are `defer`red, one low-contrast text colour was darkened, and each view starts with a hidden `h2` so headings no longer jump from `h1` to `h3`.

Still open: GitHub Pages sets its own cache headers and they cannot be changed (the "cache lifetime" finding), and the 44 KB Supabase library loads even in demo mode. Loading it only when cloud is configured is the next performance step.

Still to check by hand:

| Check | How | Result |
| --- | --- | --- |
| Contrast and screen reader names | Install the axe DevTools extension, run on Today and Schedule | not measured |
| Keyboard only | Tab through Today, mark a task done with Enter | not checked |
| Offline | DevTools → Network → Offline, reload the installed app | works (see README) |
| Hebrew RTL on a phone | Open the demo on a real phone | not checked |

## Known weaknesses

- Rendering is by template strings and a full re-render. Fine at one semester, the first thing to change if the UI grows ([ARCHITECTURE.md](ARCHITECTURE.md)).
- Types cover `logic.js` only. `app.js` (the UI, the largest file) is not checked yet.
- Branch coverage is 74%: the error paths and rarely used options are the gap. The UI smoke tests are not part of the coverage number.
