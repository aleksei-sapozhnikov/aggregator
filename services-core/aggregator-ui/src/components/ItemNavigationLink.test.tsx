/**
 * @vitest-environment jsdom
 */

import type { MouseEvent } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ItemNavigationLink from "./ItemNavigationLink";

afterEach(cleanup);

describe("ItemNavigationLink", () => {
  it("renders an item link with a visible, decorative arrow", () => {
    const onClick = vi.fn((event: MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
    });
    render(
      <ItemNavigationLink href="/item/payments" onClick={onClick}>
        Payments
      </ItemNavigationLink>,
    );

    const link = screen.getByRole("link", { name: "Payments" });
    expect(link.getAttribute("href")).toBe("/item/payments");
    expect(link.querySelector(".item-navigation-link-text")?.textContent).toBe("Payments");
    const arrow = link.querySelector(".item-navigation-link-arrow");
    expect(arrow?.textContent?.trim()).toBe("→");
    expect(arrow?.getAttribute("aria-hidden")).toBe("true");
    fireEvent.click(link);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
