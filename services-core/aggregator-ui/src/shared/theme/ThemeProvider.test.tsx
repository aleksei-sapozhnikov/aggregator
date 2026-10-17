/** @vitest-environment jsdom */
/** @file Tests theme persistence, context updates, and document theme application. */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ThemeProvider, { useTheme } from "./ThemeProvider";
import AppToolbar from "../../app/AppToolbar";
import { getInitialTheme, nextTheme, THEME_STORAGE_KEY } from "./theme";

function ThemeProbe() {
  const { theme, toggleTheme } = useTheme();
  return (
    <>
      <span data-testid="active-theme">{theme}</span>
      <button type="button" onClick={toggleTheme}>
        Toggle theme
      </button>
    </>
  );
}

afterEach(() => {
  cleanup();
  localStorage.removeItem(THEME_STORAGE_KEY);
  document.body.removeAttribute("data-theme");
  vi.unstubAllGlobals();
});

describe("Application theme", () => {
  it("uses saved theme in preference to the OS theme", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    );
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    expect(getInitialTheme()).toBe("light");
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    expect(getInitialTheme()).toBe("dark");
  });

  it("falls back to the OS setting without an explicit preference", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    );
    expect(getInitialTheme()).toBe("dark");
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false })),
    );
    expect(getInitialTheme()).toBe("light");
  });

  it("keeps provider consumers, CSS and storage synchronized on every toggle", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("active-theme").textContent).toBe("light");
    expect(document.body.dataset.theme).toBe("light");
    fireEvent.click(screen.getByRole("button", { name: "Toggle theme" }));
    expect(screen.getByTestId("active-theme").textContent).toBe("dark");
    expect(document.body.dataset.theme).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    fireEvent.click(screen.getByRole("button", { name: "Toggle theme" }));
    expect(document.body.dataset.theme).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(nextTheme("light")).toBe("dark");
  });

  it("updates the real application theme switch without any theme props", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    render(
      <ThemeProvider>
        <AppToolbar
          isAiChatOpen={false}
          onToggleAiChat={() => {}}
          onOpenAbout={() => {}}
        />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Go dark" }));
    expect(screen.getByRole("button", { name: "Go light" })).not.toBeNull();
    expect(document.body.dataset.theme).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("fails when a component tries to read the theme outside its provider", () => {
    function Consumer() {
      useTheme();
      return null;
    }
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    expect(() => render(<Consumer />)).toThrow(
      "useTheme must be used inside ThemeProvider",
    );
    consoleError.mockRestore();
  });
});
