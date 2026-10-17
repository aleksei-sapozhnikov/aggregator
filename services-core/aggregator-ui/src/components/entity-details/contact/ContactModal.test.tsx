/**
 * @vitest-environment jsdom
 */

/** @file Tests contact dialogs and their safe simulated channel interactions. */

import type { ReactElement } from "react";
import ContextualHelpProvider from "../../about/ContextualHelpProvider";

import {
  act,
  cleanup,
  render as baseRender,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import ContactModal from "./ContactModal";
import type { CatalogContact } from "../../../shared/types";

const render = (ui: ReactElement) => {
  const view = baseRender(
    <ContextualHelpProvider>{ui}</ContextualHelpProvider>,
  );
  return {
    ...view,
    rerender: (next: ReactElement) =>
      view.rerender(<ContextualHelpProvider>{next}</ContextualHelpProvider>),
  };
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const renderContactModal = (contact: CatalogContact) => ({
  user: userEvent.setup(),
  ...render(<ContactModal isOpen={true} contact={contact} onClose={vi.fn()} />),
});

const previewCases: Array<{
  contact: CatalogContact;
  demoClass: string;
  clientClass: string;
}> = [
  {
    contact: { id: "ct_mail", title: "profile-team@demo.email", type: "email" },
    demoClass: "contact-demo-email",
    clientClass: "contact-client-mail",
  },
  {
    contact: { id: "ct_slack", title: "Checkout Ops", type: "slack" },
    demoClass: "contact-demo-chat",
    clientClass: "contact-client-slack",
  },
  {
    contact: { id: "ct_phone", title: "+1 555 0100", type: "phone" },
    demoClass: "contact-demo-phone",
    clientClass: "contact-client-phone",
  },
  {
    contact: { id: "ct_sms", title: "+1 555 0101", type: "sms" },
    demoClass: "contact-demo-chat",
    clientClass: "contact-client-messages",
  },
  {
    contact: {
      id: "ct_opsgenie",
      title: "Checkout escalation",
      type: "opsgenie",
    },
    demoClass: "contact-demo-oncall",
    clientClass: "contact-client-opsgenie",
  },
  {
    contact: { id: "ct_other", title: "Runbook", type: "other" },
    demoClass: "contact-demo-generic",
    clientClass: "contact-client-generic",
  },
];

describe("ContactModal demo help", () => {
  it.each(previewCases)(
    "renders the $contact.type preview inside the shared full-area contact body",
    ({ contact, demoClass, clientClass }) => {
      renderContactModal(contact);

      const body = document.querySelector(".contact-modal-body");
      const preview = body?.querySelector(".contact-demo");

      expect(body).not.toBeNull();
      expect(preview).not.toBeNull();
      expect(preview?.classList).toContain(demoClass);
      expect(preview?.classList).toContain(clientClass);
      const dialog = screen.getByRole("dialog", { name: "Contact details" });
      const header = dialog.querySelector(".modal-header");
      expect(header?.querySelector(".contact-demo-window-bar")).not.toBeNull();
      expect(
        header?.querySelector(".contact-demo-window-bar")?.classList,
      ).toContain(clientClass);
      expect(preview?.querySelector(".contact-demo-window-bar")).toBeNull();
      expect(dialog.querySelectorAll(".contact-demo-window-bar")).toHaveLength(
        1,
      );
      expect(screen.getByRole("dialog", { name: "Contact details" })).toBe(
        document.querySelector(".modal-window"),
      );
    },
  );

  it("keeps contact preview sizing free of obsolete fixed heights", () => {
    const styles = readFileSync(resolve("src", "styles.css"), "utf8");

    expect(styles).toMatch(
      /\.contact-demo\s*\{[^}]*overflow-x:\s*hidden;[^}]*overflow-y:\s*auto;[^}]*overscroll-behavior:\s*contain;/s,
    );
    expect(styles).not.toMatch(
      /\.contact-demo-email\s*{[^}]*height:\s*min\(460px/s,
    );
    expect(styles).not.toMatch(
      /\.contact-demo-chat\s*{[^}]*height:\s*min\(420px/s,
    );
    expect(styles).not.toMatch(
      /\.contact-demo-phone\s*{[^}]*height:\s*min\(400px/s,
    );
    expect(styles).not.toMatch(
      /\.contact-demo-oncall\s*{[^}]*height:\s*min\(360px/s,
    );
    expect(styles).not.toMatch(/padding:\s*24px\s+76px\s+20px\s+24px/);
    expect(styles).not.toMatch(/padding:\s*18px\s+64px\s+18px\s+18px/);
  });

  it("keeps chat messages in their own scrollable area above the composer", () => {
    const styles = readFileSync(resolve("src", "styles.css"), "utf8");

    expect(styles).toMatch(/\.contact-demo-chat\s*\{[^}]*overflow:\s*hidden;/s);
    expect(styles).toMatch(
      /\.contact-chat-thread\s*\{[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/s,
    );
    expect(styles).toMatch(/\.contact-chat-bubble\s*\{[^}]*flex:\s*0 0 auto;/s);
  });

  it.each([
    { type: "slack", label: "#alerts" },
    { type: "teams", label: "Operations Team" },
    { type: "sms", label: "+1 555 0101" },
  ] as const)(
    "removes the $type chat composer after the response appears",
    ({ type, label }) => {
      vi.useFakeTimers();
      render(
        <ContactModal
          isOpen={true}
          contact={{ id: `test-${type}`, title: label, type }}
          onClose={vi.fn()}
        />,
      );

      const thread = document.querySelector(".contact-chat-thread");
      expect(thread).not.toBeNull();
      expect(document.querySelector(".contact-chat-composer")).not.toBeNull();
      expect(thread?.querySelector(".contact-chat-bubble-in")).toBeNull();

      Object.defineProperty(thread, "scrollHeight", {
        configurable: true,
        value: 300,
      });

      act(() => {
        vi.advanceTimersByTime(20000);
      });

      expect(thread?.querySelector(".contact-chat-bubble-out")).not.toBeNull();
      expect(thread?.querySelector(".contact-chat-bubble-in")).not.toBeNull();
      expect(document.querySelector(".contact-chat-composer")).toBeNull();
      expect((thread as HTMLElement).scrollTop).toBe(300);
    },
  );

  it("lets animated non-chat previews overflow instead of squeezing content", () => {
    const styles = readFileSync(resolve("src", "styles.css"), "utf8");

    for (const className of [
      "contact-email-compose",
      "contact-email-body",
      "contact-phone-screen",
      "contact-oncall-layout",
      "contact-oncall-activity-panel",
      "contact-generic-card",
    ]) {
      const declarations = Array.from(
        styles.matchAll(new RegExp(`\\.${className}\\s*\\{([^}]*)\\}`, "gs")),
        (match) => match[1],
      );
      expect(
        declarations.some((declaration) =>
          declaration.includes("min-height: max-content;"),
        ),
      ).toBe(true);
    }
    expect(styles).toMatch(/\.contact-phone-line\s*\{\s*flex:\s*0 0 auto;/s);
  });

  it.each([
    { type: "email", label: "ops@demo.email" },
    { type: "phone", label: "+1 555 0112" },
    { type: "opsgenie", label: "Production On Call" },
    { type: "pagerduty", label: "Escalation" },
  ] as const)(
    "reveals the latest $type step when the preview overflows",
    ({ type, label }) => {
      vi.useFakeTimers();
      render(
        <ContactModal
          isOpen={true}
          contact={{ id: `test-${type}`, title: label, type }}
          onClose={vi.fn()}
        />,
      );
      const preview = document.querySelector<HTMLElement>(".contact-demo");
      expect(preview).not.toBeNull();

      vi.spyOn(
        HTMLElement.prototype,
        "getBoundingClientRect",
      ).mockImplementation(function (this: HTMLElement) {
        const bottom = this === preview ? 180 : 260;
        return { bottom } as DOMRect;
      });

      act(() => {
        vi.advanceTimersByTime(20000);
      });

      expect(preview?.scrollTop).toBeGreaterThan(0);
    },
  );

  it("keeps sent and reply messages at the top of the email preview", () => {
    const styles = readFileSync(resolve("src", "styles.css"), "utf8");

    expect(styles).toMatch(
      /\.contact-email-compose\.is-sent,\s*\.contact-email-compose\.is-reply\s*\{\s*flex:\s*0 0 auto;/,
    );
    expect(styles).not.toMatch(
      /\.contact-email-sent-state\s*\{[^}]*height:\s*100%;/s,
    );
  });

  it("shows mail-specific help and removes the old footer note", async () => {
    const { user } = renderContactModal({
      id: "ct_mail",
      title: "profile-team@demo.email",
      type: "email",
    });

    expect(
      screen.getByRole("button", { name: "About Mail preview" }),
    ).not.toBeNull();
    expect(screen.queryByText(/Demo: the catalog link opened/i)).toBeNull();
    expect(screen.queryByText(/In a real setup/i)).toBeNull();

    await user.hover(
      screen.getByRole("button", { name: "About Mail preview" }),
    );

    expect(screen.getByRole("tooltip").textContent).toBe(
      "Demo email workflow. Click for details.",
    );

    await user.click(
      screen.getByRole("button", { name: "About Mail preview" }),
    );

    const dialog = screen.getByRole("dialog", { name: "About Mail preview" });
    expect(dialog.classList.contains("modal-window")).toBe(true);
    expect(document.querySelector(".modal-content")).not.toBeNull();
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

    await user.click(
      screen.getByRole("button", { name: "About Phone preview" }),
    );

    const dialog = screen.getByRole("dialog", { name: "About Phone preview" });
    expect(dialog.textContent).toContain(
      "simulates opening Phone, calling +1 555 0100",
    );
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
