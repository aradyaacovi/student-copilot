# Contributing

This is a personal project, built for one semester and then generalized. Issues and
pull requests are welcome, especially around the prioritization rules and the
automation safety checks.

## Getting set up

No dependencies and no build step. Node 20 or newer, then:

```bash
npm start
```

That serves the app on `http://localhost:5180`. Open `?demo=1` for the bundled demo
data, or copy `data/sample-semester.js` to `data/my-semester.js` (renaming
`SAMPLE_DATA` to `SEMESTER_DATA`) to use your own semester.

## Before opening a pull request

```bash
npm test
```

All 75 tests must pass (the UI smoke tests need Chrome or Edge, or `CHROME_PATH`). They run in CI on every push and pull request.

If you change anything under `automations/lib/`, regenerate the n8n workflow files
so the committed JSON matches the source:

```bash
npm run build:automations
```

## Ground rules

- **`js/logic.js` stays pure.** No DOM, no I/O, no globals. It is the one module
  shared by the browser and the n8n Code nodes, and the tests depend on that.
- **Never commit secrets or personal data.** `js/config.js`, `automations/.env` and
  `data/my-semester.js` are git-ignored on purpose. Use the `.example` files to
  document new settings.
- **Email content is data, never instructions.** The email workflow may only act on
  a change it can resolve against the real timetable; anything uncertain is queued
  for the student to approve.
- Keep the Hebrew RTL interface working. The user-facing strings are in Hebrew.
