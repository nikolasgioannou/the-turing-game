export function PrivacyNotice() {
  return (
    <details className="mt-5 text-xs leading-6 text-muted">
      <summary className="cursor-pointer py-2 text-caption underline underline-offset-4">
        How your game data is used
      </summary>
      <p className="mt-2">
        The AI receives messages, display names, the human player’s unsent drafts, and basic device
        and local-time hints through OpenRouter and Anthropic. Avoid sharing sensitive personal
        information.
      </p>
      <p className="mt-2">
        We keep the conversation in memory for the game, not in saved chat history. We save the
        game’s ID and outcome for the score. Our retention is separate from the AI services’
        handling of your data.
      </p>
      <p className="mt-2">
        <a
          className="underline underline-offset-4"
          href="https://openrouter.ai/privacy"
          target="_blank"
          rel="noopener noreferrer"
        >
          OpenRouter privacy
        </a>{' '}
        ·{' '}
        <a
          className="underline underline-offset-4"
          href="https://www.anthropic.com/legal/privacy"
          target="_blank"
          rel="noopener noreferrer"
        >
          Anthropic privacy
        </a>
      </p>
    </details>
  );
}
