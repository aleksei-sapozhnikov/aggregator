/** @file Identifies plain pointer navigation clicks without modifier keys. */

type PlainLeftClickEvent = {
  button: number;
  defaultPrevented: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
};

/** Checks whether an interaction should navigate within the SPA. */
export const isPlainLeftClick = (event: PlainLeftClickEvent): boolean =>
  event.button === 0 &&
  !event.defaultPrevented &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.shiftKey &&
  !event.altKey;
