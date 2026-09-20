# Link previews

The homepage metadata in `index.html` uses the canonical URL https://theturinggame.ai/ and a static 1200 × 630 PNG at `/social-card.png`. Open Graph and large-image social cards use the same title, description and image. The metadata is in the initial HTML so crawlers do not need JavaScript or a game connection.

Run `bun run social:assets` to regenerate the committed social card, SVG/PNG favicon and Apple touch icon. The exporter uses the shared `IdentityIcon` component, the bundled arcade font and installed Chrome through Playwright. It starts no game server and makes no model calls. Set `PLAYWRIGHT_CHANNEL` to another already-installed supported browser channel if needed; do not download a shared browser automatically.

Review `public/social-card.png` at full size and as a small landscape card after changes. Keep important content away from the edges for modest crops. Social platforms control their own final crop and cache; a square thumbnail cannot preserve all landscape text.

After deployment, check the raw HTML and asset responses at the public URL, including the PNG content type and dimensions. Sharing services may retain an earlier preview until they crawl the page again. This image can also be uploaded manually as the repository social preview in GitHub Settings; page metadata does not change the GitHub repository preview automatically.

Open Graph fields follow the [Open Graph protocol](https://ogp.me/).
