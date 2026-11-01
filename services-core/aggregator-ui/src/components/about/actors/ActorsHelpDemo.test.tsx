/**
 * @vitest-environment jsdom
 */

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ActorsHelpDemo, { actorsHelpDuration, getActorsHelpFrame } from "./ActorsHelpDemo";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Actors contextual help animation", () => {
  it("blocks pointer interactions with the decorative animation, not its progress bar", () => {
    render(<ActorsHelpDemo />);
    const figure = screen.getByRole("figure", { name: "Actors become Item ownership and relationship entries" });
    const shield = figure.querySelector(".help-interaction-shield");
    expect(shield).not.toBeNull();
    expect(shield?.getAttribute("aria-hidden")).toBe("true");
    expect(figure.lastElementChild).toBe(shield);
    expect(shield?.previousElementSibling?.classList.contains("help-scene")).toBe(true);
    expect(figure.querySelector(".help-animation-progress")).not.toBeNull();
  });

  it("maps three distinct people to Owner, User and Support rows", () => {
    const besideRows = getActorsHelpFrame(4600);
    expect(besideRows.travel).toBe(1);
    expect(besideRows.pageOpacity).toBe(1);
    expect(besideRows.actorOpacity).toBe(1);
    expect(besideRows.machineOpacity).toBe(1);

    const cleanItem = getActorsHelpFrame(7100);
    expect(cleanItem.pageOpacity).toBe(1);
    expect(cleanItem.actorOpacity).toBe(0);
    expect(cleanItem.machineOpacity).toBe(0);

    const restored = getActorsHelpFrame(8600);
    expect(restored.actorOpacity).toBe(1);
    expect(restored.travel).toBe(1);

    const start = getActorsHelpFrame(0);
    const end = getActorsHelpFrame(actorsHelpDuration);
    expect(start).toEqual(end);
    expect(start.pageOpacity).toBe(0);
    expect(start.actorOpacity).toBe(1);
  });

  it("renders the self-contained scene and the three sample relationship rows", () => {
    render(<ActorsHelpDemo />);
    const figure = screen.getByRole("figure", {
      name: "Actors become Item ownership and relationship entries",
    });
    expect(figure.querySelectorAll("[data-actor]")).toHaveLength(3);
    expect(figure.querySelectorAll("[data-service='item']")).toHaveLength(1);
    expect(figure.querySelector("svg[viewBox='0 0 420 310']")).not.toBeNull();
    // The sample Item uses the surrounding modal theme, not a fixed light background.
    expect(figure.querySelector(".actors-help-item > rect")).toBeNull();
    expect(figure.querySelector(".contact-type-icon")).not.toBeNull();
    expect(figure.querySelector(".actor-team-icon")).not.toBeNull();
    expect(figure.querySelector(".catalog-item-info-button")).not.toBeNull();
    expect(Array.from(figure.querySelectorAll("[data-scene-label]"),
      (label) => label.getAttribute("data-scene-label")).sort())
      .toEqual(["Owner", "Service", "Support", "User"]);
    expect(figure.querySelector("[data-service='item'] [data-scene-label='Service']"))
      .not.toBeNull();
    for (const [id, role] of [
      ["owner", "Owner"], ["user", "User"], ["support", "Support"],
    ]) {
      expect(figure.querySelector(`[data-actor="${id}"] [data-scene-label="${role}"]`))
        .not.toBeNull();
    }
    expect(figure.textContent).toContain("Order Platform Team");
    expect(figure.textContent).toContain("Fulfillment Team");
    expect(figure.textContent).toContain("Service Desk");
    expect(figure.querySelectorAll("img")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Replay" })).toBeNull();
    expect(figure.querySelector("figcaption")).toBeNull();
    expect(screen.getByRole("progressbar", { name: "Animation progress" })).not.toBeNull();
  });

  it("loops automatically and places sprites after the labels", () => {
    vi.useFakeTimers();
    render(<ActorsHelpDemo />);
    const owner = document.querySelector('[data-actor="owner"]');
    const user = document.querySelector('[data-actor="user"]');
    const other = document.querySelector('[data-actor="support"]');
    const machine = document.querySelector('[data-service="item"]');

    act(() => { vi.advanceTimersByTime(4600); });
    const positions = [owner, user, other].map((node) => {
      const values = node?.getAttribute("transform")?.match(/[\d.]+/g)?.map(Number) || [];
      expect(values[0]).toBeGreaterThan(190);
      expect(values[0]).toBeLessThan(400);
      return values[1];
    });
    expect(positions[0]).toBeLessThan(positions[1]);
    expect(positions[1]).toBeLessThan(positions[2]);
    expect(document.querySelectorAll(".actor-summary-row")).toHaveLength(3);
    expect(machine?.querySelector("[data-service-sprite]")?.getAttribute("transform"))
      .toContain("scale(0.078)");
    expect(owner?.querySelector("[data-scene-label='Owner']")).not.toBeNull();
    expect(user?.querySelector("[data-scene-label='User']")).not.toBeNull();
    expect(other?.querySelector("[data-scene-label='Support']")).not.toBeNull();

    act(() => { vi.advanceTimersByTime(actorsHelpDuration - 4600); });
    expect(screen.getByRole("progressbar", { name: "Animation progress" })
      .getAttribute("aria-valuenow")).toBe("0");
    act(() => { vi.advanceTimersByTime(1800); });
    expect(screen.getByRole("progressbar", { name: "Animation progress" })
      .getAttribute("aria-valuenow")).not.toBe("0");
  });

  it("shows a static Item preview when reduced motion is requested", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    render(<ActorsHelpDemo />);
    expect(screen.queryByRole("button", { name: "Replay" })).toBeNull();
    expect(screen.getByRole("figure").querySelectorAll("[data-actor]")).toHaveLength(0);
    vi.unstubAllGlobals();
  });
});
