# DZ Agent — ChatGPT Continuation Notes

## Current objective
Make DZ Agent understand and speak natural Algerian Darija, including Arabic-script Darija, Franco-Arabic, mixed French/English technical speech, spelling variants, and regional vocabulary.

## Existing Darija assets
- `data/dz_darija_corpus.json`: large existing corpus with 500+ vocabulary entries, grammar rules, sentence patterns, regional variants, Franco-Arabic and 200+ few-shot examples.
- `lib/darija-prompt.js`: builds the Darija system-prompt block.

## Latest Darija upgrade
Commit: `25dfc2cb1fd4395cdaece0a51c9e4a3be14d277a`

Changes:
- Added relevance-based retrieval from the existing corpus instead of always taking only the first entries.
- Vocabulary injection can now use up to 55 relevant entries (28 compact mode).
- Expressions can now use up to 28 relevant entries (14 compact mode).
- Few-shot examples can now use up to 18 relevant examples (8 compact mode).
- Added Arabic text normalization and simple corpus scoring.
- Added explicit understanding guidance for common variants:
  - واش / وش
  - علاش / عِلاه
  - كيفاش / كفاش
  - وين / فين
  - درك / دروك
  - بزاف / ياسر
  - ماكانش / ما كاش
  - تاع / نتاع / متاع
- Added Franco-Arabic and mixed technical examples such as:
  - wach, 3lach, kifach, rani, ma fhemtch
  - app, wifi, le lien, update, screenshot, login
- Added rules to understand typos, abbreviated chat writing and mixed Arabic/French/English.

## Design principle
Do NOT inject the whole Darija corpus into every prompt. Retrieve the most relevant vocabulary/examples for the current user message to keep context size and latency reasonable.

## Next expansion
Add a second curated extended Darija corpus with several hundred additional native-speaker examples covering:
- regional variants: Alger, Oran, Constantine, Annaba, Batna, Sétif, Biskra, Tlemcen, Béjaïa, Tizi Ouzou, etc.
- Franco-Arabic spellings and numeric forms: 3, 5, 7, 8, 9, 9a, etc.
- everyday conversation, humor, disagreement, clarification, emotions and indirect requests
- Algerian workplace/administrative language
- technical/mobile/AI/GitHub vocabulary in Algerian mixed speech
- common misspellings and phonetic spellings
- more question/answer few-shot pairs

Prefer curated examples over synthetic combinations.

## Important
Keep the existing corpus and retrieval system. Do not replace it or rewrite the project from scratch.
