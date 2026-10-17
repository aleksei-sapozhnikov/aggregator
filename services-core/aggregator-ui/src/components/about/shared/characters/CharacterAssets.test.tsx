/**
 * @vitest-environment jsdom
 */

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

afterEach(cleanup);

describe("Independent character SVG assets", () => {
  it.each([
    ["owner", ownerArtwork, ["owner-base", "owner-wrench"]],
    ["user", userArtwork, ["user-base", "user-phone"]],
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
    for (const url of [ownerAssetUrl, userAssetUrl, supportAssetUrl]) {
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
      "OwnerCharacter.svg#owner-base",
    );
    expect(owner?.querySelector(".actors-help-wrench")?.getAttribute("transform")).toBe(
      "rotate(20 78 88)",
    );
    expect(
      owner?.querySelector(".actors-help-wrench use")?.getAttribute("href"),
    ).toContain("OwnerCharacter.svg#owner-wrench");
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
    expect(user?.querySelectorAll("use")).toHaveLength(2);
    expect(support?.querySelectorAll("use")).toHaveLength(3);
    expect(
      user?.querySelector('[data-demo-gesture="phone"] use')?.getAttribute("href"),
    ).toContain("UserCharacter.svg#user-phone");
    expect(
      support
        ?.querySelector('[data-demo-gesture="headset"] use')
        ?.getAttribute("href"),
    ).toContain("SupportCharacter.svg#support-headset");
    expect(
      support?.querySelector(".demo-character-support-hand use")?.getAttribute("href"),
    ).toContain("SupportCharacter.svg#support-hand");
    expect(support?.querySelector(".actors-help-wrench")).toBeNull();
  });
});
