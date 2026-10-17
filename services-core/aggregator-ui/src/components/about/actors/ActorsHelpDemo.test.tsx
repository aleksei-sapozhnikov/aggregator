/**
 * @vitest-environment jsdom
 */

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectDecorativeSceneShield } from "../../shared/help/helpTestAssertions";
import ActorsHelpDemo, {
  actorsHelpDuration,
  getActorsHelpFrame,
} from "./ActorsHelpDemo";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Actors contextual help animation", () => {
  it("blocks pointer interactions with the decorative animation, not its progress bar", () => {
    render(<ActorsHelpDemo />);
    const figure = screen.getByRole("figure", {
      name: "Actors become Item ownership and relationship entries",
    });
    expectDecorativeSceneShield(figure);
  });

  it("holds all sprites by their rows for two seconds before reversing", () => {
    for (const time of [3600, 4600, 5600]) {
      const frame = getActorsHelpFrame(time);
      expect(frame.travel).toBe(1);
      expect(frame.pageOpacity).toBe(1);
    }

    const returning = getActorsHelpFrame(6500);
    expect(returning.travel).toBeGreaterThan(0);
    expect(returning.travel).toBeLessThan(1);
    expect(returning.pageOpacity).toBeGreaterThan(0);

    const restored = getActorsHelpFrame(7400);
    expect(restored.travel).toBe(0);
    expect(restored.pageOpacity).toBe(0);

    const start = getActorsHelpFrame(0);
    expect(start).toEqual(getActorsHelpFrame(actorsHelpDuration));
    expect(start.pageOpacity).toBe(0);
  });

  it("uses labeled reusable SVG characters and a reusable service", () => {
    const { container } = render(<ActorsHelpDemo />);
    for (const role of ["owner", "user", "support"]) {
      const sprite = container.querySelector(
        `[data-actor="${role}"] [data-demo-character="${role}"]`,
      );
      expect(sprite).not.toBeNull();
      // Wooden labels are separate scene elements, not part of the assets.
      expect(sprite?.querySelector("[data-scene-label]")).toBeNull();
      expect(
        container.querySelector(
          `[data-actor="${role}"] [data-scene-label]`,
        ),
      ).not.toBeNull();
    }
    expect(
      container.querySelector('[data-service="item"] [data-demo-service-machine]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-actor="owner"] .actors-help-wrench'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-actor="support"] .actors-help-wrench'),
    ).toBeNull();
  });

  it("renders the self-contained scene and the three sample relationship rows", () => {
    render(<ActorsHelpDemo />);
    const figure = screen.getByRole("figure", {
      name: "Actors become Item ownership and relationship entries",
    });
    expect(figure.classList.contains("help-animation-canvas")).toBe(true);
    expect(figure.getAttribute("style")).toContain("452px");
    expect(figure.querySelectorAll("[data-actor]")).toHaveLength(3);
    expect(figure.querySelectorAll("[data-service='item']")).toHaveLength(1);
    expect(figure.querySelector("svg[viewBox='0 0 420 310']")).not.toBeNull();
    // The sample Item uses the surrounding modal theme, not a fixed light background.
    expect(figure.querySelector(".actors-help-item > rect")).toBeNull();
    expect(figure.querySelector(".contact-type-icon")).not.toBeNull();
    expect(figure.querySelector(".actor-team-icon")).not.toBeNull();
    expect(figure.querySelector(".catalog-item-info-button")).not.toBeNull();
    expect(
      figure.querySelector(".content-title .catalog-item-info"),
    ).not.toBeNull();
    expect(
      Array.from(figure.querySelectorAll("[data-scene-label]"), (label) =>
        label.getAttribute("data-scene-label"),
      ).sort(),
    ).toEqual(["Owner", "Support", "User"]);
    expect(
      figure.querySelector(
        "[data-service='item'] [data-scene-label]",
      ),
    ).toBeNull();
    expect(figure.querySelectorAll(".demo-wood-label")).toHaveLength(3);
    for (const [id, role] of [
      ["owner", "Owner"],
      ["user", "User"],
      ["support", "Support"],
    ]) {
      expect(
        figure.querySelector(
          `[data-actor="${id}"] [data-scene-label="${role}"]`,
        ),
      ).not.toBeNull();
    }
    expect(figure.textContent).toContain("Order Platform Team");
    expect(figure.textContent).toContain("Fulfillment Team");
    expect(figure.textContent).toContain("Service Desk");
    expect(figure.querySelectorAll("img")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Replay" })).toBeNull();
    expect(figure.querySelector("figcaption")).toBeNull();
    expect(
      screen.getByRole("progressbar", { name: "Animation progress" }),
    ).not.toBeNull();
  });

  it("loops automatically and places sprites after the labels", () => {
    vi.useFakeTimers();
    render(<ActorsHelpDemo />);
    const owner = document.querySelector('[data-actor="owner"]');
    const user = document.querySelector('[data-actor="user"]');
    const other = document.querySelector('[data-actor="support"]');
    const machine = document.querySelector('[data-service="item"]');

    act(() => {
      vi.advanceTimersByTime(4600);
    });
    const positions = [owner, user, other].map((node) => {
      const values =
        node
          ?.getAttribute("transform")
          ?.match(/[\d.]+/g)
          ?.map(Number) || [];
      expect(values[0]).toBeGreaterThan(190);
      expect(values[0]).toBeLessThan(400);
      return values[1];
    });
    expect(positions[0]).toBeLessThan(positions[1]);
    expect(positions[1]).toBeLessThan(positions[2]);
    expect(document.querySelectorAll(".actor-summary-row")).toHaveLength(3);
    expect(
      machine
        ?.querySelector("[data-service-sprite]")
        ?.getAttribute("transform"),
    ).toContain("scale(0.078)");
    const serviceX = Number(
      machine?.getAttribute("transform")?.match(/translate\(([-\d.]+)/)?.[1],
    );
    expect(serviceX).toBeGreaterThan(180);
    expect(serviceX).toBeLessThan(280);
    for (const sprite of [owner, user, other, machine]) {
      expect(sprite?.hasAttribute("opacity")).toBe(false);
    }

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(machine?.getAttribute("transform")).toContain(
      `translate(${serviceX} `,
    );
    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(machine?.hasAttribute("opacity")).toBe(false);
    expect(owner?.hasAttribute("opacity")).toBe(false);

    expect(owner?.querySelector("[data-scene-label='Owner']")).not.toBeNull();
    expect(user?.querySelector("[data-scene-label='User']")).not.toBeNull();
    expect(other?.querySelector("[data-scene-label='Support']")).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(actorsHelpDuration - 6500);
    });
    expect(
      screen
        .getByRole("progressbar", { name: "Animation progress" })
        .getAttribute("aria-valuenow"),
    ).toBe("0");
    act(() => {
      vi.advanceTimersByTime(1800);
    });
    expect(
      screen
        .getByRole("progressbar", { name: "Animation progress" })
        .getAttribute("aria-valuenow"),
    ).not.toBe("0");
  });

  it("anchors the service to the title info icon", () => {
    const bounds = (left: number, top: number, width: number, height: number) =>
      ({
        left,
        top,
        right: left + width,
        bottom: top + height,
        x: left,
        y: top,
        width,
        height,
        toJSON: () => ({}),
      }) as DOMRect;
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(
      function (this: HTMLElement) {
        return this.classList.contains("actors-help-item") ? 500 : 0;
      },
    );
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        if (this.classList.contains("actors-help-item")) {
          return bounds(100, 100, 390, 242);
        }
        if (this.classList.contains("catalog-item-info")) {
          return bounds(210, 116, 24, 20);
        }
        if (this.classList.contains("content-title")) {
          return bounds(116, 116, 390, 32);
        }
        return bounds(0, 0, 0, 0);
      },
    );

    vi.useFakeTimers();
    render(<ActorsHelpDemo />);
    act(() => {
      vi.advanceTimersByTime(4600);
    });

    const service = document.querySelector('[data-service="item"]');
    const x = Number(
      service?.getAttribute("transform")?.match(/translate\(([-\d.]+)/)?.[1],
    );
    // Measured info icon ends at x=234, not at the title container's x=506.
    expect(x).toBeCloseTo(164.6, 1);
  });

  it("shows a static Item preview when reduced motion is requested", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    render(<ActorsHelpDemo />);
    expect(screen.queryByRole("button", { name: "Replay" })).toBeNull();
    expect(
      screen.getByRole("figure").querySelectorAll("[data-actor]"),
    ).toHaveLength(0);
    vi.unstubAllGlobals();
  });
});
