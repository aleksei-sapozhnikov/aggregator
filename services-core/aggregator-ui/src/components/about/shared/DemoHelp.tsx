/** @file Renders an inert help control in a contextual-help animation. */

import InfoHelpButton from "../../shared/help/InfoHelpButton";

/** Renders a non-interactive help control inside example scenes. */
export default function DemoHelp({ title }: { title: string }) {
  return (
    <span className="info-help">
      <InfoHelpButton label={`About ${title}`} />
    </span>
  );
}
