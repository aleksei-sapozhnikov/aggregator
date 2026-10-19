/**
 * @vitest-environment jsdom
 */

import { createRef } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CatalogActor, CatalogContact } from "../shared/types";

vi.mock("./AiChatPanel", () => ({
  default: () => null,
}));

import DetailsPanel from "./DetailsPanel";

afterEach(() => {
  cleanup();
});

const ownerActor: CatalogActor = {
  id: "team-checkout",
  title: "Checkout Team",
  type: "owner",
};

const primaryContact: CatalogContact = {
  id: "checkout-chat",
  title: "Checkout Chat",
  type: "chat",
  href: "https://example.test/chat",
};

const renderDetailsPanel = () => {
  const props = {
    contentRef: createRef<HTMLElement>(),
    isSidebarOpen: true,
    iconSpriteHref: "/icons.svg",
    onToggleSidebar: vi.fn(),
    shouldOffsetContentHeader: false,
    isTitlePrimaryBelowControls: false,
    headerRef: createRef<HTMLElement>(),
    headerActionsRef: createRef<HTMLDivElement>(),
    theme: "light" as const,
    isAiChatOpen: false,
    onCloseAiChat: vi.fn(),
    onToggleAiChat: vi.fn(),
    onToggleTheme: vi.fn(),
    onOpenFeedback: vi.fn(),
    onOpenAbout: vi.fn(),
    selectedItem: { id: "checkout", title: "Checkout" },
    selectedStatus: "down" as const,
    lastUpdated: "2026-10-08T12:00:00Z",
    selectedTitleFirstWord: "Checkout",
    selectedTitleRest: "",
    contentTitlePrimaryRef: createRef<HTMLElement>(),
    selectedFailingSignals: [
      { id: "latency", title: "Latency", status: "down" as const },
    ],
    failingDependencies: [
      {
        id: "payments",
        name: "Payments",
        path: ["checkout", "payments"],
        status: "down" as const,
        failingSignals: [
          { id: "errors", title: "Errors", status: "down" as const },
        ],
        failingCountContribution: 1,
      },
    ],
    selectedItemActors: {
      owner: ownerActor,
      otherActors: [],
    },
    actorContactsByActorId: new Map([
      [
        ownerActor.id,
        {
          contacts: [primaryContact],
          primaryContact,
        },
      ],
    ]),
    buildItemLink: (itemId: string) => `/items/${itemId}`,
    onSelectItemById: vi.fn(),
    onSelectItemByPath: vi.fn(),
    onOpenActor: vi.fn(),
    passingSignalsCount: 1,
    selectedPassingSignals: [
      { id: "availability", title: "Availability", status: "up" as const },
    ],
    onOpenContact: vi.fn(),
    isGrafanaOpen: false,
    onToggleGrafana: vi.fn(),
    grafanaHeight: 0,
    grafanaIframeRef: createRef<HTMLIFrameElement>(),
    onGrafanaLoad: vi.fn(),
    grafanaFrameUrl: "about:blank",
  };

  return {
    user: userEvent.setup(),
    ...render(<DetailsPanel {...props} />),
  };
};

describe("DetailsPanel contextual help", () => {
  it("renders the selected help controls", () => {
    renderDetailsPanel();

    expect(
      screen.getByRole("button", { name: "About Primary contact" }),
    ).not.toBeNull();
    expect(screen.getByRole("button", { name: "About Actors" })).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "About Unhealthy signals" }),
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "About Healthy signals" }),
    ).not.toBeNull();
  });

  it("shows the correct tooltip for a focused help control", async () => {
    const { user } = renderDetailsPanel();
    const helpButton = screen.getByRole("button", {
      name: "About Unhealthy signals",
    });

    await user.tab();
    fireEvent.focus(helpButton);

    const tooltip = screen.getByRole("tooltip");
    expect(tooltip.textContent).toBe(
      "Signals currently contributing to this item's unhealthy state. Click for details.",
    );
    expect(helpButton.getAttribute("aria-describedby")).toBe(tooltip.id);
  });

  it("opens and closes the matching help modal", async () => {
    const { user } = renderDetailsPanel();

    await user.click(
      screen.getByRole("button", { name: "About Healthy signals" }),
    );

    const dialog = screen.getByRole("dialog", {
      name: "About Healthy signals",
    });
    expect(dialog.textContent).toContain("Healthy signals");
    expect(dialog.textContent).toContain(
      "Healthy signals are the selected item's own health signals that are currently passing.",
    );

    await user.click(
      screen.getByRole("button", { name: "Close contextual help" }),
    );

    expect(
      screen.queryByRole("dialog", { name: "About Healthy signals" }),
    ).toBeNull();
  });

  it("closes the help modal when clicking the backdrop", async () => {
    const { user } = renderDetailsPanel();

    await user.click(screen.getByRole("button", { name: "About Actors" }));

    const dialog = screen.getByRole("dialog", { name: "About Actors" });
    await user.click(dialog);

    expect(screen.queryByRole("dialog", { name: "About Actors" })).toBeNull();
  });

  it("does not toggle a disclosure when clicking adjacent help", async () => {
    const { user } = renderDetailsPanel();
    const actorsToggle = screen.getByRole("button", { name: "Actors (1)" });

    expect(actorsToggle.getAttribute("aria-expanded")).toBe("false");

    await user.click(screen.getByRole("button", { name: "About Actors" }));

    expect(actorsToggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByRole("dialog", { name: "About Actors" })).not.toBeNull();
  });

  it("keeps disclosure expand and collapse behavior unchanged", async () => {
    const { user } = renderDetailsPanel();
    const actorsToggle = screen.getByRole("button", { name: "Actors (1)" });
    const unhealthyToggle = screen.getByRole("button", {
      name: "Unhealthy signals (2)",
    });
    const healthyToggle = screen.getByRole("button", {
      name: "Healthy signals (1)",
    });

    await user.click(actorsToggle);
    expect(actorsToggle.getAttribute("aria-expanded")).toBe("true");
    await user.click(actorsToggle);
    expect(actorsToggle.getAttribute("aria-expanded")).toBe("false");

    expect(unhealthyToggle.getAttribute("aria-expanded")).toBe("true");
    await user.click(unhealthyToggle);
    expect(unhealthyToggle.getAttribute("aria-expanded")).toBe("false");

    expect(healthyToggle.getAttribute("aria-expanded")).toBe("false");
    await user.click(healthyToggle);
    expect(healthyToggle.getAttribute("aria-expanded")).toBe("true");
  });
});
