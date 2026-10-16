/**
 * @vitest-environment jsdom
 */

import {
  cleanup,
  fireEvent,
  render as baseRender,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  openHelpDialogFromHover,
  expectTooltipAfterModalClose,
} from "../shared/help/helpTestAssertions";
import InfoHelp from "../shared/help/InfoHelp";
import ContextualHelpProvider from "./ContextualHelpProvider";
import type { ReactElement } from "react";
import { healthySignalsHelp } from "./healthy-signals/HealthySignalsHelpContent";
import { unhealthySignalsHelp } from "./unhealthy-signals/UnhealthySignalsHelpContent";
import { actorsHelp } from "./actors/ActorsHelpContent";
import type { HelpTopic } from "../shared/help/HelpContext";

const infoHelpTopics = {
  healthySignals: { ...healthySignalsHelp, id: "healthy-signals" },
  unhealthySignals: { ...unhealthySignalsHelp, id: "unhealthy-signals" },
  actors: { ...actorsHelp, id: "actors" },
};

const topic: HelpTopic = {
  title: "Timeline",
  summary: "Learn how to read the timeline.",
  description: "Timeline shows product health over time.",
};

const render = (ui: ReactElement) =>
  baseRender(<ContextualHelpProvider>{ui}</ContextualHelpProvider>);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("InfoHelp signal examples", () => {
  it.each([
    ["healthySignals", "Healthy dependency signals example"],
    ["unhealthySignals", "Unhealthy dependency propagation example"],
  ] as const)(
    "renders the %s animation in its existing contextual help dialog",
    (key, label) => {
      render(<InfoHelp topicId={infoHelpTopics[key].id} />);
      fireEvent.click(
        screen.getByRole("button", {
          name: "About " + infoHelpTopics[key].title,
        }),
      );
      const dialog = screen.getByRole("dialog", {
        name: "About " + infoHelpTopics[key].title,
      });
      expect(
        dialog.querySelector("figure[aria-label='" + label + "']"),
      ).not.toBeNull();
      expect(dialog.querySelectorAll("[data-flow-node]")).toHaveLength(6);
    },
  );
});

describe("InfoHelp Actors example", () => {
  it("shows the relationship animation in the existing Actors dialog", () => {
    render(<InfoHelp topicId="actors" />);
    fireEvent.click(screen.getByRole("button", { name: "About Actors" }));
    const dialog = screen.getByRole("dialog", { name: "About Actors" });
    expect(
      dialog.querySelector(
        "figure[aria-label='Actors become Item ownership and relationship entries']",
      ),
    ).not.toBeNull();
    expect(dialog.querySelectorAll("[data-actor]")).toHaveLength(3);
  });
});

describe("InfoHelp tooltip lifecycle", () => {
  it.each(["Escape", "Close button", "Backdrop"] as const)(
    "does not reopen the tooltip after closing its modal via %s",
    async (closeMethod) => {
      render(<InfoHelp topic={topic} />);

      const trigger = screen.getByRole("button", { name: "About Timeline" });
      openHelpDialogFromHover(trigger);

      const dialog = screen.getByRole("dialog", { name: "About Timeline" });
      await waitFor(() => expect(document.activeElement).toBe(dialog));

      if (closeMethod === "Escape") {
        fireEvent.keyDown(window, { key: "Escape" });
      } else if (closeMethod === "Close button") {
        fireEvent.click(
          screen.getByRole("button", { name: "Close contextual help" }),
        );
      } else {
        fireEvent.click(dialog.parentElement as Element);
      }

      expect(
        screen.queryByRole("dialog", { name: "About Timeline" }),
      ).toBeNull();
      await expectTooltipAfterModalClose(trigger);
    },
  );
});
