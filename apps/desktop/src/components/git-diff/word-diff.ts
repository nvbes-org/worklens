export interface WordSpan {
  text: string;
  changed: boolean;
}

export function splitWords(text: string): string[] {
  const matches = text.match(/\w+|\s+|[^\w\s]+/g);
  return matches ?? (text ? [text] : []);
}

function computeLCS(tokensA: string[], tokensB: string[]): string[] {
  const m = tokensA.length;
  const n = tokensB.length;
  if (m === 0 || n === 0) return [];

  // Limit matrix size for performance on extremely long minified lines
  if (m * n > 250_000) return [];

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (tokensA[i] === tokensB[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  // Backtrack
  let i = m;
  let j = n;
  const lcs: string[] = [];

  while (i > 0 && j > 0) {
    if (tokensA[i - 1] === tokensB[j - 1]) {
      lcs.unshift(tokensA[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return lcs;
}

export function computeIntraLineDiff(
  oldLine: string,
  newLine: string,
): { oldSpans: WordSpan[]; newSpans: WordSpan[] } {
  // Strip the leading diff symbols ('-' and '+') for intra-line comparison
  const oldText = oldLine.startsWith('-') ? oldLine.slice(1) : oldLine;
  const newText = newLine.startsWith('+') ? newLine.slice(1) : newLine;

  const oldTokens = splitWords(oldText);
  const newTokens = splitWords(newText);
  const common = computeLCS(oldTokens, newTokens);

  let cIdx = 0;
  const oldSpans: WordSpan[] = [];
  for (const token of oldTokens) {
    if (cIdx < common.length && token === common[cIdx]) {
      oldSpans.push({ text: token, changed: false });
      cIdx++;
    } else {
      oldSpans.push({ text: token, changed: true });
    }
  }

  cIdx = 0;
  const newSpans: WordSpan[] = [];
  for (const token of newTokens) {
    if (cIdx < common.length && token === common[cIdx]) {
      newSpans.push({ text: token, changed: false });
      cIdx++;
    } else {
      newSpans.push({ text: token, changed: true });
    }
  }

  return { oldSpans, newSpans };
}
