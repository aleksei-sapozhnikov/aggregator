/** @file Adapts the replaceable Timeline view to an Item details section. */

import { useEffect, useState } from "react";
import type { RefObject } from "react";
import ItemTimeline from "../../shared/item/ItemTimeline";
import InfoHelp from "../../shared/help/InfoHelp";
import GrafanaFrame from "./grafana/GrafanaFrame";

type TimelineSectionProps = {
  itemId: string;
  expanded: boolean;
  onToggle: () => void;
  onNavigateToItem: (itemId: string, href: string) => void;
  contentRef: RefObject<HTMLElement | null>;
  headerRef: RefObject<HTMLElement | null>;
};

/** Provider-independent timeline boundary. Its implementation may replace Grafana. */
export default function TimelineSection({
  itemId,
  expanded,
  onToggle,
  onNavigateToItem,
  contentRef,
  headerRef,
}: TimelineSectionProps) {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    /** Fits the Timeline to the available viewport below the fixed header. */
    const updateHeight = () => {
      if (!contentRef.current || !headerRef.current) return;
      const styles = window.getComputedStyle(contentRef.current);
      const paddingTop = Number.parseFloat(styles.paddingTop) || 0;
      const paddingBottom = Number.parseFloat(styles.paddingBottom) || 0;
      const gap = Number.parseFloat(styles.rowGap || styles.gap) || 0;
      const headerHeight = headerRef.current.getBoundingClientRect().height;
      setHeight(
        Math.max(
          320,
          Math.floor(
            window.innerHeight -
              paddingTop -
              paddingBottom -
              headerHeight -
              gap,
          ),
        ),
      );
    };
    updateHeight();
    window.addEventListener("resize", updateHeight);
    let observer: ResizeObserver | undefined;
    if (window.ResizeObserver && headerRef.current) {
      observer = new ResizeObserver(updateHeight);
      observer.observe(headerRef.current);
    }
    return () => {
      window.removeEventListener("resize", updateHeight);
      observer?.disconnect();
    };
  }, [contentRef, headerRef]);

  return (
    <ItemTimeline
      expanded={expanded}
      onToggle={onToggle}
      height={height}
      help={<InfoHelp topicId="timeline" />}
    >
      <GrafanaFrame itemId={itemId} onNavigateToItem={onNavigateToItem} />
    </ItemTimeline>
  );
}
