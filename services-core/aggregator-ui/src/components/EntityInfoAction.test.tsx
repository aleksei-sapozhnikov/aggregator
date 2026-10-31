/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import EntityInfoAction from "./EntityInfoAction";

afterEach(cleanup);

describe("EntityInfoAction", () => {
  it("provides an always-visible button for modal-only entities", () => {
    const onClick = vi.fn();
    render(
      <EntityInfoAction label="Details for actor: Owner" onClick={onClick} />,
    );

    const button = screen.getByRole("button", {
      name: "Details for actor: Owner",
    });
    expect(button.textContent).toBe("ⓘ");
    expect(button.getAttribute("aria-haspopup")).toBe("dialog");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("retains signal deep links on the icon without linking its label", () => {
    const onClick = vi.fn();
    render(
      <EntityInfoAction
        label="Details for signal: Heartbeat"
        href="#signal/heartbeat"
        onClick={onClick}
      />,
    );

    const link = screen.getByRole("link", {
      name: "Details for signal: Heartbeat",
    });
    expect(link.getAttribute("href")).toBe("#signal/heartbeat");
    expect(link.textContent).toBe("ⓘ");
    expect(link.getAttribute("aria-haspopup")).toBe("dialog");
    fireEvent.click(link);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
