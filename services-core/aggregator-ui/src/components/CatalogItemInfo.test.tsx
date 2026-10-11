/**
 * @vitest-environment jsdom
 */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CatalogItemInfo from "./CatalogItemInfo";

const makeRect = (
  left: number,
  top: number,
  width: number,
  height: number,
): DOMRect =>
  ({
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    x: left,
    y: top,
    toJSON: () => ({}),
  }) as DOMRect;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const showCatalogTooltip = (
  anchor: DOMRect | (() => DOMRect),
  tooltipWidth = 200,
  tooltipHeight = 40,
) => {
  vi.stubGlobal("innerWidth", 320);
  vi.stubGlobal("innerHeight", 600);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      if (this.getAttribute("role") === "tooltip") {
        return makeRect(0, 0, tooltipWidth, tooltipHeight);
      }
      if (this.classList.contains("catalog-item-info-button")) {
        return typeof anchor === "function" ? anchor() : anchor;
      }
      return makeRect(0, 0, 0, 0);
    },
  );

  render(
    <CatalogItemInfo
      item={{
        id: "stock",
        title: "Stock",
        shortDescription: "Reserves stock.",
      }}
    />,
  );
  fireEvent.mouseEnter(
    screen.getByRole("button", { name: "Catalog information for Stock" }),
  );
  return screen.getByRole("tooltip");
};

describe("CatalogItemInfo tooltip positioning", () => {
  it("places the tooltip below an item close to the top of the viewport", () => {
    const tooltip = showCatalogTooltip(makeRect(140, 24, 26, 26));

    expect(tooltip.style.top).toBe("56px");
    expect(tooltip.style.left).toBe("53px");
    expect(tooltip.style.transform).toBe("none");
    expect(tooltip.style.visibility).toBe("visible");
  });

  it("keeps the tooltip above the icon when there is enough space", () => {
    const tooltip = showCatalogTooltip(makeRect(140, 560, 26, 26));

    expect(tooltip.style.top).toBe("514px");
    expect(tooltip.style.left).toBe("53px");
  });

  it("clamps horizontal positioning to the viewport edges", () => {
    const tooltip = showCatalogTooltip(makeRect(0, 24, 26, 26));

    expect(tooltip.style.left).toBe("8px");
  });

  it("repositions the tooltip when the viewport is scrolled", () => {
    let anchor = makeRect(140, 24, 26, 26);
    const tooltip = showCatalogTooltip(() => anchor);

    expect(tooltip.style.top).toBe("56px");

    anchor = makeRect(140, 560, 26, 26);
    fireEvent.scroll(window);

    expect(tooltip.style.top).toBe("514px");
  });
});

describe("CatalogItemInfo modal tooltip lifecycle", () => {
  it("keeps the tooltip hidden after modal Escape restores focus", async () => {
    render(
      <CatalogItemInfo
        item={{
          id: "stock",
          title: "Stock",
          shortDescription: "Reserves stock.",
        }}
      />,
    );

    const trigger = screen.getByRole("button", {
      name: "Catalog information for Stock",
    });

    trigger.focus();
    fireEvent.focus(trigger);
    expect(screen.getByRole("tooltip")).not.toBeNull();

    fireEvent.click(trigger);
    expect(screen.queryByRole("tooltip")).toBeNull();

    const dialog = screen.getByRole("dialog", {
      name: "Catalog information for Stock",
    });
    await waitFor(() => expect(document.activeElement).toBe(dialog));

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(screen.queryByRole("tooltip")).toBeNull();

    fireEvent.mouseLeave(trigger);
    fireEvent.mouseEnter(trigger);
    expect(screen.getByRole("tooltip")).not.toBeNull();
  });
});
