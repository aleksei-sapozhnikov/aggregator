"""Verify the Grafana timeline dashboard's configuration and signal contracts."""

from __future__ import annotations

import json
import unittest
from pathlib import Path

DASHBOARD_PATH = (
    Path(__file__).resolve().parents[1] / "dashboards" / "item_health_state.json"
)


class TimelineDashboardContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.dashboard = json.loads(DASHBOARD_PATH.read_text(encoding="utf-8"))

    def test_selected_item_state_is_first_without_dependency_state_rows(self) -> None:
        targets = self.dashboard["panels"][0]["targets"]

        self.assertEqual([target["refId"] for target in targets], ["A", "C", "D"])
        self.assertEqual(
            targets[0]["expr"],
            'catalog_item_state{item_id=~"${item_id:regex}"}',
        )
        self.assertEqual(targets[0]["legendFormat"], "[Overall] {{item_name}}")
        self.assertFalse(
            any("catalog_item_own_state" in target["expr"] for target in targets)
        )

    def test_failing_signals_keep_own_and_dependency_grouping(self) -> None:
        targets = {
            target["refId"]: target for target in self.dashboard["panels"][0]["targets"]
        }
        own_signals = targets["C"]
        dependency_signals = targets["D"]

        for expected in (
            "min_over_time",
            "< 1",
            "vector(${signals}) == 1",
            "vector(${signals}) == 2",
        ):
            self.assertIn(expected, own_signals["expr"])
        self.assertNotIn("${show}", own_signals["expr"])
        self.assertEqual(own_signals["legendFormat"], "\u200b● {{signal_name}}")

        for expected in (
            'catalog_item_signal_state{item_id=~"${deps:regex}"}',
            "min_over_time",
            "< 1",
            "vector(${signals}) == 2",
            "vector(${signals}) == 3",
        ):
            self.assertIn(expected, dependency_signals["expr"])
        self.assertNotIn("${show}", dependency_signals["expr"])
        self.assertNotIn("dep_depth", dependency_signals["expr"])
        self.assertEqual(
            dependency_signals["legendFormat"], "\u200c↳ {{signal_name}}"
        )

    def test_only_one_signals_selector_is_visible(self) -> None:
        variables = self.dashboard["templating"]["list"]
        visible = [variable.get("label") for variable in variables if not variable.get("hide")]
        signals = next(variable for variable in variables if variable["name"] == "signals")

        self.assertEqual(
            [variable["name"] for variable in variables],
            ["item_id", "app_base_url", "signals", "deps"],
        )
        self.assertEqual(visible, ["Signals"])
        self.assertEqual(
            signals["current"],
            {"selected": True, "text": "● ↳ All", "value": "2"},
        )
        self.assertEqual(
            [option["text"] for option in signals["options"]],
            ["All", "● Own", "↳ Dependencies"],
        )
        self.assertEqual(
            signals["query"], "● ↳ All : 2, ● Own : 1, ↳ Dependencies : 3"
        )

    def test_timeline_label_column_stays_compact(self) -> None:
        axis_width = self.dashboard["panels"][0]["fieldConfig"]["defaults"][
            "custom"
        ]["axisWidth"]
        self.assertEqual(axis_width, 300)

    def test_transitive_dependencies_and_item_links_are_preserved(self) -> None:
        variables = self.dashboard["templating"]["list"]
        deps = next(variable for variable in variables if variable["name"] == "deps")
        deps_query = deps["query"]
        self.assertEqual(
            deps_query["query"] if isinstance(deps_query, dict) else deps_query,
            'label_values(catalog_dependency{source_id="$item_id"}, target_id)',
        )

        overrides = self.dashboard["panels"][0]["fieldConfig"]["overrides"]
        dependency_override = next(
            override
            for override in overrides
            if override["matcher"]["options"] == "D"
        )
        links = next(
            property
            for property in dependency_override["properties"]
            if property["id"] == "links"
        )
        self.assertEqual(
            links["value"][0],
            {
                "targetBlank": False,
                "title": "Item: ${__field.labels.item_name}",
                "url": "${app_base_url}/item/${__field.labels.item_id}",
            },
        )


if __name__ == "__main__":
    unittest.main()
