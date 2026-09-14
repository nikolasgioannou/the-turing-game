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
