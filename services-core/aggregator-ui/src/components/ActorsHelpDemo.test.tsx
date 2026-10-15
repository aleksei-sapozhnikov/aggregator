/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ActorsHelpDemo, { actorsHelpDuration, getActorsHelpFrame } from "./ActorsHelpDemo";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Actors contextual help animation", () => {
  it("maps three distinct people to Owner, User and Other rows", () => {
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
    expect(figure.querySelector("svg[viewBox='0 0 640 326']")).not.toBeNull();
    expect(figure.textContent).toContain("Order Platform Team");
    expect(figure.textContent).toContain("Fulfillment Operators");
    expect(figure.textContent).toContain("Customer Support");
    expect(figure.querySelectorAll("img")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Replay" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Replay" }));
    expect(screen.getByRole("progressbar", { name: "Animation progress" })).not.toBeNull();
  });

  it("shows a static Item preview when reduced motion is requested", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    render(<ActorsHelpDemo />);
    expect(screen.queryByRole("button", { name: "Replay" })).toBeNull();
    expect(screen.getByRole("figure").querySelectorAll("[data-actor]")).toHaveLength(0);
    vi.unstubAllGlobals();
  });
});
