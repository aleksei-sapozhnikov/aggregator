/**
 * @vitest-environment jsdom
 */

import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ModalWindow from "./ModalWindow";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function NestedModalHarness() {
  const [isParentOpen, setIsParentOpen] = useState(true);
  const [isChildOpen, setIsChildOpen] = useState(false);

  return (
    <>
      <ModalWindow
        isOpen={isParentOpen}
        onClose={() => setIsParentOpen(false)}
        ariaLabel="Parent"
      >
        <button type="button" onClick={() => setIsChildOpen(true)}>
          Open child
        </button>
      </ModalWindow>
      <ModalWindow
        isOpen={isChildOpen}
        onClose={() => setIsChildOpen(false)}
        ariaLabel="Child"
      >
        <p>Child content</p>
      </ModalWindow>
    </>
  );
}

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
  it("closes the parent immediately after its child without another rerender", () => {
    render(<NestedModalHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Open child" }));

    const child = screen.getByRole("dialog", { name: "Child" });
    fireEvent.click(child.parentElement as Element);

    expect(screen.queryByRole("dialog", { name: "Child" })).toBeNull();

    const parent = screen.getByRole("dialog", { name: "Parent" });
    fireEvent.click(parent.parentElement as Element);

    expect(screen.queryByRole("dialog", { name: "Parent" })).toBeNull();
  });

  it("closes only the topmost nested modal on each Escape", () => {
    render(<NestedModalHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Open child" }));
    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "Child" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Parent" })).not.toBeNull();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "Parent" })).toBeNull();
  });
});
