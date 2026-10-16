/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import GrafanaFrame from "./GrafanaFrame";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("GrafanaFrame", () => {
  it("loads only its wrapper and sends the selected Item dashboard on load", () => {
    const onNavigateToItem = vi.fn();
    render(<GrafanaFrame itemId="checkout" theme="dark" onNavigateToItem={onNavigateToItem} />);
    const iframe = screen.getByTitle("State Timeline") as HTMLIFrameElement;
    expect(iframe.getAttribute("src")).toContain(
      "components/item-details/timeline/grafana/frame/index.html",
    );
    const send = vi.spyOn(iframe.contentWindow!, "postMessage");
    fireEvent.load(iframe);
    expect(send).toHaveBeenCalledWith(
      { type: "set-frame-theme", theme: "dark" },
      window.location.origin,
    );
    expect(send).toHaveBeenCalledWith(
      { type: "set-grafana-src", src: expect.stringContaining("var-item_id=checkout") },
      window.location.origin,
    );
  });

  it("updates the dashboard and theme without remounting the wrapper", () => {
    const onNavigateToItem = vi.fn();
    const { rerender } = render(
      <GrafanaFrame itemId="checkout" theme="light" onNavigateToItem={onNavigateToItem} />,
    );
    const iframe = screen.getByTitle("State Timeline") as HTMLIFrameElement;
    const send = vi.spyOn(iframe.contentWindow!, "postMessage");
    fireEvent.load(iframe);
    send.mockClear();
    rerender(<GrafanaFrame itemId="orders" theme="dark" onNavigateToItem={onNavigateToItem} />);
    expect(screen.getByTitle("State Timeline")).toBe(iframe);
    expect(send).toHaveBeenCalledWith(
      { type: "set-frame-theme", theme: "dark" },
      window.location.origin,
    );
    expect(send).toHaveBeenCalledWith(
      { type: "set-grafana-src", src: expect.stringContaining("var-item_id=orders") },
      window.location.origin,
    );
  });

  it("forwards trusted Item links to the application without handling unrelated messages", () => {
    const onNavigateToItem = vi.fn();
    render(<GrafanaFrame itemId="checkout" theme="light" onNavigateToItem={onNavigateToItem} />);
    const iframe = screen.getByTitle("State Timeline") as HTMLIFrameElement;
    const data = { type: "grafana-item-link-click", itemId: "orders", href: "/item/orders" };
    window.dispatchEvent(new MessageEvent("message", {
      data, origin: "https://untrusted.example", source: iframe.contentWindow,
    }));
    expect(onNavigateToItem).not.toHaveBeenCalled();
    window.dispatchEvent(new MessageEvent("message", {
      data, origin: window.location.origin, source: iframe.contentWindow,
    }));
    expect(onNavigateToItem).toHaveBeenCalledWith("orders", "/item/orders");
  });
});
