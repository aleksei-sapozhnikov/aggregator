/**
 * @vitest-environment jsdom
 */

import type { ReactElement } from "react";
import ContextualHelpProvider from "../about/ContextualHelpProvider";

import { createRef } from "react";
import { cleanup, fireEvent, render as baseRender, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import type { CatalogActor, CatalogContact } from "../../shared/types";

vi.mock("./ai-chat/AiChatPanel", () => ({
  default: () => null,
}));


// A changed shared markup attribute must reach the live panel and every demo.
// Checking CSS class names alone would also pass for separately copied markup.
vi.mock("../shared/item/ItemTitle", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../shared/item/ItemTitle")>();
  const { cloneElement } = await import("react");
  return { ...actual,
    default: (props: Parameters<typeof actual.default>[0]) => cloneElement(actual.default(props), { "data-shared-revision": "title" }),
  };
});
vi.mock("../shared/item/ItemOwnership", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../shared/item/ItemOwnership")>();
  const { cloneElement } = await import("react");
  return { ...actual,
    default: (props: Parameters<typeof actual.default>[0]) => cloneElement(actual.default(props), { "data-shared-revision": "ownership" }),
  };
});
vi.mock("../shared/item/ItemSignals", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../shared/item/ItemSignals")>();
  const { cloneElement } = await import("react");
  return { ...actual,
    HealthySignals: (props: Parameters<typeof actual.HealthySignals>[0]) => cloneElement(actual.HealthySignals(props), { "data-shared-revision": "HealthySignals" }),
    UnhealthySignals: (props: Parameters<typeof actual.UnhealthySignals>[0]) => cloneElement(actual.UnhealthySignals(props), { "data-shared-revision": "UnhealthySignals" }),
  };
});
vi.mock("../shared/item/ItemTimeline", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../shared/item/ItemTimeline")>();
  const { cloneElement } = await import("react");
  return { ...actual,
    default: (props: Parameters<typeof actual.default>[0]) => cloneElement(actual.default(props), { "data-shared-revision": "timeline" }),
  };
});

import DetailsPanel from "./DetailsPanel";
import ActorsHelpDemo from "../about/actors/ActorsHelpDemo";
import PrimaryContactHelpDemo from "../about/primary-contact/PrimaryContactHelpDemo";
import HealthySignalsHelpDemo from "../about/healthy-signals/HealthySignalsHelpDemo";
import UnhealthySignalsHelpDemo from "../about/unhealthy-signals/UnhealthySignalsHelpDemo";
import TimelineHelpDemo from "../about/timeline/TimelineHelpDemo";

const render = (ui: ReactElement) => {
  const view = baseRender(<ContextualHelpProvider>{ui}</ContextualHelpProvider>);
  return {
    ...view,
    rerender: (next: ReactElement) =>
      view.rerender(<ContextualHelpProvider>{next}</ContextualHelpProvider>),
  };
};

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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
    onOpenSignal: vi.fn(),
    onSelectItemByPath: vi.fn(),
    onOpenActor: vi.fn(),
    passingSignalsCount: 1,
    selectedPassingSignals: [
      { id: "availability", title: "Availability", status: "up" as const },
    ],
    onOpenContact: vi.fn(),
    isTimelineOpen: false,
    onToggleTimeline: vi.fn(),
    onNavigateToTimelineItem: vi.fn(),
    ...overrides,
  };

  return {
    user: userEvent.setup(),
    props,
    ...render(<DetailsPanel {...props} />),
  };
};

describe("DetailsPanel contextual help", () => {
  it("reflects shared markup changes in production and every help scene", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const { container: production } = renderDetailsPanel();
    for (const marker of ["title", "ownership", "HealthySignals", "UnhealthySignals", "timeline"]) {
      expect(production.querySelector(`[data-shared-revision="${marker}"]`)).not.toBeNull();
    }
    const { container: demos } = render(<>
      <div data-demo="actors"><ActorsHelpDemo /></div>
      <div data-demo="contact"><PrimaryContactHelpDemo /></div>
      <div data-demo="healthy"><HealthySignalsHelpDemo /></div>
      <div data-demo="unhealthy"><UnhealthySignalsHelpDemo /></div>
      <div data-demo="timeline"><TimelineHelpDemo /></div>
    </>);
    for (const scene of ["actors", "contact", "healthy", "unhealthy"]) {
      for (const marker of ["title", "ownership"]) {
        expect(demos.querySelector(`[data-demo="${scene}"] [data-shared-revision="${marker}"]`)).not.toBeNull();
      }
    }
    expect(demos.querySelector('[data-demo="healthy"] [data-shared-revision="HealthySignals"]')).not.toBeNull();
    expect(demos.querySelector('[data-demo="unhealthy"] [data-shared-revision="UnhealthySignals"]')).not.toBeNull();
    expect(demos.querySelector('[data-demo="timeline"] [data-shared-revision="timeline"]')).not.toBeNull();
    fireEvent.click(within(demos).getByRole("button", { name: "Open a dependency" }));
    for (const marker of ["title", "ownership", "HealthySignals", "timeline"]) {
      expect(demos.querySelector(`[data-demo="timeline"] [data-shared-revision="${marker}"]`)).not.toBeNull();
    }
  });

  it("renders the selected help controls", () => {
    renderDetailsPanel();

    expect(
      screen.getByRole("button", {
        name: "Catalog information for Checkout",
      }),
    ).not.toBeNull();
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

  it("shows the correct tooltip for a hovered help control", async () => {
    const { user } = renderDetailsPanel();
    const helpButton = screen.getByRole("button", {
      name: "About Unhealthy signals",
    });

    await user.tab();
    fireEvent.focus(helpButton);
    expect(screen.queryByRole("tooltip")).toBeNull();

    fireEvent.mouseEnter(helpButton);

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

  it.each([
    {
      title: "Unhealthy signals",
      remove: { selectedFailingSignals: [], failingDependencies: [] },
      label: "Toggle Unhealthy signals",
    },
    {
      title: "Healthy signals",
      remove: { passingSignalsCount: 0, selectedPassingSignals: [] },
      label: "Toggle Healthy signals",
    },
    {
      title: "Actors",
      remove: { selectedItemActors: null },
      label: "Toggle Actors",
    },
    {
      title: "Primary contact",
      remove: { actorContactsByActorId: new Map() },
      label: "About Primary contact",
    },
    {
      title: "Timeline",
      remove: { selectedItem: undefined },
      label: "Toggle Timeline",
    },
  ])(
    "keeps $title contextual help open after the source section disappears",
    async ({ title, remove, label }) => {
      const { props, rerender, user } = renderDetailsPanel();

      await user.click(screen.getByRole("button", { name: "About " + title }));
      const dialog = screen.getByRole("dialog", { name: "About " + title });
      expect(dialog.textContent).toContain(title);

      rerender(<DetailsPanel {...props} {...remove} />);
      expect(screen.queryByRole("button", { name: label })).toBeNull();
      expect(screen.getByRole("dialog", { name: "About " + title })).toBe(dialog);

      await user.click(screen.getByRole("button", { name: "Close contextual help" }));
      expect(screen.queryByRole("dialog", { name: "About " + title })).toBeNull();
      expect(screen.queryByRole("button", { name: label })).toBeNull();
    },
  );

  it("keeps Timeline help open when the selected Item changes", async () => {
    const { props, rerender, user } = renderDetailsPanel();

    await user.click(screen.getByRole("button", { name: "About Timeline" }));
    const dialog = screen.getByRole("dialog", { name: "About Timeline" });
    rerender(
      <DetailsPanel
        {...props}
        selectedItem={{ id: "payments", title: "Payments Service" }}
        selectedTitleFirstWord="Payments"
        selectedTitleRest="Service"
      />,
    );
    expect(screen.getByRole("dialog", { name: "About Timeline" })).toBe(dialog);
    await user.click(screen.getByRole("button", { name: "Close contextual help" }));
    expect(screen.queryByRole("dialog", { name: "About Timeline" })).toBeNull();
  });

  it("shows catalog short description in the item information tooltip", async () => {
    const { user } = renderDetailsPanel({
      selectedItem: {
        id: "checkout",
        title: "Checkout",
        shortDescription: "Accepts and prepares customer orders.",
        fullDescription:
          "Checkout accepts customer orders and prepares them for downstream processing.",
      },
    });
    const infoButton = screen.getByRole("button", {
      name: "Catalog information for Checkout",
    });

    await user.hover(infoButton);

    expect(screen.getByRole("tooltip").textContent).toBe(
      "Accepts and prepares customer orders.Click for details",
    );
    expect(infoButton.getAttribute("aria-disabled")).toBe("false");
  });

  it("disables catalog item information when no descriptions are present but keeps the tooltip", async () => {
    const { user } = renderDetailsPanel({
      selectedItem: {
        id: "checkout",
        title: "Checkout",
        shortDescription: "   ",
        fullDescription: "",
      },
    });
    const infoButton = screen.getByRole("button", {
      name: "Catalog information for Checkout",
    });

    await user.hover(infoButton);
    expect(screen.getByRole("tooltip").textContent).toBe(
      "No description in catalog",
    );
    expect(infoButton.getAttribute("aria-disabled")).toBe("true");

    await user.click(infoButton);

    expect(
      screen.queryByRole("dialog", {
        name: "Catalog information for Checkout",
      }),
    ).toBeNull();
  });

  it("opens catalog item information with the detailed description", async () => {
    const { user } = renderDetailsPanel({
      selectedItem: {
        id: "checkout",
        title: "Checkout",
        shortDescription: "Accepts and prepares customer orders.",
        fullDescription:
          "Checkout accepts customer orders.\n\nIt prepares them for downstream processing.",
      },
    });

    await user.click(
      screen.getByRole("button", {
        name: "Catalog information for Checkout",
      }),
    );

    const dialog = screen.getByRole("dialog", {
      name: "Catalog information for Checkout",
    });
    expect(dialog.textContent).toContain("Checkout");
    expect(dialog.textContent).toContain("Checkout accepts customer orders.");
    expect(dialog.textContent).toContain(
      "It prepares them for downstream processing.",
    );
    expect(dialog.textContent).not.toContain(
      "No detailed description in catalog.",
    );
    const paragraphs = Array.from(
      dialog.querySelectorAll(".catalog-item-info-content p"),
      (element) => element.textContent,
    );
    expect(paragraphs).toEqual([
      "Accepts and prepares customer orders.",
      "Checkout accepts customer orders.",
      "It prepares them for downstream processing.",
    ]);
  });

  it("falls back to the short description when detailed catalog information is missing", async () => {
    const { user } = renderDetailsPanel({
      selectedItem: {
        id: "checkout",
        title: "Checkout",
        shortDescription: "Accepts and prepares customer orders.",
      },
    });

    await user.click(
      screen.getByRole("button", {
        name: "Catalog information for Checkout",
      }),
    );

    const dialog = screen.getByRole("dialog", {
      name: "Catalog information for Checkout",
    });
    expect(dialog.textContent).toContain(
      "Accepts and prepares customer orders.",
    );
    expect(dialog.textContent).toContain("No detailed description in catalog.");
    const paragraphs = dialog.querySelectorAll(".catalog-item-info-content p");
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].textContent).toBe(
      "Accepts and prepares customer orders.",
    );
    expect(paragraphs[1].querySelector("em")?.textContent).toBe(
      "No detailed description in catalog.",
    );
  });

  it("uses the generic catalog information tooltip when only a detailed description exists", async () => {
    const { user } = renderDetailsPanel({
      selectedItem: {
        id: "checkout",
        title: "Checkout",
        fullDescription: "Checkout accepts customer orders.",
      },
    });
    const infoButton = screen.getByRole("button", {
      name: "Catalog information for Checkout",
    });

    await user.hover(infoButton);
    expect(screen.getByRole("tooltip").textContent).toBe(
      "Click for details",
    );

    await user.click(infoButton);

    const dialog = screen.getByRole("dialog", {
      name: "Catalog information for Checkout",
    });
    expect(dialog.textContent).toContain("Checkout accepts customer orders.");
    expect(dialog.textContent).not.toContain(
      "No detailed description in catalog.",
    );
  });

  it("closes the help modal when clicking the backdrop", async () => {
    const { user } = renderDetailsPanel();

    await user.click(screen.getByRole("button", { name: "About Actors" }));

    const dialog = screen.getByRole("dialog", { name: "About Actors" });
    await user.click(dialog);
    expect(
      screen.queryByRole("dialog", { name: "About Actors" }),
    ).not.toBeNull();

    await user.click(document.querySelector(".modal-overlay") as Element);

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
    const onToggleTimeline = vi.fn();
    const { user } = renderDetailsPanel({ onToggleTimeline });
    const timelineToggle = screen.getByRole("button", {
      name: "Toggle Timeline",
    });
    const timelineLabel = screen.getByText("Timeline");

    expect(timelineToggle.className).toContain("details-disclosure-toggle");
    expect(timelineToggle.contains(timelineLabel)).toBe(true);
    expect(timelineToggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTitle("State Timeline")).toBeNull();

    await user.click(screen.getByRole("button", { name: "About Timeline" }));

    expect(onToggleTimeline).not.toHaveBeenCalled();
    expect(timelineToggle.getAttribute("aria-expanded")).toBe("false");
    const dialog = screen.getByRole("dialog", { name: "About Timeline" });
    expect(dialog.textContent).toContain(
      "Timeline shows the selected Item's [Overall] state, including dependency impact",
    );
    expect(dialog.textContent).toContain("Inspect a moment");
    expect(dialog.textContent).toContain("Switch signal groups");
    expect(dialog.textContent).toContain("Open a dependency");
    expect(dialog.textContent).toContain(
      "were DOWN or UNKNOWN at some point in the selected range",
    );
    expect(dialog.textContent).not.toContain("show: failing");
    expect(dialog.textContent).not.toContain("↺");
  });

  it("keeps the expanded Timeline chart under the disclosure heading", () => {
    renderDetailsPanel({ isTimelineOpen: true });

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

  it("renders actor roles as small supplementary labels without parentheses", () => {
    const { container } = renderDetailsPanel({
      selectedItemActors: {
        owner: ownerActor,
        otherActors: [
          { id: "team-marketing", title: "Marketing Team", type: "user" },
          { id: "team-support", title: "Support Team", type: "other" },
        ],
      },
    });

    expect(
      Array.from(
        container.querySelectorAll(".ownership-extra-list .secondary-label"),
        (role) => role.textContent?.trim(),
      ),
    ).toEqual(["Owner", "User", "Other"]);
    expect(container.querySelectorAll(".details-row-meta")).toHaveLength(0);
  });

  it("uses text modal triggers for actors and healthy signals", () => {
    const { container } = renderDetailsPanel();
    const actors = container.querySelector(".ownership-extra-list");
    const healthy = container.querySelector(".signals-healthy-list");

    const actorTrigger = actors?.querySelector<HTMLButtonElement>(
      "button.modal-details-trigger",
    );
    expect(actorTrigger?.textContent).toBe("Checkout Team");
    expect(actorTrigger?.getAttribute("aria-haspopup")).toBe("dialog");
    expect(actors?.querySelector(".entity-info-action")).toBeNull();

    expect(healthy?.querySelectorAll(".status-indicator")).toHaveLength(0);
    const signalTrigger = healthy?.querySelector<HTMLAnchorElement>(
      "a.modal-details-trigger",
    );
    expect(signalTrigger?.textContent).toBe("Availability");
    expect(signalTrigger?.getAttribute("href")).toBe("#signal/availability");
    expect(signalTrigger?.getAttribute("aria-haspopup")).toBe("dialog");
    expect(
      healthy
        ?.querySelector(".signals-healthy-row")
        ?.getAttribute("aria-label"),
    ).toBe("Availability, Status: UP");
  });

  it("shows unhealthy signals without repeated status icons", () => {
    const { container } = renderDetailsPanel();
    const list = container.querySelector(".details-unhealthy-list");

    expect(list?.querySelectorAll(".status-indicator")).toHaveLength(0);
    expect(
      list
        ?.querySelector(".signals-unhealthy-own-row")
        ?.getAttribute("aria-label"),
    ).toBe("Latency, Status: DOWN");
    expect(
      list
        ?.querySelector(".signals-incident-signal")
        ?.getAttribute("aria-label"),
    ).toBe("Errors, Status: DOWN");
  });

  it("labels only dependency items in Unhealthy signals", () => {
    const { container } = renderDetailsPanel();
    const list = container.querySelector(".details-unhealthy-list");
    const dependencyRows = list?.querySelectorAll(".signals-incident-row");

    expect(dependencyRows).toHaveLength(1);
    expect(
      dependencyRows?.[0].querySelector(
        ".signals-dependency-row .secondary-label",
      )?.textContent,
    ).toBe("Dependency");
    expect(
      dependencyRows?.[0].querySelector(
        ".signals-dependency-row .item-navigation-link-text",
      )?.textContent,
    ).toBe("Payments");
    expect(
      list?.querySelector(".signals-unhealthy-own-row .secondary-label"),
    ).toBeNull();
    expect(
      list?.querySelector(".signals-incident-signal .secondary-label"),
    ).toBeNull();
  });

  it("omits the dependency label when only own signals are unhealthy", () => {
    const { container } = renderDetailsPanel({ failingDependencies: [] });
    const list = container.querySelector(".details-unhealthy-list");

    expect(list?.querySelectorAll(".signals-incident-row")).toHaveLength(0);
    expect(list?.querySelectorAll(".secondary-label")).toHaveLength(0);
    expect(list?.querySelectorAll(".signals-unhealthy-own-row")).toHaveLength(
      1,
    );
  });

  it("keeps modal detail links on signal names and arrows on item navigation", () => {
    const { container } = renderDetailsPanel();

    for (const [selector, id] of [
      [".signals-unhealthy-own-row", "latency"],
      [".signals-incident-signal", "errors"],
      [".signals-healthy-row", "availability"],
    ]) {
      const row = container.querySelector(selector);
      const trigger = row?.querySelector<HTMLAnchorElement>(
        "a.signal-name.modal-details-trigger",
      );
      expect(trigger?.getAttribute("href")).toBe(`#signal/${id}`);
      expect(trigger?.getAttribute("aria-haspopup")).toBe("dialog");
      expect(row?.querySelector(".entity-info-action")).toBeNull();
    }

    const item = container.querySelector<HTMLAnchorElement>(
      ".signals-dependency-row a.item-navigation-link",
    );
    expect(item?.getAttribute("href")).toBe("/items/payments");
    expect(item?.querySelector(".item-navigation-link-text")?.textContent).toBe(
      "Payments",
    );
    expect(
      item?.querySelector(".item-navigation-link-arrow")?.textContent?.trim(),
    ).toBe("→");
  });

  it("opens an Actor modal from the actor name", async () => {
    const { user, props } = renderDetailsPanel();

    await user.click(screen.getByRole("button", { name: "Checkout Team" }));
    expect(props.onOpenActor).toHaveBeenCalledWith(ownerActor);
  });

  it("opens the primary contact modal from its name", async () => {
    const { user, props } = renderDetailsPanel();

    await user.click(screen.getByRole("button", { name: "Checkout Chat" }));
    expect(props.onOpenContact).toHaveBeenCalledWith(primaryContact);
  });

  it("forwards a signal selection to the application without navigating", async () => {
    const { user, props } = renderDetailsPanel();
    await user.click(screen.getByRole("link", { name: "Latency" }));
    expect(props.onOpenSignal).toHaveBeenCalledWith({
      id: "latency", title: "Latency", status: "down",
    });
    expect(window.location.hash).toBe("");
  });

  it("keeps unknown unhealthy states explicitly visible", () => {
    const { container } = renderDetailsPanel({
      selectedFailingSignals: [
        { id: "latency", title: "Latency", status: "unknown" },
      ],
      failingDependencies: [],
    });
    const unknownLabel = container.querySelector(
      ".details-unhealthy-list .signal-unknown-label",
    );

    expect(unknownLabel?.textContent).toBe("UNKNOWN");
  });

  it("toggles Timeline from its visible label text", async () => {
    const onToggleTimeline = vi.fn();
    const { user } = renderDetailsPanel({ onToggleTimeline });

    await user.click(screen.getByText("Timeline"));

    expect(onToggleTimeline).toHaveBeenCalledTimes(1);
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
    const onToggleTimeline = vi.fn();
    renderDetailsPanel({ onToggleTimeline });
    const timelineToggle = screen.getByRole("button", {
      name: "Toggle Timeline",
    });

    fireEvent.pointerDown(timelineToggle, { clientX: 10, clientY: 10 });
    selectedText = "previous selection";
    fireEvent.pointerUp(timelineToggle, { clientX: 10, clientY: 10 });
    fireEvent.click(timelineToggle);

    expect(onToggleTimeline).toHaveBeenCalledTimes(1);
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
    const onToggleTimeline = vi.fn();
    renderDetailsPanel({ onToggleTimeline });
    const timelineToggle = screen.getByRole("button", {
      name: "Toggle Timeline",
    });

    fireEvent.pointerDown(timelineToggle, { clientX: 10, clientY: 10 });
    selectedText = "Timeline";
    fireEvent.pointerUp(timelineToggle, { clientX: 10, clientY: 10 });
    fireEvent.click(timelineToggle);

    expect(onToggleTimeline).not.toHaveBeenCalled();
  });

  it("does not toggle a disclosure after dragging across its label", () => {
    const onToggleTimeline = vi.fn();
    renderDetailsPanel({ onToggleTimeline });
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

    expect(onToggleTimeline).not.toHaveBeenCalled();
  });
});
