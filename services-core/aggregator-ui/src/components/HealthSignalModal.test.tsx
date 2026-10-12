/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import HealthSignalModal from "./HealthSignalModal";

const details = {
  id: "sg_check",
  title: "Availability heartbeat responds",
  itemId: "payments",
  type: "http-poll",
  url: "http://demo:8080/health/sg_check",
  method: "GET",
  interval: "PT30S",
  extraConfiguration: { threshold: 2, enabled: true },
};

const setup = (payload: unknown = details, status = 200) => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status === 200,
    status,
    json: async () => payload,
  });
  vi.stubGlobal("fetch", fetchMock);
  const onSelectItemById = vi.fn();
  const onClose = vi.fn();

  render(
    <HealthSignalModal
      isOpen={true}
      signalId="sg_check"
      fallbackTitle="Fallback"
      items={[{ id: "payments", title: "Payments Service" }]}
      buildItemLink={(itemId) => `/item/${itemId}`}
      onSelectItemById={onSelectItemById}
      onClose={onClose}
    />,
  );

  return { fetchMock, onSelectItemById, onClose };
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("HealthSignalModal", () => {
  it("fetches by signal ID and renders ordered, schema-independent catalog fields", async () => {
    const { fetchMock } = setup();

    await screen.findByText("PT30S");
    expect(fetchMock).toHaveBeenCalledWith(
      new URL(
        "catalog/api/signals/sg_check",
        new URL(import.meta.env.BASE_URL || "/", window.location.origin),
      ),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    const dialog = screen.getByRole("dialog", { name: "Health signal details" });
    expect(dialog.querySelector(".modal-header h2")?.textContent).toBe(
      "Availability heartbeat responds",
    );
    const rows = Array.from(
      dialog.querySelectorAll<HTMLTableRowElement>(
        ".health-signal-details-table tr",
      ),
    );
    expect(rows.map((row) => row.querySelector("th")?.textContent)).toEqual([
      "id",
      "item",
      "type",
      "title",
      "url",
      "method",
      "interval",
      "extraConfiguration",
    ]);
    expect(dialog.textContent).toContain('"threshold": 2');
    expect(screen.getByRole("link", { name: "Payments Service" }).getAttribute("href")).toBe(
      "/item/payments",
    );
  });

  it("opens the linked catalog item and closes the signal dialog", async () => {
    const { onClose, onSelectItemById } = setup();
    const item = await screen.findByRole("link", { name: "Payments Service" });
    fireEvent.click(item);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSelectItemById).toHaveBeenCalledExactlyOnceWith("payments");
  });

  it("displays a catalog lookup failure instead of stale signal data", async () => {
    setup(null, 404);
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(
        "Signal not found in the catalog.",
      );
    });
    expect(screen.queryByRole("table")).toBeNull();
  });
});
