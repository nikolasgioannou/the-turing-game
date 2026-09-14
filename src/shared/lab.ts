export const feedbackTags = [
  'Too polished',
  'Wrong tone',
  'Too long',
  'Copied the human',
  'Missed the joke',
  'Confused speakers',
  'Awkward wording',
] as const;

export type LabChoice = 'a' | 'b' | 'both_bad' | 'both_good';

export type LabPair = {
  batch?: string;
  id: string;
  question: string;
  human: string;
  category: string;
  set: 'practice' | 'check';
  a: string;
  b: string;
};

export type LabState = {
  batch: string;
  practiceTotal: number;
  checkTotal: number;
  previousRated: number;
  pair: LabPair | null;
  rated: number;
  total: number;
  practiceRated: number;
  checkRated: number;
  checkUnlocked: boolean;
};
