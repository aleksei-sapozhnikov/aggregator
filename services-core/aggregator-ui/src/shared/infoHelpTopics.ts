export type InfoHelpTopic = {
  title: string;
  summary: string;
  description: string;
  details?: {
    label: string;
    value: string;
  }[];
};

export const infoHelpTopics = {
  primaryContact: {
    title: "Primary contact",
    summary: "The main contact for this item. Click for details.",
    description:
      "The primary contact is the main contact point associated with this item. Use it when you need more information, need to reach the responsible people, or are not sure who to contact about the item.",
  },
  actors: {
    title: "Actors",
    summary: "People or teams associated with this item. Click for details.",
    description:
      "Actors describe the people or teams associated with this item and their relationship to it. An actor can, for example, be an owner, a user, or another involved party. Actors can also provide contacts that help you reach the relevant people.",
  },
  unhealthySignals: {
    title: "Unhealthy signals",
    summary:
      "Signals currently contributing to this item's unhealthy state. Click for details.",
    description:
      "Unhealthy signals show what is currently affecting the health of this item. The list can include the item's own failing signals and failing signals coming from its dependencies. Dependencies are shown with their relevant signals so you can see where the problem originates and open the dependency for more detail.",
  },
  healthySignals: {
    title: "Healthy signals",
    summary: "Signals on this item that are currently healthy. Click for details.",
    description:
      "Healthy signals are the selected item's own health signals that are currently passing. They are kept separate from unhealthy signals so the main view can focus on what is affecting the item while healthy evidence remains available when needed.",
  },
} satisfies Record<string, InfoHelpTopic>;
