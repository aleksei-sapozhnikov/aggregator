/** @vitest-environment jsdom */
import { createRef } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ItemTitle from "./ItemTitle";
import ItemOwnership from "./ItemOwnership";
import { HealthySignals, UnhealthySignals } from "./ItemSignals";
import ItemTimeline from "./ItemTimeline";
import InfoHelpButton from "../help/InfoHelpButton";
import type { CatalogActor, CatalogContact, ItemSignal } from "../../../shared/types";

afterEach(cleanup);

const actor: CatalogActor = { id: "owner", title: "Service Team", type: "owner" };
const contact: CatalogContact = { id: "phone", type: "phone", title: "+1 555 010 2026" };
const signal: ItemSignal = { id: "readiness", title: "Readiness", status: "unknown" };

describe("Reusable Item presentation", () => {
  it("keeps the title measurement ref, status text and catalog information together", () => {
    const ref = createRef<HTMLElement>();
    render(<ItemTitle item={{ id: "orders", title: "Orders API", shortDescription: "Example" }}
      firstWord="Orders" rest=" API" status="down" primaryRef={ref} interactive={false} />);
    expect(ref.current?.textContent).toBe("Orders");
    expect(ref.current?.querySelector(".status-down")?.getAttribute("aria-label")).toContain("DOWN");
    expect(screen.getByText("DOWN")).not.toBeNull();
    const info = screen.getByRole("button", { name: "Catalog information for Orders API" });
    fireEvent.click(info);
    fireEvent.mouseEnter(info);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect((info as HTMLButtonElement).disabled).toBe(true);
  });

  it("passes ownership actions through with their original records", () => {
    const onOpenActor = vi.fn();
    const onOpenContact = vi.fn();
    const onToggle = vi.fn();
    render(<ItemOwnership primaryContact={contact} actorRows={[{ key: actor.id, actor, typeLabel: "Owner" }]}
      expanded iconSpriteHref="/icons.svg" onOpenActor={onOpenActor}
      onOpenContact={onOpenContact} onToggleActors={onToggle} />);
    fireEvent.click(screen.getByRole("button", { name: actor.title }));
    fireEvent.click(screen.getByRole("button", { name: contact.title }));
    fireEvent.keyDown(screen.getByRole("button", { name: "Toggle Actors" }), { key: " " });
    expect(onOpenActor).toHaveBeenCalledWith(actor);
    expect(onOpenContact).toHaveBeenCalledWith(contact);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("renders passive ownership, signals, navigation and help without actionable links", () => {
    const { container } = render(<>
      <ItemOwnership primaryContact={contact} actorRows={[{ key: actor.id, actor, typeLabel: "Owner" }]}
        expanded iconSpriteHref="/icons.svg" primaryHelp={<InfoHelpButton label="About Primary contact" />} />
      <UnhealthySignals signals={[signal]} dependencies={[{
        id: "payments", title: "Payments", signals: [{ ...signal, id: "dependency-check", status: "down" }],
      }]} expanded />
      <HealthySignals signals={[{ id: "latency", title: "Latency", status: "up" }]} expanded />
    </>);
    expect(screen.getByText("Unhealthy signals (2)")).not.toBeNull();
    expect(screen.getByText("Healthy signals (1)")).not.toBeNull();
    expect(screen.getByText("UNKNOWN")).not.toBeNull();
    expect(screen.getAllByText("Dependency")).toHaveLength(1);
    expect(container.querySelectorAll("a[href], [tabindex='0']")).toHaveLength(0);
    for (const button of container.querySelectorAll("button")) expect(button.disabled).toBe(true);
    for (const toggle of container.querySelectorAll(".details-disclosure-toggle")) {
      fireEvent.click(toggle);
      fireEvent.keyDown(toggle, { key: "Enter" });
      expect(toggle.getAttribute("aria-expanded")).toBe("true");
    }
  });

  it("preserves signal deep links and dependency navigation callbacks", () => {
    const onSignalClick = vi.fn();
    const onDependencyClick = vi.fn((event) => event.preventDefault());
    render(<UnhealthySignals signals={[signal]} dependencies={[{
      id: "payments", title: "Payments", href: "/payments", onClick: onDependencyClick, signals: [],
    }]} expanded buildSignalLink={(id) => `#signal/${id}`} onSignalClick={onSignalClick} />);
    const link = screen.getByRole("link", { name: "Readiness" });
    expect(link.getAttribute("href")).toBe("#signal/readiness");
    fireEvent.click(link);
    fireEvent.click(screen.getByRole("link", { name: "Payments" }));
    expect(onSignalClick.mock.calls[0][1]).toBe(signal);
    expect(onDependencyClick).toHaveBeenCalledTimes(1);
  });

  it("mounts timeline content only when expanded and retains its measured height", () => {
    const { container, rerender } = render(<ItemTimeline expanded={false}><div>Chart</div></ItemTimeline>);
    expect(screen.queryByText("Chart")).toBeNull();
    rerender(<ItemTimeline expanded height={420}><div>Chart</div></ItemTimeline>);
    expect(screen.getByText("Chart").closest(".grafana-panel")).not.toBeNull();
    expect((container.querySelector(".grafana-panel") as HTMLElement).style.height).toBe("420px");
  });
});
