/**
 * @vitest-environment jsdom
 */

/** @file Tests modal stacking, focus handling, and close interactions. */

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
    expect(dialog.querySelector(".modal-header .about-close")).not.toBeNull();
    expect(dialog.querySelector(".modal-content .about-close")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Close shared shell" }).classList,
    ).toContain("about-close");
  });

  it("renders JSX header content beside the fixed close button", () => {
    render(
      <ModalWindow
        isOpen={true}
        onClose={vi.fn()}
        ariaLabel="Header slot"
        header={
          <div>
            <h2>About</h2>
            <a href="https://example.com">Project link</a>
          </div>
        }
      >
        <p>Scrollable body</p>
      </ModalWindow>,
    );

    const dialog = screen.getByRole("dialog", { name: "Header slot" });
    const header = dialog.querySelector(".modal-header");
    const body = dialog.querySelector(".modal-content");

    expect(
      header?.contains(screen.getByRole("heading", { name: "About" })),
    ).toBe(true);
    expect(
      header?.contains(screen.getByRole("link", { name: "Project link" })),
    ).toBe(true);
    expect(
      header?.contains(screen.getByRole("button", { name: "Close dialog" })),
    ).toBe(true);
    expect(body?.contains(screen.getByText("Scrollable body"))).toBe(true);
    expect(body?.contains(screen.getByRole("heading", { name: "About" }))).toBe(
      false,
    );
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

  it("makes background content inert and restores existing attributes on close", () => {
    const { container, rerender } = render(
      <>
        <button type="button">Background action</button>
        <ModalWindow isOpen={true} onClose={vi.fn()} ariaLabel="Isolation">
          <p>Foreground</p>
        </ModalWindow>
      </>,
    );
    expect(container.hasAttribute("inert")).toBe(true);
    expect(container.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByRole("dialog", { name: "Isolation" })).not.toBeNull();

    rerender(<button type="button">Background action</button>);
    expect(container.hasAttribute("inert")).toBe(false);
    expect(container.hasAttribute("aria-hidden")).toBe(false);
    expect(
      screen.getByRole("button", { name: "Background action" }),
    ).not.toBeNull();
  });

  it("preserves preexisting background accessibility attributes", () => {
    const background = document.createElement("section");
    background.setAttribute("aria-hidden", "false");
    background.setAttribute("inert", "");
    document.body.appendChild(background);
    const { unmount } = render(
      <ModalWindow isOpen={true} onClose={vi.fn()} ariaLabel="Restore">
        <p>Foreground</p>
      </ModalWindow>,
    );
    expect(background.getAttribute("aria-hidden")).toBe("true");
    unmount();
    expect(background.getAttribute("aria-hidden")).toBe("false");
    expect(background.hasAttribute("inert")).toBe(true);
    background.remove();
  });

  it("traps forward and backward keyboard focus inside the dialog", () => {
    render(
      <>
        <button type="button">Background action</button>
        <ModalWindow isOpen={true} onClose={vi.fn()} ariaLabel="Focus trap">
          <button type="button">First action</button>
          <a href="/details">Last action</a>
        </ModalWindow>
      </>,
    );

    const dialog = screen.getByRole("dialog", { name: "Focus trap" });
    const first = screen.getByRole("button", { name: "Close dialog" });
    const last = screen.getByRole("link", { name: "Last action" });
    const background = screen.getByRole("button", {
      name: "Background action",
      hidden: true,
    });

    first.focus();
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);

    last.focus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    background.focus();
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(first);
  });

  it("traps focus in the topmost modal and restores it to the parent", () => {
    render(<NestedModalHarness />);
    const opener = screen.getByRole("button", { name: "Open child" });
    opener.focus();
    fireEvent.click(opener);

    const child = screen.getByRole("dialog", { name: "Child" });
    const overlays = document.querySelectorAll(".modal-overlay");
    expect(overlays[0].getAttribute("aria-hidden")).toBe("true");
    expect(overlays[0].hasAttribute("inert")).toBe(true);
    expect(overlays[1].hasAttribute("inert")).toBe(false);
    const childClose = child.querySelector(".about-close") as HTMLButtonElement;
    childClose.focus();

    fireEvent.keyDown(window, { key: "Tab" });
    expect(document.activeElement).toBe(childClose);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Child" })).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(overlays[0].hasAttribute("inert")).toBe(false);
    expect(overlays[0].hasAttribute("aria-hidden")).toBe(false);
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
