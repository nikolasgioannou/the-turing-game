# UI review gallery

Run `bun run review`, then open http://localhost:5174/review. This starts only Vite; the game server, database and OpenRouter key are unnecessary. The development-only entry renders the real app components with named sample states. It is excluded from the production bundle.

Use the sidebar search, Previous/Next, Desktop/Mobile and Reset state controls. Copy state link shares the selected state with someone running their own local checkout. Frames retain their 1280×900 or 390×844 viewport and scale to fit the available panel. Only the app inside the frame scrolls; the preview panel itself does not. Match timers stay frozen. Dialogs and local controls are interactive, but server actions intentionally do not advance the sample. Use another preset to see the resulting state.

The 42 presets cover loading, scores, offline and AI-capacity states, rules, role choices, queues, invitations, name entry, opening phases, live chat, low time, character limits, guessing, player waiting, results, interrupted games and rematch states. Add presets in `src/client/review/states.ts` as new UI states are introduced.

## Screenshot export

Run `bun run review:capture`. It starts its own temporary Vite server on port 5175, uses the installed Chrome (or Playwright browser), verifies gallery navigation, and captures every preset at both sizes. It makes no game API requests or model calls. The browser and temporary server close automatically afterward.

Open `work/ui-review/index.html` for the contact sheet, or use the named PNG files, such as `verdict-human-mobile.png`. Click any image to view its full size. The output folder is ignored by Git. Capture uses reduced motion and waits for fonts for repeatable images; the interactive gallery retains animations.

These are UI samples, not end-to-end gameplay tests or screenshots of production data. A mobile viewport does not simulate a real phone's software keyboard.
