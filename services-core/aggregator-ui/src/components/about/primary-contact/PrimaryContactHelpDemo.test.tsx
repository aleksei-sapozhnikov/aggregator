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
import ContextualHelpProvider from "../core/ContextualHelpProvider";

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

  it("has matching user, owner and service assets with separate wooden captions", () => {
    const { container } = render(<PrimaryContactHelpDemo />);
    const caller = container.querySelector("[data-primary-contact-observer]");
    const technician = container.querySelector(
      "[data-primary-contact-technician]",
    );
    const service = container.querySelector("[data-primary-contact-service]");
    expect(caller?.querySelector('[data-demo-character="user"]')).not.toBeNull();
    expect(
      caller?.querySelector('[data-demo-gesture="phone"]'),
    ).not.toBeNull();
    expect(
      technician?.querySelector('[data-demo-character="owner"]'),
    ).not.toBeNull();
    expect(service?.querySelector("[data-demo-service-machine]")).not.toBeNull();
    expect(caller?.querySelector('[data-scene-label="User"]')).not.toBeNull();
    expect(
      technician?.querySelector('[data-scene-label="Owner"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-scene-label="Service"]'),
    ).toBeNull();
    expect(container.querySelectorAll(".demo-wood-label")).toHaveLength(2);
    expect(
      caller?.querySelector('[data-demo-character="user"] [data-scene-label]'),
    ).toBeNull();
    expect(
      technician?.querySelector(
        '[data-demo-character="owner"] [data-scene-label]',
      ),
    ).toBeNull();
  });

  it("switches the shared service lamp to red during the failure and back on recovery", () => {
    vi.useFakeTimers();
    const { container } = render(<PrimaryContactHelpDemo />);
    const service = container.querySelector("[data-primary-contact-service]");
    const red = service?.querySelector('[data-service-lamp="down"]');
    const green = service?.querySelector('[data-service-lamp="up"]');
    expect(red?.querySelector("use")?.getAttribute("href")).toContain(
      "ServiceMachine.svg#service-down",
    );
    expect(green?.querySelector("use")?.getAttribute("href")).toContain(
      "ServiceMachine.svg#service-up",
    );
    expect(red?.getAttribute("opacity")).toBe("0");
    expect(green?.getAttribute("opacity")).toBe("1");
    act(() => vi.advanceTimersByTime(2000));
    expect(Number(red?.getAttribute("opacity"))).toBe(1);
    expect(Number(green?.getAttribute("opacity"))).toBe(0);
    act(() => vi.advanceTimersByTime(10000));
    expect(red?.getAttribute("opacity")).toBe("0");
    expect(green?.getAttribute("opacity")).toBe("1");
  });

  it("makes User worried until repair and puts the phone down when Owner arrives", () => {
    const start = getPrimaryContactHelpFrame(0);
    const failed = getPrimaryContactHelpFrame(1900);
    const calling = getPrimaryContactHelpFrame(8000);
    const arrived = getPrimaryContactHelpFrame(9600);
    const repaired = getPrimaryContactHelpFrame(11800);
    const restarting = getPrimaryContactHelpFrame(15100);

    expect(start.unhealthy).toBe(0);
    expect(start.userPhoneVisible).toBe(1);
    expect(failed.unhealthy).toBe(1);
    expect(calling.unhealthy).toBe(1);
    expect(calling.userPhoneVisible).toBe(1);
    expect(arrived.unhealthy).toBe(1);
    expect(arrived.technicianX).toBe(238);
    expect(arrived.userPhoneVisible).toBe(0);
    expect(arrived.phone).toBe(0);
    expect(repaired.unhealthy).toBe(0);
    expect(repaired.userPhoneVisible).toBe(0);
    expect(restarting.userPhoneVisible).toBe(1);
  });

  it("renders the matching facial expression and lowers User's phone during repair", () => {
    vi.useFakeTimers();
    const { container } = render(<PrimaryContactHelpDemo />);
    const user = container.querySelector('[data-demo-character="user"]');
    const happy = user?.querySelector('[data-user-expression="happy"]');
    const unhappy = user?.querySelector('[data-user-expression="unhappy"]');
    const phone = user?.querySelector('[data-demo-gesture="phone"]');
    const idleArm = user?.querySelector('[data-user-arm="idle"]');

    expect(happy?.getAttribute("opacity")).toBe("1");
    expect(unhappy?.getAttribute("opacity")).toBe("0");
    expect(phone?.getAttribute("opacity")).toBe("1");

    act(() => vi.advanceTimersByTime(1900));
    expect(happy?.getAttribute("opacity")).toBe("0");
    expect(unhappy?.getAttribute("opacity")).toBe("1");

    act(() => vi.advanceTimersByTime(7700));
    expect(unhappy?.getAttribute("opacity")).toBe("1");
    expect(phone?.getAttribute("opacity")).toBe("0");
    expect(idleArm?.getAttribute("opacity")).toBe("1");
    const contactPhone = container.querySelector(
      "[data-primary-contact-phone]",
    ) as SVGGElement;
    expect(contactPhone.style.opacity).toBe("0");

    act(() => vi.advanceTimersByTime(2200));
    expect(happy?.getAttribute("opacity")).toBe("1");
    expect(unhappy?.getAttribute("opacity")).toBe("0");
    expect(phone?.getAttribute("opacity")).toBe("0");
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
    expect(figure?.getAttribute("style")).toContain("560px");
    const compactLayout = getPrimaryContactHelpLayout(540);
    expect(compactLayout.compact).toBe(true);
    const [, , width, height] = compactLayout.viewBox.split(" ").map(Number);
    expect(width).toBe(540);
    expect(height).toBeLessThan(340);
    const [left] = compactLayout.viewBox.split(" ").map(Number);
    expect(compactLayout.pageX).toBe(
      left +
        (width - compactLayout.pageWidth * compactLayout.pageScale) / 2,
    );
    expect(figure?.querySelector("[data-primary-contact-page]")).not.toBeNull();
    expect(
      figure?.querySelector("[data-primary-contact-transfer]"),
    ).not.toBeNull();
    expect(
      figure?.querySelector("[data-primary-contact-phone]"),
    ).not.toBeNull();
    expect(figure?.querySelectorAll("img")).toHaveLength(0);
  });

  it("briefly overlays the full cast without leaving characters peeking out", () => {
    vi.useFakeTimers();
    const { container } = render(<PrimaryContactHelpDemo />);
    const illustration = container.querySelector(
      '[data-primary-contact-scene="true"]',
    )?.parentElement as SVGElement;
    const page = container.querySelector(
      "[data-primary-contact-page]",
    ) as HTMLElement;
    expect(illustration.style.opacity).toBe("1");
    expect(page.style.opacity).toBe("0");

    act(() => vi.advanceTimersByTime(5350));
    expect(illustration.style.opacity).toBe("0");
    expect(page.style.opacity).toBe("1");

    act(() => vi.advanceTimersByTime(2350));
    expect(illustration.style.opacity).toBe("1");
    expect(page.style.opacity).toBe("0");
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
    const scene = document.querySelector("[data-primary-contact-scene]");
    const layout = getPrimaryContactHelpLayout(540);
    expect(scene?.getAttribute("transform")).toBe(
      `translate(${layout.sceneX} ${layout.sceneY}) scale(${layout.sceneScale})`,
    );
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

  it("keeps the service, caller and incoming owner inside a centered scene", () => {
    for (const width of [640, 540, 380, 320]) {
      const layout = getPrimaryContactHelpLayout(width);
      const [left, top, viewWidth, viewHeight] = layout.viewBox
        .split(" ")
        .map(Number);
      const gutterLeft = layout.sceneX + layout.sceneScale * 65 - left;
      const gutterRight =
        left + viewWidth - (layout.sceneX + layout.sceneScale * 640);
      expect(gutterLeft).toBeGreaterThanOrEqual(15);
      expect(gutterRight).toBeGreaterThanOrEqual(15);

      // The same illustration is centered at every viewport width.
      expect(gutterLeft).toBeCloseTo(gutterRight);
      expect(layout.sceneScale).toBeLessThanOrEqual(0.9);
      const serviceCenter =
        layout.sceneX + layout.sceneScale * (75 + 94 * 0.75);
      const ownerCenter =
        layout.sceneX +
        layout.sceneScale * (getPrimaryContactHelpFrame(10000).technicianX + 31);
      const userCenter =
        layout.sceneX + layout.sceneScale * (454 + (9 + 51 * 1.32) * 0.75);
      expect(serviceCenter).toBeLessThan(ownerCenter);
      expect(ownerCenter).toBeLessThan(userCenter);

      const actualPageLeft = layout.pageX;
      const actualPageRight =
        layout.pageX + layout.pageWidth * layout.pageScale;
      const actualPageTop = layout.pageY;
      const actualPageBottom =
        layout.pageY + layout.pageHeight * layout.pageScale;
      expect(actualPageLeft).toBeGreaterThanOrEqual(left);
      expect(actualPageRight).toBeLessThanOrEqual(left + viewWidth);
      expect(actualPageTop).toBeGreaterThanOrEqual(top);
      expect(actualPageBottom).toBeLessThanOrEqual(top + viewHeight);
      expect(actualPageLeft - left).toBeCloseTo(
        left + viewWidth - actualPageRight,
      );
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
        .querySelector("[data-primary-contact-observer-scale]")
        ?.getAttribute("transform"),
    ).toBe("translate(454 140) scale(0.75) translate(-352 -76)");
    const layout = getPrimaryContactHelpLayout(320);
    expect(
      svg.querySelector("[data-primary-contact-scene]")?.getAttribute("transform"),
    ).toBe(
      `translate(${layout.sceneX} ${layout.sceneY}) scale(${layout.sceneScale})`,
    );
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
