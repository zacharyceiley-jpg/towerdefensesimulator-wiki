# Tower Defense Simulator Wiki

A GitHub Pages community wiki with a Supabase database, wikitext article editor, reusable templates, revision history, and a single verified editor.

## Stack
- Static HTML/CSS/JavaScript on GitHub Pages
- Supabase Auth with GitHub OAuth
- Supabase Postgres with public read access and owner-only write policies
- Wikitext renderer for headings, links, emphasis, lists, and reusable templates

## Database
Project URL: `https://tztevpmknztxjsfwyhep.supabase.co`

Tables: `wiki_pages`, `wiki_categories`, `wiki_page_categories`, `wiki_page_revisions`, and `wiki_templates`.

The browser uses only the Supabase publishable key. Never place a service-role/secret key in browser code or commit it to Git.

## GitHub login setup
GitHub OAuth must be enabled in Supabase before the sign-in button can work:

1. Create a GitHub OAuth App in your GitHub account.
2. Set its **Authorization callback URL** to `https://tztevpmknztxjsfwyhep.supabase.co/auth/v1/callback`.
3. Copy the OAuth App Client ID and Client Secret into **Supabase → Authentication → Providers → GitHub**, then enable the provider.
4. In **Supabase → Authentication → URL Configuration**, add `https://zacharyceiley-jpg.github.io/towerdefensesimulator-wiki/**` to allowed redirect URLs.

The database checks the immutable GitHub account ID for `zacharyceiley-jpg` (`281789543`), not editable profile metadata. Other GitHub accounts remain read-only.

## GitHub Pages
In repository Settings → Pages, select GitHub Actions as the deployment source. Expected URL:
`https://zacharyceiley-jpg.github.io/towerdefensesimulator-wiki/`

## Writing articles
Only the owner sees **New article**, **Edit page**, and **Templates** controls. Wikitext is stored in `content_wikitext` and rendered in the central article area.

Supported syntax:
- `== Heading ==`, `=== Subheading ===`
- `[[Page title]]` or `[[Page title|link text]]`
- `'''bold'''` and `''italic''`
- `* bulleted item` and `# numbered item`
- `{{TemplateName|parameter=value}}`
- Template parameters use `{{{parameter|default}}}`

The renderer treats article content as text and generates safe HTML. It does not execute embedded scripts or arbitrary HTML.

## Attribution
This is an independent fan project and is not affiliated with Paradoxum Games. Tower Defense Simulator names, logos, images, and other game assets belong to their respective owners. Retain source and license attribution for third-party material.
