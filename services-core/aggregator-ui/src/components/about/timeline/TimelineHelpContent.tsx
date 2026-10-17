import TimelineHelpDemo from "./TimelineHelpDemo";

export const timelineHelp = {
  title: "Timeline",
  summary: "How this item's health changed over time.",
};

export default function TimelineHelpContent() {
  return (
    <>
      <div className="info-help-description modal-text-flow">
        <p>
          <strong>See when this item was healthy or had problems.</strong>
        </p>
        <p>The first row shows overall health, including problems in services this item depends on. The other rows show checks that had problems or lacked data during the selected period.</p>
        <p>Hover to inspect a moment. Change the time range or filter the checks to explore what happened.</p>
      </div>
      <TimelineHelpDemo />
    </>
  );
}
