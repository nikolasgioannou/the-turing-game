export const BUSY_MESSAGE = 'All game slots are full. Please try again shortly.';

export function activeGameLimit(value: string | undefined): number {
  if (value === undefined) return 20;

  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw new Error('MAX_ACTIVE_GAMES must be a positive integer.');

  return Number(value);
}
