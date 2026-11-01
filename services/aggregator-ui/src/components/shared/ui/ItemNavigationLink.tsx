/** @file Gives Item navigation links a consistent trailing-arrow affordance. */

import type { MouseEvent, ReactNode } from "react";

type ItemNavigationLinkProps = {
  href?: string;
  children: ReactNode;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  className?: string;
  title?: string;
  ariaLabel?: string;
};

export default function ItemNavigationLink({
  href,
  children,
  onClick,
  className,
  title,
  ariaLabel,
}: ItemNavigationLinkProps) {
  return (
    <a
      href={href}
      onClick={onClick}
      className={["details-text-link", "item-navigation-link", className]
        .filter(Boolean)
        .join(" ")}
      title={title}
      aria-label={ariaLabel}
    >
      <span className="item-navigation-link-text">{children}</span>
      <span className="item-navigation-link-arrow" aria-hidden="true">
        →
      </span>
    </a>
  );
}
