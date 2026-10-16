/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PrimaryContactHelpDemo, {
  getPrimaryContactHelpFrame,
  getPrimaryContactHelpLayout,
  primaryContactHelpDuration,
} from "./PrimaryContactHelpDemo";
import InfoHelp from "./InfoHelp";
import { infoHelpTopics } from "../shared/infoHelpTopics";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Primary contact contextual help", () => {
  it("follows the failure, laptop, contact, phone, repair and recovery sequence", () => {
    const initial = getPrimaryContactHelpFrame(0);
    expect(initial.unhealthy).toBe(0);
    expect(initial.laptop).toBe(0);
    expect(initial.pageOpacity).toBe(0);

    expect(getPrimaryContactHelpFrame(1900).unhealthy).toBe(1);
    expect(getPrimaryContactHelpFrame(3500).laptop).toBe(1);
    const page = getPrimaryContactHelpFrame(5350);
    expect(page.pageExpansion).toBe(1);
    expect(page.pageOpacity).toBe(1);
    expect(page.selectedContact).toBe(1);

    const transfer = getPrimaryContactHelpFrame(6750);
    expect(transfer.contactTravel).toBeGreaterThan(0);
    expect(transfer.contactTravel).toBeLessThan(1);
    expect(transfer.pageOpacity).toBeGreaterThan(0);
    expect(transfer.pageOpacity).toBeLessThan(1);

    expect(getPrimaryContactHelpFrame(8000).calling).toBe(1);
    expect(getPrimaryContactHelpFrame(9950).repair).toBe(1);
    expect(getPrimaryContactHelpFrame(11800).unhealthy).toBe(0);
    expect(getPrimaryContactHelpFrame(primaryContactHelpDuration)).toEqual(initial);
  });

  it("shows the animated preview directly beneath the existing description", () => {
    render(<InfoHelp topic={infoHelpTopics.primaryContact} />);
    fireEvent.click(screen.getByRole("button", { name: "About Primary contact" }));
    const dialog = screen.getByRole("dialog", { name: "About Primary contact" });
    const text = dialog.querySelector(".info-help-description");
    const figure = dialog.querySelector("figure.primary-contact-help-demo");
    expect(text?.textContent).toContain("The primary contact is the main contact point");
    expect(text?.nextElementSibling).toBe(figure);
    expect(figure?.querySelector("[data-primary-contact-page]")).not.toBeNull();
    expect(figure?.querySelector("[data-primary-contact-transfer]")).not.toBeNull();
    expect(figure?.querySelector("[data-primary-contact-phone]")).not.toBeNull();
    expect(figure?.querySelectorAll("img")).toHaveLength(0);
  });

  it("keeps sprites at Actors scale and contact directly beneath its heading", () => {
    render(<PrimaryContactHelpDemo />);
    const illustration = screen.getByRole("figure", {
      name: "Find the primary contact in Aggregator to get a failing service repaired",
    });
    expect(illustration.querySelector("[data-primary-contact-scene]")?.getAttribute("transform"))
      .toBe("translate(130 55) scale(0.66)");
    expect(illustration.querySelector("[data-primary-contact-observer-scale]")?.getAttribute("transform"))
      .toContain("scale(0.75)");

    const heading = illustration.querySelector(".primary-contact-page-heading") as SVGTextElement;
    const phone = illustration.querySelector(".primary-contact-page-link") as SVGTextElement;
    const highlight = illustration.querySelector(".primary-contact-page-highlight") as SVGRectElement;
    const gap = Number(phone.getAttribute("y")) - Number(heading.getAttribute("y"));
    expect(gap).toBeGreaterThan(25);
    expect(gap).toBeLessThan(45);
    expect(highlight.getAttribute("y")).toBe("125");
    expect(illustration.querySelector("[data-primary-contact-transfer]")).not.toBeNull();
  });

  it("loops and resets its progress indicator", () => {
    vi.useFakeTimers();
    render(<PrimaryContactHelpDemo />);
    const progress = screen.getByRole("progressbar", { name: "Animation progress" });
    act(() => { vi.advanceTimersByTime(primaryContactHelpDuration / 2); });
    expect(progress.getAttribute("aria-valuenow")).toBe("50");
    act(() => { vi.advanceTimersByTime(primaryContactHelpDuration / 2); });
    expect(progress.getAttribute("aria-valuenow")).toBe("0");
  });

  it("maintains roughly the same illustrated pixel scale on desktop and mobile", () => {
    for (const width of [640, 540, 380, 320]) {
      const layout = getPrimaryContactHelpLayout(width);
      const [, , viewWidth, viewHeight] = layout.viewBox.split(" ").map(Number);
      const serviceWidthInPixels = 137 * 0.66 * Math.min(width, 640) / viewWidth;

      expect(serviceWidthInPixels).toBeGreaterThan(84);
      expect(serviceWidthInPixels).toBeLessThan(100);
      expect(viewHeight * Math.min(width, 640) / viewWidth).toBeLessThanOrEqual(340);

      const [left, top] = layout.viewBox.split(" ").map(Number);
      const actualPageLeft = layout.pageX + 6 * layout.pageScale;
      const actualPageRight = actualPageLeft + 628 * layout.pageScale;
      const actualPageTop = layout.pageY + 5 * layout.pageScale;
      const actualPageBottom = actualPageTop + 330 * layout.pageScale;
      expect(actualPageLeft).toBeGreaterThanOrEqual(left);
      expect(actualPageRight).toBeLessThanOrEqual(left + viewWidth);
      expect(actualPageTop).toBeGreaterThanOrEqual(top);
      expect(actualPageBottom).toBeLessThanOrEqual(top + viewHeight);
    }
    expect(getPrimaryContactHelpLayout(640).viewBox).toBe("0 0 640 340");
    expect(getPrimaryContactHelpLayout(380).compact).toBe(true);
  });

  it("adapts the scene and expanded page when its actual card width changes", () => {
    let measuredWidth = 380;
    let notifyResize: (() => void) | undefined;
    vi.spyOn(SVGElement.prototype, "getBoundingClientRect").mockImplementation(
      () => ({ width: measuredWidth, height: 230, toJSON: () => ({}) }) as DOMRect,
    );
    class MockResizeObserver {
      private readonly callback: ResizeObserverCallback;
      constructor(callback: ResizeObserverCallback) { this.callback = callback; }
      observe() { notifyResize = () => this.callback([], this as unknown as ResizeObserver); }
      disconnect() { notifyResize = undefined; }
    }
    vi.stubGlobal("ResizeObserver", MockResizeObserver);

    render(<PrimaryContactHelpDemo />);
    const svg = screen.getByRole("img", {
      name: /A service goes down; a person opens Aggregator/,
    });
    expect(svg.getAttribute("viewBox")).toBe(getPrimaryContactHelpLayout(380).viewBox);

    measuredWidth = 320;
    act(() => { notifyResize?.(); });
    expect(svg.getAttribute("viewBox")).toBe(getPrimaryContactHelpLayout(320).viewBox);
    expect(svg.querySelector("[data-primary-contact-observer-offset]")
      ?.getAttribute("transform")).toBe("translate(-24 0)");
  });

  it("keeps a readable highlighted Item preview for reduced motion", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    render(<PrimaryContactHelpDemo />);
    const preview = document.querySelector("[data-primary-contact-page]") as SVGGElement;
    expect(preview.style.opacity).toBe("1");
    expect(preview.textContent).toContain("Primary contact");
    expect(preview.textContent).toContain("+1 555 010 2026");
  });
});
