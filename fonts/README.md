# Fonts

Self-hosted so the page makes no request to Google (privacy, and one less render-blocking round trip).

| File | Family | Subset | Source |
| --- | --- | --- | --- |
| `rubik-hebrew.woff2` | Rubik (variable, 300-900) | Hebrew | Google Fonts, v31 |
| `rubik-latin.woff2` | Rubik (variable, 300-900) | Latin | Google Fonts, v31 |
| `space-grotesk-latin.woff2` | Space Grotesk (variable, 300-700) | Latin | Google Fonts, v22 |

Both families are licensed under the SIL Open Font License 1.1 (https://openfontlicense.org), which allows bundling and redistribution.

`@font-face` rules are at the top of `css/style.css`. The files are listed in `sw.js` so they work offline. If the glyph set ever grows (Arabic, Cyrillic), add the matching subset file and a rule.
