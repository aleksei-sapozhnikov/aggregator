/**
 * @vitest-environment jsdom
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
  it("resets native button decoration while keeping link styling", () => {
    const css = readFileSync(resolve("src", "styles.css"), "utf8");

    expect(css).toMatch(
      /button\\.modal-details-trigger\\s*\\{[^}]*appearance:\\s*none;[^}]*border:\\s*0;[^}]*background:\\s*transparent;[^}]*padding:\\s*0;/s,
    );
    expect(css).not.toContain(".entity-info-action {");
  });
});
