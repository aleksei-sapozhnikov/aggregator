/** @file Registers help topics and owns the active contextual-help dialog. */

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { HelpContext, type HelpTopic } from "../../shared/help/HelpContext";
import ContextualHelpDialog from "./ContextualHelpDialog";
import PrimaryContactHelpContent, {
  primaryContactHelp,
} from "../primary-contact/PrimaryContactHelpContent";
import ActorsHelpContent, { actorsHelp } from "../actors/ActorsHelpContent";
import HealthySignalsHelpContent, {
  healthySignalsHelp,
} from "../healthy-signals/HealthySignalsHelpContent";
import UnhealthySignalsHelpContent, {
  unhealthySignalsHelp,
} from "../unhealthy-signals/UnhealthySignalsHelpContent";
import TimelineHelpContent, {
  timelineHelp,
} from "../timeline/TimelineHelpContent";

const topics: Record<string, HelpTopic> = {
  "primary-contact": {
    ...primaryContactHelp,
    content: <PrimaryContactHelpContent />,
  },
  actors: { ...actorsHelp, content: <ActorsHelpContent /> },
  "healthy-signals": {
    ...healthySignalsHelp,
    content: <HealthySignalsHelpContent />,
  },
  "unhealthy-signals": {
    ...unhealthySignalsHelp,
    content: <UnhealthySignalsHelpContent />,
  },
  timeline: { ...timelineHelp, content: <TimelineHelpContent /> },
};

export default function ContextualHelpProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [activeTopic, setActiveTopic] = useState<HelpTopic | null>(null);
  const context = useMemo(
    () => ({
      activeTopic,
      resolveTopic: (id: string) => topics[id] ?? null,
      openTopic: setActiveTopic,
    }),
    [activeTopic],
  );

  return (
    <HelpContext.Provider value={context}>
      {children}
      {activeTopic && (
        <ContextualHelpDialog
          topic={activeTopic}
          onClose={() => setActiveTopic(null)}
        />
      )}
    </HelpContext.Provider>
  );
}
