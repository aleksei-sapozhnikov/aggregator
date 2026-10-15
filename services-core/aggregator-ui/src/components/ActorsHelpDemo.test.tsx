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
    expect(Array.from(figure.querySelectorAll("[data-scene-label]"),
      (label) => label.getAttribute("data-scene-label")))
      .toEqual(["Owner", "User", "Support", "Service"]);
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
    expect(owner?.getAttribute("transform")).toContain("translate(314 201)");
    expect(user?.getAttribute("transform")).toContain("translate(283 231)");
    expect(other?.getAttribute("transform")).toContain("translate(272 261)");
    expect(machine?.getAttribute("transform")).toContain("translate(310 36)");
    expect(machine?.getAttribute("transform")).toContain("scale(0.078)");

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
