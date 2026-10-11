/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ModalWindow from "./ModalWindow";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ModalWindow", () => {
  it("renders the shared modal shell with a fixed content scroller", () => {
    render(
      <ModalWindow
        isOpen={true}
        onClose={vi.fn()}
        ariaLabel="Shared shell"
        closeLabel="Close shared shell"
      >
        <p>Modal content</p>
      </ModalWindow>,
    );

    const dialog = screen.getByRole("dialog", { name: "Shared shell" });

    expect(dialog.classList.contains("modal-window")).toBe(true);
    expect(dialog.querySelector(".modal-content")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Close shared shell" }).classList,
    ).toContain("about-close");
  });

  it("closes on backdrop clicks but not content clicks", () => {
    const onClose = vi.fn();
    render(
      <ModalWindow isOpen={true} onClose={onClose} ariaLabel="Backdrop test">
        <button type="button">Inside</button>
      </ModalWindow>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Inside" }));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("dialog", { name: "Backdrop test" }));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(document.querySelector(".modal-overlay") as Element);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("only closes the topmost modal on Escape and backdrop clicks", () => {
    const onParentClose = vi.fn();
    const onChildClose = vi.fn();

    render(
      <>
        <ModalWindow
          isOpen={true}
          onClose={onParentClose}
          ariaLabel="Parent dialog"
        >
          <p>Parent content</p>
        </ModalWindow>
        <ModalWindow
          isOpen={true}
          onClose={onChildClose}
          ariaLabel="Child dialog"
        >
          <p>Child content</p>
        </ModalWindow>
      </>,
    );

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onChildClose).toHaveBeenCalledOnce();
    expect(onParentClose).not.toHaveBeenCalled();

    onChildClose.mockClear();
    fireEvent.click(document.querySelector(".modal-overlay") as Element);

    expect(onChildClose).not.toHaveBeenCalled();
    expect(onParentClose).not.toHaveBeenCalled();

    const overlays = document.querySelectorAll(".modal-overlay");
    fireEvent.click(overlays[1]);

    expect(onChildClose).toHaveBeenCalledOnce();
    expect(onParentClose).not.toHaveBeenCalled();
  });
});
