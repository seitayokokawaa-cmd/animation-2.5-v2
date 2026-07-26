# assets/fonts

Bundled fonts — the **only** fonts MotionForge ever uses (system fonts are
never loaded; identical text rendering on every machine is part of the
determinism contract, PLAN.md §5.9).

| File                        | Family            | Scripts covered            |
| --------------------------- | ----------------- | -------------------------- |
| NotoSans-Regular.ttf        | Noto Sans         | Latin, Greek, Cyrillic     |
| NotoSansBengali-Regular.ttf | Noto Sans Bengali | Bengali                    |
| NotoNaskhArabic-Regular.ttf | Noto Naskh Arabic | Arabic                     |
| NotoSansSC-Regular.ttf      | Noto Sans SC      | Simplified Chinese (+ CJK) |

## Provenance & license

All fonts are from Google's [Noto](https://notofonts.github.io/) project,
licensed under the **SIL Open Font License 1.1** (see `OFL.txt`). They were
obtained as the 400Regular weights of the npm packages
`@expo-google-fonts/noto-sans` 0.4.2, `@expo-google-fonts/noto-sans-bengali`
0.4.4, `@expo-google-fonts/noto-naskh-arabic` 0.4.5 and
`@expo-google-fonts/noto-sans-sc` 0.4.3 (license: `MIT AND OFL-1.1`; the font
binaries themselves are OFL-1.1, copyright the Noto Project Authors),
fetched 2026-07-26.

Additional weights/scripts are added in task M10.1: drop in one OFL font +
one golden test.
