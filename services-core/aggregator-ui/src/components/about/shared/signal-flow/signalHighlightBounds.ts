import type { SceneRect } from "../HelpScene";

// Measured signal rows start at the text itself, so include a visible gutter
// outside their left and right edges rather than stroking over the first glyph.
const leftGutter = 16;
const rightGutter = 12;

export function getSignalHighlightBounds(
  row: SceneRect,
  verticalInset = 0,
): SceneRect {
  return {
    x: row.x - leftGutter,
    y: row.y + verticalInset,
    width: row.width + leftGutter + rightGutter,
    height: Math.max(0, row.height - verticalInset * 2),
  };
}
