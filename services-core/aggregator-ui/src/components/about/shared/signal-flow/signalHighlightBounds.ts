/** @file Calculates visible highlight bounds around measured signal rows. */

import type { SceneRect } from "../HelpScene";

const leftGutter = 16;
const rightGutter = 12;

/** Expands measured signal text bounds with a visible gutter for highlighting. */
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
