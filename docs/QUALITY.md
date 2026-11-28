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
| Dependency updates | Dependabot, actions pinned by commit hash | Supply chain |

## By hand, before showing the project

These need a browser and a minute each. The results are **not recorded yet**: run them once and write the numbers here.

| Check | How | Result |
| --- | --- | --- |
| Performance, accessibility, best practices | Chrome DevTools → Lighthouse, mobile, on the demo URL | not measured |
| Contrast and screen reader names | Install the axe DevTools extension, run on Today and Schedule | not measured |
| Keyboard only | Tab through Today, mark a task done with Enter | not checked |
| Offline | DevTools → Network → Offline, reload the installed app | works (see README) |
| Hebrew RTL on a phone | Open the demo on a real phone | not checked |

## Known weaknesses

- Fonts come from Google Fonts, which costs a request and an IP disclosure. Self-hosting is the fix.
- Rendering is by template strings and a full re-render. Fine at one semester, the first thing to change if the UI grows ([ARCHITECTURE.md](ARCHITECTURE.md)).
- No type checking. The next step, without adding a dependency to the app, is JSDoc types on `logic.js` and `tsc --checkJs` as a development-only tool.
- Test coverage is not measured. Node's built-in `--experimental-test-coverage` can report it once the tests move to `node:test`.
