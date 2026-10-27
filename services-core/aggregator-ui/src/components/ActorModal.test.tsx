/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  it("shows compact icon-and-link rows without chips or extra labels", () => {
    renderActorModal();
    expect(
      screen
        .getByRole("dialog", { name: "Actor details" })
        .classList.contains("modal-window"),
    ).toBe(true);
    const list = document.querySelector(".actor-modal-contacts");
    const links = Array.from(list?.querySelectorAll("a") || []);

    expect(links.map((link) => link.textContent?.trim())).toEqual([
      "profile-team@demo.email",
      "Campaign Operations",
      "Customer Hub",
    ]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/contacts/mail",
      "/contacts/teams",
      "/contacts/discord",
    ]);
    expect(list?.querySelectorAll(".contact-chip")).toHaveLength(0);
    expect(list?.querySelectorAll(".chip-prefix")).toHaveLength(0);
    expect(
      Array.from(list?.querySelectorAll(".actor-role") || [], (role) =>
        role.textContent?.trim(),
      ),
    ).toEqual(["Primary"]);
    expect(
      links[0]?.parentElement?.querySelector(".actor-role")?.textContent,
    ).toBe("Primary");
    expect(links[0]?.querySelector(".actor-role")).toBeNull();
    expect(
      links.map((link) => link.querySelector("svg use")?.getAttribute("href")),
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

    expect(rows[0].querySelector(".actor-role")).toBeNull();
    expect(rows[1].querySelector(".actor-role")).toBeNull();
    expect(rows[2].querySelector(".actor-role")?.textContent).toBe("Primary");
  });

  it("omits the primary label when no contact is designated", () => {
    renderActorModal({ primaryContact: null });

    expect(document.querySelector(".actor-role")).toBeNull();
  });

  it("opens contact details on a plain click but preserves modified links", async () => {
    const { user, onOpenContact } = renderActorModal();
    const contactLink = screen.getByRole("link", {
      name: "Campaign Operations",
    });

    await user.click(contactLink);
    expect(onOpenContact).toHaveBeenCalledExactlyOnceWith(contacts[1]);

    fireEvent.click(contactLink, { ctrlKey: true });
    expect(onOpenContact).toHaveBeenCalledTimes(1);
  });

  it("keeps an empty-contact message", () => {
    renderActorModal({ contacts: [] });

    expect(
      screen.getByText("No contacts linked to this actor."),
    ).not.toBeNull();
    expect(document.querySelector(".actor-modal-contacts")).toBeNull();
  });
});
