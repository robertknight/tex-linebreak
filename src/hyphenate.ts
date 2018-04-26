import Hypher from 'hypher';

export interface Patterns {
  id: string;
  leftmin: number;
  rightmin: number;
  patterns: {
    [key: string]: string;
  };
}

/**
 * Create a hyphenator that uses the given patterns.
 *
 * A wrapper around the `hypher` hyphenation library.
 */
export function createHyphenator(patterns: Patterns) {
  const hypher = new Hypher(patterns);
  return (word: string) => hypher.hyphenate(word);
}
