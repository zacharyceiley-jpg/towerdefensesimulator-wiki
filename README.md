# Tower Defense Simulator Wiki

A fresh, GitHub Pages-hosted community wiki frontend backed by a dedicated Supabase project. This repository intentionally does not reuse the previous TDS-WIKI codebase.

## Stack

- Static HTML/CSS/JavaScript on GitHub Pages
- Supabase database and public read API
- Resumable Node.js importer for the MediaWiki API at [tds.wiki](https://tds.wiki/)
- DOMPurify sanitization before imported HTML is displayed

## Current database

Project URL: `https://tztevpmknztxjsfwyhep.supabase.co`

Tables: `wiki_pages`, `wiki_categories`, `wiki_page_categories`, and `wiki_page_revisions`.

The browser uses only the Supabase publishable key. **Never put a service-role key in browser code or commit it to Git.**

## Enable GitHub Pages

In the repository settings, open **Pages** and set the build/deployment source to **GitHub Actions**. The workflow in `.github/workflows/pages.yml` deploys the static site on pushes to `main`. The expected URL is:

`https://zacharyceiley-jpg.github.io/towerdefensesimulator-wiki/`

## Import source articles

The importer reads the main article namespace from the source wiki using the MediaWiki API. It stores the original wikitext, parsed HTML, source URL, source revision ID, timestamp, and categories. It paginates through all article titles, so the import can resume safely after interruption. It leaves locally edited pages untouched on later runs.

1. Install Node.js 20 or newer.
2. Clone this repository and run `npm install`.
3. Copy `.env.example` to `.env`.
4. In Supabase project settings, copy the project URL and **service-role/secret key** into the local `.env`. Never commit `.env`.
5. Run `npm run import:wiki`.

The importer keeps a local `import-state.json` checkpoint and can be re-run. Use a stable internet connection and avoid starting multiple imports at once. The source server may rate-limit requests; the importer uses a modest concurrency and retries temporary failures.

## Attribution and licensing

This is an independent fan project and is not affiliated with Paradoxum Games. Tower Defense Simulator names, logos, images, and other game assets belong to their respective owners.

Imported text and media may have different authors or licensing terms. Each imported page stores its original source URL and revision metadata. Before publishing a full mirror, review the source wiki's current copyright, licensing, and reuse policies at [tds.wiki](https://tds.wiki/) and retain any required author attribution, license notices, and share-alike terms. Do not assume every image or asset is freely reusable just because article text is available.

## Security note

The current database policies allow public reads and authenticated writes. Before inviting community editors, add an explicit editor/administrator role policy rather than relying on “any authenticated user.” Keep the service-role key server-side only.
