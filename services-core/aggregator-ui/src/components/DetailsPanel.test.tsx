/**
 * @vitest-environment jsdom
 */

import { createRef } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import type { CatalogActor, CatalogContact } from "../shared/types";

vi.mock("./AiChatPanel", () => ({
  default: () => null,
}));

import DetailsPanel from "./DetailsPanel";

afterEach(() => {
  vi.restoreAllMocks();
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

const renderDetailsPanel = (
  overrides: Partial<ComponentProps<typeof DetailsPanel>> = {},
) => {
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
    ...overrides,
  };

  return {
    user: userEvent.setup(),
    props,
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
    expect(
      screen.getByRole("button", { name: "About Timeline" }),
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
    const actorsToggle = screen.getByRole("button", {
      name: "Toggle Actors",
    });

    expect(actorsToggle.getAttribute("aria-expanded")).toBe("false");

    await user.click(screen.getByRole("button", { name: "About Actors" }));

    expect(actorsToggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByRole("dialog", { name: "About Actors" })).not.toBeNull();
  });

  it("renders Timeline as a standard disclosure with contextual help", async () => {
    const onToggleGrafana = vi.fn();
    const { user } = renderDetailsPanel({ onToggleGrafana });
    const timelineToggle = screen.getByRole("button", {
      name: "Toggle Timeline",
    });
    const timelineLabel = screen.getByText("Timeline");

    expect(timelineToggle.className).toContain("details-disclosure-toggle");
    expect(timelineToggle.contains(timelineLabel)).toBe(true);
    expect(timelineToggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTitle("State Timeline")).toBeNull();

    await user.click(screen.getByRole("button", { name: "About Timeline" }));

    expect(onToggleGrafana).not.toHaveBeenCalled();
    expect(timelineToggle.getAttribute("aria-expanded")).toBe("false");
    const dialog = screen.getByRole("dialog", { name: "About Timeline" });
    expect(dialog.textContent).toContain(
      "Timeline shows how the selected item's health changes over time.",
    );
    expect(dialog.textContent).toContain("Green");
    expect(dialog.textContent).toContain("Signals filter");
    expect(dialog.textContent).toContain("Dependencies");
    expect(dialog.textContent).toContain(
      "were unhealthy or had an unknown state at some point during the selected time range",
    );
    expect(dialog.textContent).not.toContain("show: failing");
    expect(dialog.textContent).not.toContain("↺");
  });

  it("keeps the expanded Timeline chart under the disclosure heading", () => {
    renderDetailsPanel({ isGrafanaOpen: true });

    const timelineToggle = screen.getByRole("button", {
      name: "Toggle Timeline",
    });
    expect(timelineToggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByTitle("State Timeline")).not.toBeNull();
  });

  it("keeps disclosure expand and collapse behavior unchanged", async () => {
    const { user } = renderDetailsPanel();
    const actorsToggle = screen.getByRole("button", {
      name: "Toggle Actors",
    });
    const unhealthyToggle = screen.getByRole("button", {
      name: "Toggle Unhealthy signals",
    });
    const healthyToggle = screen.getByRole("button", {
      name: "Toggle Healthy signals",
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

  it("toggles Timeline from its visible label text", async () => {
    const onToggleGrafana = vi.fn();
    const { user } = renderDetailsPanel({ onToggleGrafana });

    await user.click(screen.getByText("Timeline"));

    expect(onToggleGrafana).toHaveBeenCalledTimes(1);
  });

  it("does not let old text selection block the next disclosure click", () => {
    let selectedText = "previous selection";
    vi.spyOn(window, "getSelection").mockImplementation(
      () =>
        ({
          isCollapsed: false,
          toString: () => selectedText,
        }) as Selection,
    );
    const onToggleGrafana = vi.fn();
    renderDetailsPanel({ onToggleGrafana });
    const timelineToggle = screen.getByRole("button", {
      name: "Toggle Timeline",
    });

    fireEvent.pointerDown(timelineToggle, { clientX: 10, clientY: 10 });
    selectedText = "previous selection";
    fireEvent.pointerUp(timelineToggle, { clientX: 10, clientY: 10 });
    fireEvent.click(timelineToggle);

    expect(onToggleGrafana).toHaveBeenCalledTimes(1);
  });

  it("does not toggle a disclosure when the pointer gesture creates text selection", () => {
    let selectedText = "";
    vi.spyOn(window, "getSelection").mockImplementation(
      () =>
        ({
          isCollapsed: selectedText === "",
          toString: () => selectedText,
        }) as Selection,
    );
    const onToggleGrafana = vi.fn();
    renderDetailsPanel({ onToggleGrafana });
    const timelineToggle = screen.getByRole("button", {
      name: "Toggle Timeline",
    });

    fireEvent.pointerDown(timelineToggle, { clientX: 10, clientY: 10 });
    selectedText = "Timeline";
    fireEvent.pointerUp(timelineToggle, { clientX: 10, clientY: 10 });
    fireEvent.click(timelineToggle);

    expect(onToggleGrafana).not.toHaveBeenCalled();
  });

  it("does not toggle a disclosure after dragging across its label", () => {
    const onToggleGrafana = vi.fn();
    renderDetailsPanel({ onToggleGrafana });
    const timelineToggle = screen.getByRole("button", {
      name: "Toggle Timeline",
    });

    fireEvent(
      timelineToggle,
      new MouseEvent("pointerdown", {
        bubbles: true,
        clientX: 10,
        clientY: 10,
      }),
    );
    fireEvent(
      timelineToggle,
      new MouseEvent("pointermove", {
        bubbles: true,
        clientX: 17,
        clientY: 10,
      }),
    );
    fireEvent(
      timelineToggle,
      new MouseEvent("pointerup", {
        bubbles: true,
        clientX: 17,
        clientY: 10,
      }),
    );
    fireEvent.click(timelineToggle);

    expect(onToggleGrafana).not.toHaveBeenCalled();
  });
});
