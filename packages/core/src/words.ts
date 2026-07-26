/**
 * Word tokenization shared by the language (phrase anchors) and voice
 * (alignment) packages. Both MUST tokenize identically or phrase→timestamp
 * resolution drifts — which is why this lives in core.
 */

/** Split text into word tokens: whitespace-separated, punctuation-trimmed. */
export function tokenizeWords(text: string): string[] {
  return text
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter((w) => w.length > 0);
}

/** Case-insensitive canonical form used for matching. */
export const canonicalWord = (word: string): string => word.toLowerCase();
