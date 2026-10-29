/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import SecondaryLabel from "./SecondaryLabel";

afterEach(() => {
  cleanup();
});

describe("SecondaryLabel", () => {
  it.each(["Owner", "Primary", "Dependency"])(
    "renders %s as supplementary text",
    (text) => {
      render(<SecondaryLabel text={text} />);

      const label = screen.getByText(text);
      expect(label.tagName).toBe("SPAN");
      expect(label.className).toBe("secondary-label");
    },
  );
});
