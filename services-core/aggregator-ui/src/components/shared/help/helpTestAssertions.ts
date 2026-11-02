/**
 * Shared assertions for the reusable help UI behavior.
 * Test-only utilities; application components must not import this module.
 */
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { expect } from "vitest";

export function expectDecorativeSceneShield(figure: HTMLElement): void {
  const shield = figure.querySelector(".help-interaction-shield");
  expect(shield).not.toBeNull();
  expect(shield?.getAttribute("aria-hidden")).toBe("true");
  expect(figure.lastElementChild).toBe(shield);
  expect(shield?.previousElementSibling?.classList.contains("help-scene")).toBe(
    true,
  );
  expect(figure.querySelector(".help-animation-progress")).not.toBeNull();
}

export function openHelpDialogFromHover(trigger: HTMLElement): void {
  trigger.focus();
  expect(screen.queryByRole("tooltip")).toBeNull();

  fireEvent.mouseEnter(trigger);
  expect(screen.getByRole("tooltip")).not.toBeNull();

  fireEvent.click(trigger);
  expect(screen.queryByRole("tooltip")).toBeNull();
}

export async function expectTooltipAfterModalClose(
  trigger: HTMLElement,
): Promise<void> {
  await waitFor(() => expect(document.activeElement).toBe(trigger));
  expect(screen.queryByRole("tooltip")).toBeNull();

  // Focus restoration and subsequent focusing must not show hover help.
  trigger.blur();
  trigger.focus();
  expect(screen.queryByRole("tooltip")).toBeNull();

  // The first new mouse hover must show help, without an extra hover cycle.
  fireEvent.mouseEnter(trigger);
  expect(screen.getByRole("tooltip")).not.toBeNull();

  fireEvent.mouseLeave(trigger);
  expect(screen.queryByRole("tooltip")).toBeNull();
}
