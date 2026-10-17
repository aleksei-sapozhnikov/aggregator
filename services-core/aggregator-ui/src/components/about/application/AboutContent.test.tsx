/**
 * @vitest-environment jsdom
 */

/** @file Verifies About status indicators match the shared health presentation. */

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AboutContent from "./AboutContent";

describe("About health state legend", () => {
  it("uses the same status indicators as the catalog and item title", () => {
    const { container } = render(<AboutContent />);
    const rows = container.querySelectorAll(".about-status-list > li");
    const statuses = ["up", "down", "unknown"];

    expect(rows).toHaveLength(statuses.length);

    statuses.forEach((status, index) => {
      const row = rows[index];
      const indicator = row.querySelector(".status-indicator");
      expect(indicator?.classList.contains(`status-${status}`)).toBe(true);
      expect(indicator?.getAttribute("aria-hidden")).toBe("true");
      expect(row.querySelector("strong")?.textContent).toBe(
        status.toUpperCase(),
      );
    });
    const connection = container.querySelector(".about-connection-help");
    expect(connection?.textContent).toContain("DISCONNECTED");
    expect(connection?.textContent).toContain("Last known");
  });
});
