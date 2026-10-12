/**
 * @vitest-environment jsdom
 */

import type { MouseEvent } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ModalDetailsTrigger from "./ModalDetailsTrigger";

afterEach(cleanup);

describe("ModalDetailsTrigger", () => {
  it("renders button semantics for modal-only entities", () => {
    const onClick = vi.fn();
    render(<ModalDetailsTrigger onClick={onClick}>Ownership Team</ModalDetailsTrigger>);

    const trigger = screen.getByRole("button", { name: "Ownership Team" });
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    expect(trigger.classList.contains("modal-details-trigger")).toBe(true);
    fireEvent.click(trigger);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("preserves real hash links for routable details", () => {
    const onClick = vi.fn((event: MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
    });
    render(
      <ModalDetailsTrigger href="#signal/heartbeat" onClick={onClick}>
        Heartbeat
      </ModalDetailsTrigger>,
    );

    const trigger = screen.getByRole("link", { name: "Heartbeat" });
    expect(trigger.getAttribute("href")).toBe("#signal/heartbeat");
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    fireEvent.click(trigger);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
