/** @vitest-environment node */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve("src/components");
const features = new Set(["about", "item-details", "catalog-tree", "ai-chat", "entity-details"]);
const codeExtensions = /\.(?:ts|tsx)$/;
const importPattern = /\b(?:from\s*|import\s*|import\s*\(\s*)["'](\.[^"']+)["']/g;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (!codeExtensions.test(entry.name) || /\.(?:test|spec|d)\.tsx?$/.test(entry.name)) {
      return [];
    }
    return [path];
  });
}

function partsUnderComponents(path: string): string[] | null {
  const pathFromRoot = relative(root, path);
  if (pathFromRoot === ".." || pathFromRoot.startsWith(".." + sep)) return null;
  return pathFromRoot.split(sep);
}

describe("Component dependency boundaries", () => {
  it("keeps feature implementations private and shared modules independent", () => {
    const violations: string[] = [];
    for (const file of sourceFiles(root)) {
      const source = partsUnderComponents(file);
      if (!source) continue;
      const content = readFileSync(file, "utf8");
      for (const match of content.matchAll(importPattern)) {
        const target = partsUnderComponents(resolve(dirname(file), match[1]));
        if (!target) continue; // Service APIs and non-visual shared helpers live in src/.
        const sourceFeature = source[0];
        const targetFeature = target[0];
        if (sourceFeature === "shared" && targetFeature !== "shared") {
          violations.push(`${relative(root, file)} imports ${match[1]} from outside shared/`);
        } else if (features.has(sourceFeature) &&
          targetFeature !== sourceFeature && targetFeature !== "shared") {
          violations.push(`${relative(root, file)} imports sibling feature ${match[1]}`);
        } else if (sourceFeature === "about" && source.length >= 3 && targetFeature === "about" &&
          target.length >= 3 && source[1] !== target[1] && target[1] !== "shared") {
          violations.push(`${relative(root, file)} imports a sibling help topic ${match[1]}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
