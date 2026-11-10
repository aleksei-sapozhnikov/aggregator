/** @file Owns health signal modal selection and deep-link URL fragments. */

import { useEffect, useState } from "react";
import type { ItemSignal } from "../../../shared/types";

// Signal fragments preserve the selected catalog route and can be opened from
// the Details panel, a Grafana link, or another application surface.
const signalIdFromHash = (): string => {
  const match = /^#signal\/([^/]+)$/.exec(window.location.hash);
  if (!match) return "";
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return "";
  }
};

export default function useSignalDetails() {
  const [openedSignalId, setOpenedSignalId] = useState(signalIdFromHash);
  const [openedSignalTitle, setOpenedSignalTitle] = useState("");

  useEffect(() => {
    const syncSignalWithLocation = () => {
      setOpenedSignalId(signalIdFromHash());
      setOpenedSignalTitle("");
    };
    window.addEventListener("hashchange", syncSignalWithLocation);
    window.addEventListener("popstate", syncSignalWithLocation);
    return () => {
      window.removeEventListener("hashchange", syncSignalWithLocation);
      window.removeEventListener("popstate", syncSignalWithLocation);
    };
  }, []);

  const openSignal = (signal: ItemSignal) => {
    const url = new URL(window.location.href);
    url.hash = `signal/${encodeURIComponent(signal.id)}`;
    window.history.pushState(window.history.state, "", url);
    setOpenedSignalId(signal.id);
    setOpenedSignalTitle(signal.title || signal.id);
  };

  const closeSignal = () => {
    setOpenedSignalId("");
    setOpenedSignalTitle("");
    if (signalIdFromHash()) {
      const url = new URL(window.location.href);
      url.hash = "";
      window.history.replaceState(window.history.state, "", url);
    }
  };

  return { openedSignalId, openedSignalTitle, openSignal, closeSignal };
}
