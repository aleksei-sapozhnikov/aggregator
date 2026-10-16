import TimelineHelpDemo from "./TimelineHelpDemo";

export const timelineHelp = {
  title: "Timeline",
  summary:
    "See historical health states and how to use the chart. Click for examples.",
};

export default function TimelineHelpContent() {
  return (
    <>
      <div className="info-help-description modal-text-flow">
        <p>
          Timeline shows the selected Item's [Overall] state, including
          dependency impact, and signals that were DOWN or UNKNOWN at some point
          in the selected range.
        </p>
      </div>
      <TimelineHelpDemo />
    </>
  );
}
