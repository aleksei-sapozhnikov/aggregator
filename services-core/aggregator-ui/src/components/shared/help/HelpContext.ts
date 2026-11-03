import { createContext } from "react";
import type { ReactNode } from "react";

export type HelpTopic = {
  title: string;
  summary: string;
  description?: string;
  content?: ReactNode;
  sections?: {
    heading: string;
    paragraphs?: string[];
    items?: { label: string; text: string }[];
  }[];
  details?: { label: string; value: string }[];
};

export type HelpContextValue = {
  activeTopic: HelpTopic | null;
  resolveTopic: (id: string) => HelpTopic | null;
  openTopic: (topic: HelpTopic) => void;
};

export const HelpContext = createContext<HelpContextValue | null>(null);
