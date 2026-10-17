/**
 * @vitest-environment jsdom
 */

/** @file Tests actor dialog roles, labels, and contact presentation. */

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import ActorModal from "./ActorModal";
import type { CatalogActor, CatalogContact } from "../../../shared/types";

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
  it("shows contact names as modal triggers with contact icons and Primary label", () => {
    renderActorModal();
    const dialog = screen.getByRole("dialog", { name: "Actor details" });
    expect(dialog.classList.contains("modal-window")).toBe(true);
    expect(dialog.querySelector(".modal-header h2")?.textContent).toBe(
      actor.title,
    );
    expect(dialog.querySelector(".modal-content h2")).toBeNull();

    const list = dialog.querySelector(".actor-modal-contacts");
    const rows = Array.from(
      list?.querySelectorAll(".actor-modal-contact-row") || [],
    );
    const triggers = rows.map((row) =>
      row.querySelector<HTMLButtonElement>("button.modal-details-trigger"),
    );

    expect(list?.querySelectorAll("a")).toHaveLength(0);
    expect(triggers.map((button) => button?.textContent?.trim())).toEqual([
      "profile-team@demo.email",
      "Campaign Operations",
      "Customer Hub",
    ]);
    expect(
      triggers.every(
        (button) => button?.getAttribute("aria-haspopup") === "dialog",
      ),
    ).toBe(true);
    expect(list?.querySelector(".entity-info-action")).toBeNull();
    expect(
      Array.from(list?.querySelectorAll(".secondary-label") || [], (role) =>
        role.textContent?.trim(),
      ),
    ).toEqual(["Primary"]);
    expect(rows[0].querySelector(".secondary-label")?.textContent).toBe(
      "Primary",
    );
    expect(
      rows.map((row) => row.querySelector("svg use")?.getAttribute("href")),
    ).toEqual([
      "/icons.svg#icon-contact-email",
      "/icons.svg#icon-contact-teams",
      "/icons.svg#icon-contact-discord",
    ]);
  });

  it("uses the shared modal paragraph style for actor descriptions", () => {
    const description = "Owns dispatch orchestration.\nLeads operational response.";
    const { container } = renderActorModal({
      actor: { ...actor, description },
    });
    const block = container.querySelector(".actor-modal-description");
    expect(block?.classList.contains("modal-text-flow")).toBe(true);
    expect(Array.from(block?.querySelectorAll("p") || [], (p) => p.textContent)).toEqual([
      "Owns dispatch orchestration.",
      "Leads operational response.",
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

  it("opens contact details from the contact name", async () => {
    const { user, onOpenContact } = renderActorModal();

    await user.click(
      screen.getByRole("button", { name: "Campaign Operations" }),
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
