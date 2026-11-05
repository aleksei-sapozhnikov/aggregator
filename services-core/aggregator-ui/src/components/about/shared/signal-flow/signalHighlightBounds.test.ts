import { describe, expect, it } from "vitest";
import { getSignalHighlightBounds } from "./signalHighlightBounds";

describe("signal row highlight geometry", () => {
  const row = { x: 160, y: 200, width: 320, height: 40 };

  it("pads horizontally beyond the measured text bounds", () => {
    expect(getSignalHighlightBounds(row)).toEqual({
      x: 144,
      y: 200,
      width: 348,
      height: 40,
    });
  });

  it("keeps neighboring unhealthy rows vertically inset", () => {
    expect(getSignalHighlightBounds(row, 4)).toEqual({
      x: 144,
      y: 204,
      width: 348,
      height: 32,
    });
  });
});
