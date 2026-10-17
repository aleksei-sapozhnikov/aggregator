/**
 * @vitest-environment jsdom
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectDecorativeSceneShield } from "../../shared/help/helpTestAssertions";
import PrimaryContactHelpDemo, {
  getPrimaryContactHelpFrame,
  getPrimaryContactHelpLayout,
  primaryContactHelpDuration,
} from "./PrimaryContactHelpDemo";
import InfoHelp from "../../shared/help/InfoHelp";
import ContextualHelpProvider from "../ContextualHelpProvider";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Primary contact contextual help", () => {
  it("blocks pointer interactions with the decorative animation, not its progress bar", () => {
    render(<PrimaryContactHelpDemo />);
    const figure = screen.getByRole("figure", {
      name: "Find the primary contact in Aggregator to get a failing service repaired",
    });
    expectDecorativeSceneShield(figure);
  });

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
    expect(getPrimaryContactHelpFrame(primaryContactHelpDuration)).toEqual(
      initial,
    );
  });

  it("shows the animated preview directly beneath the existing description", () => {
    render(
      <ContextualHelpProvider>
        <InfoHelp topicId="primary-contact" />
      </ContextualHelpProvider>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "About Primary contact" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "About Primary contact",
    });
    const text = dialog.querySelector(".info-help-description");
    const figure = dialog.querySelector("figure.primary-contact-help-demo");
    expect(text?.textContent).toContain(
      "The primary contact is the main contact point",
    );
    expect(text?.nextElementSibling).toBe(figure);
    expect(figure?.classList.contains("help-animation-canvas")).toBe(true);
    expect(figure?.getAttribute("style")).toContain("660px");
    expect(figure?.querySelector("[data-primary-contact-page]")).not.toBeNull();
    expect(
      figure?.querySelector("[data-primary-contact-transfer]"),
    ).not.toBeNull();
    expect(
      figure?.querySelector("[data-primary-contact-phone]"),
    ).not.toBeNull();
    expect(figure?.querySelectorAll("img")).toHaveLength(0);
  });

  it("renders the page and moving contact as production HTML beside the illustrative SVG", () => {
    render(<PrimaryContactHelpDemo />);
    const page = document.querySelector(
      "[data-primary-contact-page]",
    ) as HTMLElement;
    expect(page.tagName).toBe("DIV");
    expect(page.closest("svg")).toBeNull();
    expect(page.querySelector(".content-title")?.textContent).toContain(
      "Customer Experience",
    );
    expect(page.querySelector(".content-status-label")?.textContent).toBe(
      "DOWN",
    );
    expect(page.querySelectorAll(".actor-summary-row")).toHaveLength(3);
    expect(
      page.querySelector('[data-primary-contact-highlight="true"]')?.className,
    ).toContain("demo-highlight-frame--html");
    const heading = page.querySelector(".primary-contact-heading-row");
    expect(
      heading?.nextElementSibling?.classList.contains("primary-contact-row"),
    ).toBe(true);
    const transfer = document.querySelector("[data-primary-contact-transfer]");
    expect(transfer?.querySelector(".primary-contact-row")?.innerHTML).toBe(
      page.querySelector(".primary-contact-row")?.innerHTML,
    );
    expect(page.hasAttribute("inert")).toBe(true);
    expect(
      page.querySelector("a[href], button:not(:disabled), [tabindex='0']"),
    ).toBeNull();
    expect(
      document
        .querySelector("[data-primary-contact-scene]")
        ?.getAttribute("transform"),
    ).toBe("translate(130 55) scale(0.66)");
    const technician = document.querySelector(
      '[data-primary-contact-technician="true"]',
    );
    expect(
      technician
        ?.querySelector('[data-scene-label="Owner"]')
        ?.classList.contains("demo-wood-label"),
    ).toBe(true);
  });

  it("loops and resets its progress indicator", () => {
    vi.useFakeTimers();
    render(<PrimaryContactHelpDemo />);
    const progress = screen.getByRole("progressbar", {
      name: "Animation progress",
    });
    act(() => {
      vi.advanceTimersByTime(primaryContactHelpDuration / 2);
    });
    expect(progress.getAttribute("aria-valuenow")).toBe("50");
    act(() => {
      vi.advanceTimersByTime(primaryContactHelpDuration / 2);
    });
    expect(progress.getAttribute("aria-valuenow")).toBe("0");
  });

  it("maintains roughly the same illustrated pixel scale on desktop and mobile", () => {
    for (const width of [640, 540, 380, 320]) {
      const layout = getPrimaryContactHelpLayout(width);
      const [, , viewWidth, viewHeight] = layout.viewBox.split(" ").map(Number);
      const serviceWidthInPixels =
        (137 * 0.66 * Math.min(width, 640)) / viewWidth;

      expect(serviceWidthInPixels).toBeGreaterThan(84);
      expect(serviceWidthInPixels).toBeLessThan(100);
      expect(
        (viewHeight * Math.min(width, 640)) / viewWidth,
      ).toBeLessThanOrEqual(340);

      const [left, top] = layout.viewBox.split(" ").map(Number);
      const actualPageLeft = layout.pageX;
      const actualPageRight =
        actualPageLeft + layout.pageWidth * layout.pageScale;
      const actualPageTop = layout.pageY;
      const actualPageBottom =
        actualPageTop + layout.pageHeight * layout.pageScale;
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
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () =>
        ({ width: measuredWidth, height: 230, toJSON: () => ({}) }) as DOMRect,
    );
    // noinspection JSUnusedGlobalSymbols
    class MockResizeObserver {
      private readonly callback: ResizeObserverCallback;
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
      }
      observe(element: Element) {
        if (element.classList.contains("help-scene"))
          notifyResize = () =>
            this.callback([], this as unknown as ResizeObserver);
      }
      disconnect() {
        notifyResize = undefined;
      }
    }
    vi.stubGlobal("ResizeObserver", MockResizeObserver);

    render(<PrimaryContactHelpDemo />);
    const svg = screen.getByRole("img", {
      name: /A service goes down; a person opens Aggregator/,
    });
    const scene = document.querySelector(".help-scene") as HTMLElement;
    const canvas = scene.querySelector(".help-scene-canvas") as HTMLElement;
    expect(scene.style.aspectRatio).toContain("380");
    expect(canvas.style.transform).toContain("scale(1)");

    measuredWidth = 320;
    act(() => {
      notifyResize?.();
    });
    expect(scene.style.aspectRatio).toContain("320");
    expect(canvas.style.transform).toContain("scale(1)");
    expect(
      svg
        .querySelector("[data-primary-contact-observer-offset]")
        ?.getAttribute("transform"),
    ).toBe("translate(-24 0)");
  });

  it("keeps a readable highlighted Item preview for reduced motion", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    render(<PrimaryContactHelpDemo />);
    const preview = document.querySelector(
      "[data-primary-contact-page]",
    ) as SVGGElement;
    expect(preview.style.opacity).toBe("1");
    expect(preview.textContent).toContain("Primary contact");
    expect(preview.textContent).toContain("+1 555 010 2026");
  });
});
