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
import {
  openHelpDialogFromHover,
  expectTooltipAfterModalClose,
} from "../help/helpTestAssertions";
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

describe("CatalogItemInfo description presentation", () => {
  it("adds an action hint to a short-description tooltip and emphasizes it in the modal", () => {
    render(
      <CatalogItemInfo
        item={{
          id: "commerce",
          title: "Commerce Platform",
          shortDescription: "Coordinates customer ordering.",
          fullDescription: "The platform connects the commerce services.",
        }}
      />,
    );

    const button = screen.getByRole("button", {
      name: "Catalog information for Commerce Platform",
    });
    fireEvent.mouseEnter(button);
    const tooltip = screen.getByRole("tooltip");

    expect(tooltip.textContent).toContain("Coordinates customer ordering.");
    expect(
      tooltip
        .querySelector(".help-tooltip-action")
        ?.textContent?.trim(),
    ).toBe("Click for details");

    fireEvent.click(button);
    const dialog = screen.getByRole("dialog", {
      name: "Catalog information for Commerce Platform",
    });
    expect(
      dialog.querySelector(".catalog-item-info-content p:first-child strong")
        ?.textContent,
    ).toBe("Coordinates customer ordering.");
    expect(
      dialog.querySelectorAll(".catalog-item-info-content strong"),
    ).toHaveLength(1);
    expect(dialog.textContent).toContain(
      "The platform connects the commerce services.",
    );
  });

  it("shows an action hint when only the full description is available", () => {
    render(
      <CatalogItemInfo
        item={{
          id: "payments",
          title: "Payments",
          fullDescription: "Details about payments.",
        }}
      />,
    );

    const button = screen.getByRole("button", {
      name: "Catalog information for Payments",
    });
    fireEvent.mouseEnter(button);
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip.textContent).toBe("Click for details");
    expect(
      tooltip.querySelector(".help-tooltip-action"),
    ).toBeNull();

    fireEvent.click(button);
    expect(
      screen.getByRole("dialog", { name: "Catalog information for Payments" })
        .textContent,
    ).toContain("Details about payments.");
    expect(
      document.querySelector(".catalog-item-info-content strong"),
    ).toBeNull();
  });

  it("does not suggest opening details when no description exists", () => {
    render(<CatalogItemInfo item={{ id: "empty", title: "Empty" }} />);

    const button = screen.getByRole("button", {
      name: "Catalog information for Empty",
    });
    expect(button.getAttribute("aria-disabled")).toBe("true");
    fireEvent.mouseEnter(button);
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip.textContent).toBe("No description in catalog");
    expect(tooltip.textContent).not.toContain("Click for details");

    fireEvent.click(button);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("CatalogItemInfo modal tooltip lifecycle", () => {
  it("shows tooltip on hover only, not after modal Escape restores focus", async () => {
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

    openHelpDialogFromHover(trigger);

    const dialog = screen.getByRole("dialog", {
      name: "Catalog information for Stock",
    });
    await waitFor(() => expect(document.activeElement).toBe(dialog));

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
    await expectTooltipAfterModalClose(trigger);
  });
});
