/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PrimaryContactHelpDemo, {
  getPrimaryContactHelpFrame,
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

  it("loops and resets its progress indicator", () => {
    vi.useFakeTimers();
    render(<PrimaryContactHelpDemo />);
    const progress = screen.getByRole("progressbar", { name: "Animation progress" });
    act(() => { vi.advanceTimersByTime(primaryContactHelpDuration / 2); });
    expect(progress.getAttribute("aria-valuenow")).toBe("50");
    act(() => { vi.advanceTimersByTime(primaryContactHelpDuration / 2); });
    expect(progress.getAttribute("aria-valuenow")).toBe("0");
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
