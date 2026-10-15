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
import InfoHelp from "./InfoHelp";
import { infoHelpTopics, type InfoHelpTopic } from "../shared/infoHelpTopics";

const topic: InfoHelpTopic = {
  title: "Timeline",
  summary: "Learn how to read the timeline.",
  description: "Timeline shows product health over time.",
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("InfoHelp signal examples", () => {
  it.each([
    ["healthySignals", "Healthy dependency signals example"],
    ["unhealthySignals", "Unhealthy dependency propagation example"],
  ] as const)("renders the %s animation in its existing contextual help dialog", (key, label) => {
    render(<InfoHelp topic={infoHelpTopics[key]} />);
    fireEvent.click(screen.getByRole("button", { name: "About " + infoHelpTopics[key].title }));
    const dialog = screen.getByRole("dialog", { name: "About " + infoHelpTopics[key].title });
    expect(dialog.querySelector("figure[aria-label='" + label + "']")).not.toBeNull();
    expect(dialog.querySelectorAll("[data-flow-node]")).toHaveLength(6);
  });
});

describe("InfoHelp Actors example", () => {
  it("shows the relationship animation in the existing Actors dialog", () => {
    render(<InfoHelp topic={infoHelpTopics.actors} />);
    fireEvent.click(screen.getByRole("button", { name: "About Actors" }));
    const dialog = screen.getByRole("dialog", { name: "About Actors" });
    expect(dialog.querySelector("figure[aria-label='Actors become Item ownership and relationship entries']")).not.toBeNull();
    expect(dialog.querySelectorAll("[data-actor]")).toHaveLength(3);
  });
});

describe("InfoHelp tooltip lifecycle", () => {
  it.each(["Escape", "Close button", "Backdrop"] as const)(
    "does not reopen the tooltip after closing its modal via %s",
    async (closeMethod) => {
      render(<InfoHelp topic={topic} />);

      const trigger = screen.getByRole("button", { name: "About Timeline" });
      trigger.focus();
      expect(screen.queryByRole("tooltip")).toBeNull();

      fireEvent.mouseEnter(trigger);
      expect(screen.getByRole("tooltip")).not.toBeNull();

      fireEvent.click(trigger);
      expect(screen.queryByRole("tooltip")).toBeNull();

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
      await waitFor(() => expect(document.activeElement).toBe(trigger));
      expect(screen.queryByRole("tooltip")).toBeNull();

      // Focus restoration and subsequent refocusing must not show hover help.
      trigger.blur();
      trigger.focus();
      expect(screen.queryByRole("tooltip")).toBeNull();

      // A new mouse hover must show the tooltip on its first entry.
      fireEvent.mouseEnter(trigger);
      expect(screen.getByRole("tooltip")).not.toBeNull();

      fireEvent.mouseLeave(trigger);
      expect(screen.queryByRole("tooltip")).toBeNull();
    },
  );
});
