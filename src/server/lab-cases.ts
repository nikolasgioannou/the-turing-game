// Round two. Previous cases and ratings remain in the database/export.
const practice = [
  ['Teasing', 'what is love', 'Loveis how i feel with ur momma'],
  ['Sincere', 'what is love', 'caring about someone even on bad days'],
  ['Venting', 'how was your day', 'absolute shit lol'],
  ['Challenge', 'why should i believe you', 'ur questions r dumb as hell lol'],
  ['Formal', 'what do you do for work', 'I teach primary school. I really enjoy it.'],
  ['Missing context', 'how was the movie', 'was goood but wayyy too long'],
  ['Casual', 'what did you eat', 'leftover pasta lol'],
  ['Specific', 'whats your hobby', 'i keep buying plants and forgetting to water them'],
];
// Reserved for user evaluation: not used in development probes or prompt tuning.
const check = [
  ['Brief', 'sweet or salty', 'salty'],
  ['Missing context', 'did you like the ending', 'nah it made no sense lol'],
  ['Introduction', 'what should we call you', 'im keira'],
  ['Excited', 'did you get the tickets', 'YESSS FINALLY'],
  ['Venting', 'how was the trip home', 'shit took forever'],
  ['Specific', 'what do you play', 'mostly mario kart'],
  ['Challenge', 'you are definitely the computer', 'says u'],
  ['Formal', 'What do you do on Sundays?', 'I usually visit my parents.'],
];
export const labCases = [
  ...practice.map((c, i) => ({
    id: `v16-practice-${i + 1}`,
    set: 'practice' as const,
    category: c[0]!,
    question: c[1]!,
    human: c[2]!,
  })),
  ...check.map((c, i) => ({
    id: `v16-check-${i + 1}`,
    set: 'check' as const,
    category: c[0]!,
    question: c[1]!,
    human: c[2]!,
  })),
];
