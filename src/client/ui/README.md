# UI components

Project-owned React components built with Tailwind v4. Import from `./ui` in client modules. Native attributes, event handlers, accessibility attributes and React 19 refs are forwarded. Components contain presentation; routes own game state and server calls.

| Component | Purpose | Variants |
| --- | --- | --- |
| `Button` | Actions; defaults to `type="button"` | `primary`, `secondary`, `ghost`, `arcade`; explicit size |
| `SegmentButton` | Game mode toggle | Selection via `aria-pressed` |
| `ChoiceButton` | Verdict choices | `tone="a"` or `"b"`, `compact`; `aria-pressed` |
| `RoleButton` | Role picker | `tone` (`a`, `b`, `neutral`), `title`, description children |
| `Input`, `Textarea` | Shared border, surface and focus treatment | Native field attributes; layout via `className` |
| `Panel` | Content surface | `tone="accent"` or `"neutral"` |
| `Dialog` | Native modal, Escape/backdrop close and focus restoration | Required `label`, `onClose` |
| `AppShell`, `RoomTitle` | Responsive game layout | Room state via the ancestor `group/room` |

`ChatMessageItem` in `../chat-message.tsx` is the shared domain component for live and revealed messages.

## Usage

```tsx
import { Button, ChoiceButton, Dialog, Textarea } from './ui';

<Dialog label="Leave a note" onClose={close}>
  <h2>Leave a note</h2>
  <form onSubmit={save}>
    <label htmlFor="note">Your note</label>
    <Textarea id="note" className="block w-full p-3" rows={3} />
    <Button type="submit">Save</Button>
    <Button variant="secondary" onClick={close}>
      Cancel
    </Button>
  </form>
</Dialog>;

<ChoiceButton tone="b" aria-pressed={selected} onClick={select}>
  Contestant B
</ChoiceButton>;
```

Use explicit submit buttons inside forms. Supply visible field labels or `aria-label`. Selection state belongs in `aria-pressed`, not an independent styling flag. Use a link for navigation and a button for actions. Keep style variants as static class strings so Tailwind detects them.

Use `className` for surrounding layout. Add a named component variant when changing its appearance or sizing; do not pile conflicting utilities onto a component. Add new shared styling here instead of route-specific CSS overrides. Theme tokens, font loading, global defaults, reduced-motion rules and the custom arcade title/cabinet effects live in `../styles.css`.

Run `bun run format` and `bun run format:check`. The workspace VS Code configuration associates CSS with the Tailwind language mode; accept the recommended Tailwind CSS IntelliSense extension if it is not installed. No global editor settings are changed.

`Slider` is a native range input with a square cyan thumb, inset track, keyboard focus and disabled states. Supply a label or `aria-label`, native `min`/`max`/`step`, and layout width via `className`. It accepts controlled or uncontrolled values and forwards refs. Music uses it for volume.

`MatchToolbar` keeps the countdown centered between optional identity and action slots. `IdentityIcon` provides pixel human/bot icons for revealed results; live contestants retain anonymous A/B badges. `MatchResult` in `../match-result.tsx` presents the participant’s win or loss and the judge’s selection.

`Select` is a controlled custom dropdown with themed options and a chevron. Supply `value`, `options` (value/label pairs with optional disabled states), `onValueChange`, and an `aria-label`. It supports arrow keys, Home/End, typeahead, Enter/Space, Escape, and outside-click dismissal. Its popup uses the browser top layer to avoid clipping inside scroll panels.

`Banner` provides the shared warning surface for connection errors, provider availability and rematch notices. Supply `role="alert"` for errors or `role="status"` for informational updates. It forwards native div attributes and refs.

`RoleButton` pairs its text with a pixel identity icon: human for tone `a`, judge for `b`, and a split orange-human/cyan-judge portrait for `neutral`. These icons appear in public, friend and replay role pickers. `IdentityIcon` also supports `judge` and `either` for reuse; decorative icons stay hidden from screen readers.

Use `IdentityIcon` for every standalone human, bot, judge or either-role portrait; do not add separate SVG paths or emoji at call sites. The robot has a rectangular head, antenna, side terminals and grille mouth. Judge chat messages use the same judge portrait as role selection. Anonymous live contestants retain A/B badges until identity reveal.

Human and judge share the same human silhouette; the surrounding role color distinguishes them. Either role uses that silhouette split orange/cyan. Only the bot has a different portrait.
