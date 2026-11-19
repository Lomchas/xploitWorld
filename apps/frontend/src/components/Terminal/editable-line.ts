const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function cursorStep(
  text: string,
  offset: number,
  direction: -1 | 1,
): number {
  const offsets = [...segmenter.segment(text)].map((part) => part.index);
  if (direction === 1)
    return offsets.find((index) => index > offset) ?? text.length;
  return offsets.reverse().find((index) => index < offset) ?? 0;
}

/** Keep editing on a single screen row, even when a pasted command is long. */
export function visibleInput(
  prompt: string,
  text: string,
  caret: number,
  columns: number,
) {
  const width = (value: string): number =>
    Array.from(value).reduce(
      (sum, character) => sum + (character.codePointAt(0)! < 128 ? 1 : 2),
      0,
    );
  const prefix = prompt.slice(
    Math.max(0, prompt.length - Math.max(0, columns - 8)),
  );
  const capacity = Math.max(0, columns - width(prefix) - 3);
  const segments = [...segmenter.segment(text)];
  const split = segments.findIndex((segment) => segment.index >= caret);
  const caretIndex = split === -1 ? segments.length : split;
  const rightWidth = segments
    .slice(caretIndex)
    .reduce((sum, part) => sum + width(part.segment), 0);
  const leftCapacity =
    capacity - Math.min(rightWidth, Math.floor(capacity / 3));
  let start = caretIndex;
  let end = caretIndex;
  let used = 0;
  for (let index = caretIndex - 1; index >= 0; index--) {
    const size = width(segments[index]!.segment);
    if (used + size > leftCapacity) break;
    used += size;
    start = index;
  }
  for (let index = caretIndex; index < segments.length; index++) {
    const size = width(segments[index]!.segment);
    if (used + size > capacity) break;
    used += size;
    end = index + 1;
  }
  const left = prefix + (start > 0 ? "<" : "");
  const before =
    left +
    segments
      .slice(start, caretIndex)
      .map((part) => part.segment)
      .join("");
  const after = segments
    .slice(caretIndex, end)
    .map((part) => part.segment)
    .join("");
  return { line: before + after + (end < segments.length ? ">" : ""), before };
}
