/**
 * @vitest-environment jsdom
 */

/** @file Tests reusable help character SVG layers and scene assets. */

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import OwnerCharacter from "./owner/OwnerCharacter";
import ownerArtwork from "./owner/OwnerCharacter.svg?raw";
import ownerAssetUrl from "./owner/OwnerCharacter.svg?no-inline";
import UserCharacter from "./user/UserCharacter";
import userArtwork from "./user/UserCharacter.svg?raw";
import userAssetUrl from "./user/UserCharacter.svg?no-inline";
import SupportCharacter from "./support/SupportCharacter";
import supportArtwork from "./support/SupportCharacter.svg?raw";
import supportAssetUrl from "./support/SupportCharacter.svg?no-inline";
import ServiceMachine from "./service/ServiceMachine";
import serviceArtwork from "./service/ServiceMachine.svg?raw";
import serviceAssetUrl from "./service/ServiceMachine.svg?no-inline";

afterEach(cleanup);

describe("Independent character SVG assets", () => {
  it.each([
    ["owner", ownerArtwork, ["owner-base", "owner-wrench"]],
    [
      "user",
      userArtwork,
      ["user-base", "user-happy", "user-unhappy", "user-idle-arm", "user-phone"],
    ],
    ["support", supportArtwork, ["support-base", "support-headset", "support-hand"]],
  ] as const)(
    "provides a valid standalone %s illustration with separately addressable layers",
    (role, markup, layers) => {
    const document = new DOMParser().parseFromString(markup, "image/svg+xml");
    expect(document.querySelector("parsererror")).toBeNull();
    expect(document.documentElement.localName).toBe("svg");
    expect(document.documentElement.getAttribute("viewBox")).toBe("0 0 110 145");
    for (const id of layers) {
      expect(document.getElementById(id)?.tagName).toBe("g");
    }
    expect(document.querySelectorAll("g[id]")).toHaveLength(layers.length);
    expect(markup).not.toContain("role ===");
    expect(markup).not.toContain("DemoCharacter");
    expect(document.documentElement.getAttribute("aria-label")).toBeNull();
    expect(role.length).toBeGreaterThan(0);
    },
  );

  it("emits external SVG files instead of inlining fragment assets", () => {
    for (const url of [
      ownerAssetUrl,
      userAssetUrl,
      supportAssetUrl,
      serviceAssetUrl,
    ]) {
      expect(url).not.toMatch(/^data:/);
      expect(url).toContain(".svg");
    }
  });

  it("composes Owner's own image with an independently animated wrench", () => {
    const { container } = render(
      <svg>
        <OwnerCharacter repairProgress={20} />
      </svg>,
    );
    const owner = container.querySelector('[data-demo-character="owner"]');
    expect(owner?.querySelectorAll("use")).toHaveLength(2);
    expect(owner?.querySelector("use")?.getAttribute("href")).toContain(
      `${ownerAssetUrl}#owner-base`,
    );
    expect(owner?.querySelector(".actors-help-wrench")?.getAttribute("transform")).toBe(
      "rotate(20 78 88)",
    );
    expect(
      owner?.querySelector(".actors-help-wrench use")?.getAttribute("href"),
    ).toContain(`${ownerAssetUrl}#owner-wrench`);
  });

  it("keeps User and Support gestures in their respective components", () => {
    const { container } = render(
      <svg>
        <UserCharacter />
        <SupportCharacter />
      </svg>,
    );
    const user = container.querySelector('[data-demo-character="user"]');
    const support = container.querySelector('[data-demo-character="support"]');
    expect(user?.querySelectorAll("use")).toHaveLength(5);
    expect(support?.querySelectorAll("use")).toHaveLength(3);
    expect(
      user?.querySelector('[data-demo-gesture="phone"] use')?.getAttribute("href"),
    ).toContain(`${userAssetUrl}#user-phone`);
    expect(
      support
        ?.querySelector('[data-demo-gesture="headset"] use')
        ?.getAttribute("href"),
    ).toContain(`${supportAssetUrl}#support-headset`);
    expect(
      support?.querySelector(".demo-character-support-hand use")?.getAttribute("href"),
    ).toContain(`${supportAssetUrl}#support-hand`);
    expect(support?.querySelector(".actors-help-wrench")).toBeNull();
  });
  it("shows User concern and changes from phone to resting arm by composition", () => {
    const { container, rerender } = render(
      <svg>
        <UserCharacter />
      </svg>,
    );
    const user = container.querySelector('[data-demo-character="user"]');
    const happy = user?.querySelector('[data-user-expression="happy"]');
    const unhappy = user?.querySelector('[data-user-expression="unhappy"]');
    const phone = user?.querySelector('[data-demo-gesture="phone"]');
    const idle = user?.querySelector('[data-user-arm="idle"]');
    expect(happy?.getAttribute("opacity")).toBe("1");
    expect(unhappy?.getAttribute("opacity")).toBe("0");
    expect(phone?.getAttribute("opacity")).toBe("1");
    expect(idle?.getAttribute("opacity")).toBe("0");

    rerender(
      <svg>
        <UserCharacter unhappy={1} phoneVisible={0} />
      </svg>,
    );
    expect(happy?.getAttribute("opacity")).toBe("0");
    expect(unhappy?.getAttribute("opacity")).toBe("1");
    expect(phone?.getAttribute("opacity")).toBe("0");
    expect(idle?.getAttribute("opacity")).toBe("1");
    expect(
      unhappy?.querySelector("use")?.getAttribute("href"),
    ).toContain(`${userAssetUrl}#user-unhappy`);
    expect(
      idle?.querySelector("use")?.getAttribute("href"),
    ).toContain(`${userAssetUrl}#user-idle-arm`);
  });

  it("provides a standalone service illustration with four independent layers", () => {
    const document = new DOMParser().parseFromString(
      serviceArtwork,
      "image/svg+xml",
    );
    expect(document.querySelector("parsererror")).toBeNull();
    expect(document.documentElement.getAttribute("viewBox")).toBe(
      "0 -20 215 260",
    );
    for (const id of [
      "service-base",
      "service-gear",
      "service-up",
      "service-down",
    ]) {
      expect(document.getElementById(id)?.tagName).toBe("g");
    }
    expect(document.querySelectorAll("g[id]")).toHaveLength(4);
    expect(
      document.querySelector('#service-up rect[fill="#70c87c"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('#service-down rect[fill="#eb4d46"]'),
    ).not.toBeNull();
  });

  it("keeps one service SVG while switching its indicator layers", () => {
    const { container, rerender } = render(
      <svg>
        <ServiceMachine unhealthy={0} />
      </svg>,
    );
    const machine = container.querySelector("[data-demo-service-machine]");
    const green = machine?.querySelector('[data-service-lamp="up"]');
    const red = machine?.querySelector('[data-service-lamp="down"]');
    expect(machine?.querySelectorAll("use")).toHaveLength(4);
    expect(
      machine?.querySelector(".actors-help-gear use")?.getAttribute("href"),
    ).toContain(`${serviceAssetUrl}#service-gear`);
    expect(green?.querySelector("use")?.getAttribute("href")).toContain(
      `${serviceAssetUrl}#service-up`,
    );
    expect(red?.querySelector("use")?.getAttribute("href")).toContain(
      `${serviceAssetUrl}#service-down`,
    );
    expect(green?.getAttribute("opacity")).toBe("1");
    expect(red?.getAttribute("opacity")).toBe("0");

    rerender(
      <svg>
        <ServiceMachine unhealthy={1} />
      </svg>,
    );
    expect(green?.getAttribute("opacity")).toBe("0");
    expect(red?.getAttribute("opacity")).toBe("1");
  });

});
