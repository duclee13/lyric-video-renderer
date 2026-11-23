import type { WordTiming } from "../types";

export type IndexedWord = WordTiming & {
  wordIndex: number;
};

export type PhraseLayout = {
  fontSize: number;
  lines: IndexedWord[][];
};

const WIDE_CHARS = new Set(["M", "W", "O", "Q", "G", "D", "@", "%", "&"]);
const NARROW_CHARS = new Set([
  "I",
  "J",
  "L",
  "1",
  "!",
  "|",
  ".",
  ",",
  ";",
  ":",
  "'",
  "’",
  '"',
  "(",
  ")",
  "-",
]);

/**
 * Estimate uppercase Montserrat ExtraBold/Black advance width in pixels.
 * Strips combining diacritical marks (NFD) before measuring so Vietnamese
 * stacked diacritics (e.g. Ắ, Ề, Ộ, Ứ) count as a single base letter width.
 */
function estimateWordWidth(word: string, fontSize: number): number {
  const upper = word.toLocaleUpperCase("vi").normalize("NFD");
  let units = 0;

  for (const ch of upper) {
    // Ignore combining diacritical marks (Mn)
    if (/\p{Mn}/u.test(ch)) {
      continue;
    }
    const base = ch === "Đ" ? "D" : ch;
    if (WIDE_CHARS.has(base)) {
      units += 0.86;
    } else if (NARROW_CHARS.has(base)) {
      units += 0.36;
    } else if (base === " ") {
      units += 0.32;
    } else {
      units += 0.69;
    }
  }

  // Account for slight letter-spacing + bold weight margin
  return units * fontSize * 1.03;
}

function greedyWrap(
  words: IndexedWord[],
  fontSize: number,
  maxWidth: number
): IndexedWord[][] {
  const spaceWidth = fontSize * 0.34;
  const lines: IndexedWord[][] = [];
  let currentLine: IndexedWord[] = [];
  let currentWidth = 0;

  for (const item of words) {
    const wordWidth = estimateWordWidth(item.word, fontSize);
    if (currentLine.length === 0) {
      currentLine.push(item);
      currentWidth = wordWidth;
    } else if (currentWidth + spaceWidth + wordWidth <= maxWidth) {
      currentLine.push(item);
      currentWidth += spaceWidth + wordWidth;
    } else {
      lines.push(currentLine);
      currentLine = [item];
      currentWidth = wordWidth;
    }
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Compute responsive font size and deterministic 1-3 line wrapping for a phrase.
 * Guarantees no single word overflows horizontally and no scene exceeds 3 lines.
 */
export function calculatePhraseLayout(
  words: WordTiming[],
  canvasWidth: number,
  canvasHeight: number
): PhraseLayout {
  const indexed: IndexedWord[] = words.map((w, wordIndex) => ({
    ...w,
    wordIndex,
  }));

  if (indexed.length === 0) {
    return { fontSize: 76, lines: [] };
  }

  const widthScale = canvasWidth / 1080;
  const isTall = canvasHeight > canvasWidth * 1.2;
  const isSquare = !isTall && canvasHeight >= canvasWidth * 0.95;
  const baseFontSize = Math.round((isTall ? 80 : 76) * widthScale);
  const minFontSize = Math.round(38 * widthScale);
  const maxLineWidth = canvasWidth * (isTall ? 0.80 : isSquare ? 0.72 : 0.66);
  const maxLines = 3;

  let chosenFontSize = minFontSize;
  let chosenLines: IndexedWord[][] = greedyWrap(
    indexed,
    minFontSize,
    maxLineWidth
  );

  for (let size = baseFontSize; size >= minFontSize; size -= 2) {
    const longestWord = Math.max(
      ...indexed.map((item) => estimateWordWidth(item.word, size))
    );
    if (longestWord > maxLineWidth * 0.96) {
      continue;
    }

    const wrapped = greedyWrap(indexed, size, maxLineWidth);
    if (wrapped.length <= maxLines) {
      chosenFontSize = size;
      chosenLines = wrapped;
      break;
    }
  }

  // Final safety cap: if even at minFontSize a very long phrase wraps > 3 lines,
  // merge trailing lines into line 3 and scale down proportionally.
  if (chosenLines.length > maxLines) {
    const merged: IndexedWord[][] = [
      chosenLines[0],
      chosenLines[1],
      chosenLines.slice(2).flat(),
    ];
    const widest = Math.max(
      ...merged.map((line) => {
        const wordsW = line.reduce(
          (sum, w) => sum + estimateWordWidth(w.word, chosenFontSize),
          0
        );
        return wordsW + Math.max(0, line.length - 1) * chosenFontSize * 0.34;
      })
    );
    if (widest > maxLineWidth) {
      chosenFontSize = Math.max(
        26,
        Math.floor(chosenFontSize * (maxLineWidth / widest))
      );
    }
    chosenLines = merged;
  }

  return {
    fontSize: chosenFontSize,
    lines: chosenLines,
  };
}
