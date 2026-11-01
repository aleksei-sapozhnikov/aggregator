/** @file Tests Grafana dashboard URLs and configuration contracts. */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

type DashboardTarget = {
  expr: string;
  legendFormat: string;
  refId: string;
};

type DashboardVariable = {
  current?: {
    text: string;
    value: string;
  };
  hide?: number;
  label?: string;
  name: string;
  options?: Array<{
    selected: boolean;
    text: string;
    value: string;
  }>;
  query?: string | { query: string };
};

type Dashboard = {
  panels: Array<{
    fieldConfig: {
      defaults: {
        custom: {
          axisWidth?: number;
        };
      };
      overrides: Array<{
        matcher: {
          options: string;
        };
        properties: Array<{
          id: string;
          value: Array<{
            title: string;
            url: string;
          }>;
        }>;
      }>;
    };
    targets: DashboardTarget[];
  }>;
  templating: {
    list: DashboardVariable[];
  };
};

const dashboardPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../../../services-extra/grafana/dashboards/item_health_state.json",
);

const loadDashboard = (): Dashboard =>
  JSON.parse(readFileSync(dashboardPath, "utf8")) as Dashboard;

describe("Timeline Grafana dashboard", () => {
  it("shows selected item state first and removes dependency state rows", () => {
    const dashboard = loadDashboard();
    const targets = dashboard.panels[0].targets;

    expect(targets.map((target) => target.refId)).toEqual(["A", "C", "D"]);
    expect(targets[0].expr).toBe(
      'catalog_item_state{item_id=~"${item_id:regex}"}',
    );
    expect(targets[0].legendFormat).toBe("[Overall] {{item_name}}");
    expect(
      targets.some((target) => target.expr.includes("catalog_item_own_state")),
    ).toBe(false);
  });

  it("keeps failing-only signal filtering and preserves signal grouping", () => {
    const dashboard = loadDashboard();
    const targetsByRef = new Map(
      dashboard.panels[0].targets.map((target) => [target.refId, target]),
    );
    const ownSignals = targetsByRef.get("C");
    const dependencySignals = targetsByRef.get("D");

    expect(ownSignals?.expr).toContain("min_over_time");
    expect(ownSignals?.expr).toContain("< 1");
    expect(ownSignals?.expr).toContain("vector(${signals}) == 1");
    expect(ownSignals?.expr).toContain("vector(${signals}) == 2");
    expect(ownSignals?.expr).not.toContain("${show}");
    expect(ownSignals?.legendFormat).toBe("\u200b● {{signal_name}}");

    expect(dependencySignals?.expr).toContain(
      'catalog_item_signal_state{item_id=~"${deps:regex}"}',
    );
    expect(dependencySignals?.expr).toContain("min_over_time");
    expect(dependencySignals?.expr).toContain("< 1");
    expect(dependencySignals?.expr).toContain("vector(${signals}) == 2");
    expect(dependencySignals?.expr).toContain("vector(${signals}) == 3");
    expect(dependencySignals?.expr).not.toContain("${show}");
    expect(dependencySignals?.expr).not.toContain("dep_depth");
    expect(dependencySignals?.legendFormat).toBe("\u200c↳ {{signal_name}}");
  });

  it("keeps only one visible Signals selector", () => {
    const dashboard = loadDashboard();
    const variables = dashboard.templating.list;
    const visibleVariables = variables.filter((variable) => !variable.hide);
    const signals = variables.find((variable) => variable.name === "signals");

    expect(variables.map((variable) => variable.name)).toEqual([
      "item_id",
      "app_base_url",
      "signals",
      "deps",
    ]);
    expect(visibleVariables.map((variable) => variable.label)).toEqual([
      "Signals",
    ]);
    expect(signals?.current).toEqual({
      selected: true,
      text: "● ↳ All",
      value: "2",
    });
    expect(signals?.options?.map((option) => option.text)).toEqual([
      "All",
      "● Own",
      "↳ Dependencies",
    ]);
    expect(signals?.query).toBe("● ↳ All : 2, ● Own : 1, ↳ Dependencies : 3");
  });

  it("keeps the timeline label column compact", () => {
    const dashboard = loadDashboard();

    expect(dashboard.panels[0].fieldConfig.defaults.custom.axisWidth).toBe(300);
  });

  it("keeps transitive dependency discovery and dependency item links", () => {
    const dashboard = loadDashboard();
    const deps = dashboard.templating.list.find(
      (variable) => variable.name === "deps",
    );
    const linkOverride = dashboard.panels[0].fieldConfig.overrides.find(
      (override) => override.matcher.options === "D",
    );
    const link = linkOverride?.properties.find(
      (property) => property.id === "links",
    )?.value[0];

    expect(
      typeof deps?.query === "object" ? deps.query.query : deps?.query,
    ).toBe('label_values(catalog_dependency{source_id="$item_id"}, target_id)');
    expect(link).toEqual({
      targetBlank: false,
      title: "Item: ${__field.labels.item_name}",
      url: "${app_base_url}/item/${__field.labels.item_id}",
    });
  });
});
