export type InfoHelpTopic = {
  title: string;
  summary: string;
  description: string;
  sections?: {
    heading: string;
    paragraphs?: string[];
    items?: {
      label: string;
      text: string;
    }[];
  }[];
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
    summary:
      "Signals on this item that are currently healthy. Click for details.",
    description:
      "Healthy signals are the selected item's own health signals that are currently passing. They are kept separate from unhealthy signals so the main view can focus on what is affecting the item while healthy evidence remains available when needed.",
  },
  timeline: {
    title: "Timeline",
    summary:
      "See how product and service health changes over time. Click to learn how to read the chart.",
    description:
      "Timeline shows how the selected item's health changes over time. The first row shows its overall health, including the impact of dependencies. The remaining rows show individual health signals that experienced problems during the selected period.",
    sections: [
      {
        heading: "What is Timeline?",
        paragraphs: [
          "The first row is the selected item's aggregated health state.",
          "Signal rows appear underneath it when those signals were unhealthy or unknown at least once in the selected time range.",
          "Use Timeline to investigate past failures, not just the current health state.",
        ],
      },
      {
        heading: "Colors",
        items: [
          {
            label: "Green",
            text: "Healthy (UP).",
          },
          {
            label: "Red",
            text: "Unhealthy (DOWN).",
          },
          {
            label: "Yellow",
            text: "Unknown health state (UNKNOWN).",
          },
          {
            label: "No data",
            text: "No measurements are available for that period.",
          },
        ],
      },
      {
        heading: "Symbols",
        items: [
          {
            label: "●",
            text: "A health signal belonging to the selected item.",
          },
          {
            label: "↳",
            text: "A health signal belonging to a dependency.",
          },
        ],
      },
      {
        heading: "Signals filter",
        items: [
          {
            label: "All",
            text: "Show own and dependency signals.",
          },
          {
            label: "● Own",
            text: "Show only the selected item's signals.",
          },
          {
            label: "↳ Dependencies",
            text: "Show only dependency signals.",
          },
        ],
      },
      {
        heading: "Which signals appear?",
        paragraphs: [
          "Only signals that were unhealthy or had an unknown state at some point during the selected time range are shown.",
          "Their full history is displayed, including periods when they were healthy.",
          "For dependency signal rows, use the row link to identify and open the item that owns the signal.",
        ],
      },
      {
        heading: "Time range and refresh",
        items: [
          {
            label: "Time axis",
            text: "The horizontal axis represents time.",
          },
          {
            label: "Time range",
            text: "The time-range selector controls which period is displayed.",
          },
          {
            label: "Navigation and zoom",
            text: "Use these controls to inspect different periods in more detail.",
          },
          {
            label: "Refresh",
            text: "Refresh updates the displayed data. Auto-refresh can periodically update the chart.",
          },
        ],
      },
    ],
  },
} satisfies Record<string, InfoHelpTopic>;
