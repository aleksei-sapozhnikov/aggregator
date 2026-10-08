/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import ContactModal from "./ContactModal";
import type { CatalogContact } from "../shared/types";

afterEach(() => {
  cleanup();
});

const renderContactModal = (contact: CatalogContact) => ({
  user: userEvent.setup(),
  ...render(
    <ContactModal isOpen={true} contact={contact} onClose={vi.fn()} />,
  ),
});

describe("ContactModal demo help", () => {
  it("shows mail-specific help and removes the old footer note", async () => {
    const { user } = renderContactModal({
      id: "ct_mail",
      title: "profile-team@demo.email",
      type: "email",
    });

    expect(screen.getByRole("button", { name: "About Mail preview" })).not.toBeNull();
    expect(screen.queryByText(/Demo: the catalog link opened/i)).toBeNull();
    expect(screen.queryByText(/In a real setup/i)).toBeNull();

    await user.hover(screen.getByRole("button", { name: "About Mail preview" }));

    expect(screen.getByRole("tooltip").textContent).toBe(
      "Demo email workflow. Click for details.",
    );

    await user.click(screen.getByRole("button", { name: "About Mail preview" }));

    const dialog = screen.getByRole("dialog", { name: "About Mail preview" });
    expect(dialog.textContent).toContain(
      "simulates opening Mail, addressing profile-team@demo.email",
    );
    expect(window.getComputedStyle(dialog).whiteSpace).not.toBe("nowrap");
    expect(dialog.textContent).toContain("URL defined in catalog now");
    expect(dialog.textContent).toContain("Example real URL for catalog");
    expect(dialog.textContent).toContain("/contacts/ct_mail");
    expect(dialog.textContent).toContain("mailto:profile-team@demo.email");
  });

  it("uses phone-specific help copy", async () => {
    const { user } = renderContactModal({
      id: "ct_phone",
      title: "+1 555 0100",
      type: "phone",
    });

    await user.click(screen.getByRole("button", { name: "About Phone preview" }));

    const dialog = screen.getByRole("dialog", { name: "About Phone preview" });
    expect(dialog.textContent).toContain("simulates opening Phone, calling +1 555 0100");
    expect(dialog.textContent).toContain("tel:+15550100");
  });

  it("uses on-call-specific help copy", async () => {
    const { user } = renderContactModal({
      id: "ct_pagerduty",
      title: "Checkout escalation",
      type: "pagerduty",
    });

    await user.click(
      screen.getByRole("button", { name: "About PagerDuty preview" }),
    );

    const dialog = screen.getByRole("dialog", {
      name: "About PagerDuty preview",
    });
    expect(dialog.textContent).toContain(
      "simulates opening PagerDuty, creating a service-problem incident for Checkout escalation",
    );
    expect(dialog.textContent).toContain(
      "https://example.pagerduty.com/escalation_policies/ct_pagerduty",
    );
  });
});
