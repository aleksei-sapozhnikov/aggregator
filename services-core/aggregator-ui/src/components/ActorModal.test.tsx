/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import ActorModal from "./ActorModal";
import type { CatalogActor, CatalogContact } from "../shared/types";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const actor: CatalogActor = {
  id: "experience-team",
  title: "Experience Ownership Team",
  type: "owner",
  description: "Responsible for customer experience.",
};

const contacts: CatalogContact[] = [
  { id: "mail", title: "profile-team@demo.email", type: "email" },
  { id: "teams", title: "Campaign Operations", type: "teams" },
  { id: "discord", title: "Customer Hub", type: "discord" },
];

const renderActorModal = (overrides = {}) => {
  const onOpenContact = vi.fn();
  const onClose = vi.fn();
  return {
    onOpenContact,
    onClose,
    user: userEvent.setup(),
    ...render(
      <ActorModal
        isOpen={true}
        actor={actor}
        contacts={contacts}
        primaryContact={contacts[0]}
        iconSpriteHref="/icons.svg"
        onClose={onClose}
        onOpenContact={onOpenContact}
        {...overrides}
      />,
    ),
  };
};

describe("ActorModal contact list", () => {
  it("shows contact names as text with persistent info buttons, contact icons, and Primary label", () => {
    renderActorModal();
    expect(
      screen
        .getByRole("dialog", { name: "Actor details" })
        .classList.contains("modal-window"),
    ).toBe(true);
    const dialog = screen.getByRole("dialog", { name: "Actor details" });
    expect(dialog.querySelector(".modal-header h2")?.textContent).toBe(
      actor.title,
    );
    expect(dialog.querySelector(".modal-content h2")).toBeNull();
    const list = document.querySelector(".actor-modal-contacts");
    const rows = Array.from(
      list?.querySelectorAll(".actor-modal-contact-row") || [],
    );

    expect(list?.querySelectorAll("a")).toHaveLength(0);
    expect(
      rows.map((row) =>
        row.querySelector(".actor-modal-contact-name")?.textContent?.trim(),
      ),
    ).toEqual([
      "profile-team@demo.email",
      "Campaign Operations",
      "Customer Hub",
    ]);
    expect(
      rows.map((row) =>
        row
          .querySelector("button.entity-info-action")
          ?.getAttribute("aria-label"),
      ),
    ).toEqual([
      "Details for contact: profile-team@demo.email",
      "Details for contact: Campaign Operations",
      "Details for contact: Customer Hub",
    ]);
    expect(list?.querySelectorAll(".contact-chip")).toHaveLength(0);
    expect(list?.querySelectorAll(".chip-prefix")).toHaveLength(0);
    expect(
      Array.from(list?.querySelectorAll(".secondary-label") || [], (role) =>
        role.textContent?.trim(),
      ),
    ).toEqual(["Primary"]);
    expect(rows[0]?.querySelector(".secondary-label")?.textContent).toBe(
      "Primary",
    );
    expect(
      rows[0]?.querySelector(".actor-modal-contact-details .secondary-label"),
    ).toBeNull();
    expect(
      rows.map((row) => row.querySelector("svg use")?.getAttribute("href")),
    ).toEqual([
      "/icons.svg#icon-contact-email",
      "/icons.svg#icon-contact-teams",
      "/icons.svg#icon-contact-discord",
    ]);
  });

  it("labels the designated primary contact rather than assuming the first item", () => {
    renderActorModal({ primaryContact: contacts[2] });
    const rows = Array.from(
      document.querySelectorAll(".actor-modal-contact-row"),
    );

    expect(rows[0].querySelector(".secondary-label")).toBeNull();
    expect(rows[1].querySelector(".secondary-label")).toBeNull();
    expect(rows[2].querySelector(".secondary-label")?.textContent).toBe(
      "Primary",
    );
  });

  it("omits the primary label when no contact is designated", () => {
    renderActorModal({ primaryContact: null });

    expect(document.querySelector(".secondary-label")).toBeNull();
  });

  it("opens contact details only from the information icon", async () => {
    const { user, onOpenContact } = renderActorModal();

    await user.click(screen.getByText("Campaign Operations"));
    expect(onOpenContact).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", {
        name: "Details for contact: Campaign Operations",
      }),
    );
    expect(onOpenContact).toHaveBeenCalledExactlyOnceWith(contacts[1]);
  });

  it("keeps an empty-contact message", () => {
    renderActorModal({ contacts: [] });

    expect(
      screen.getByText("No contacts linked to this actor."),
    ).not.toBeNull();
    expect(document.querySelector(".actor-modal-contacts")).toBeNull();
  });
});
