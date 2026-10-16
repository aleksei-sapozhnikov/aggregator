import type { MouseEvent, ReactNode } from "react";
import type { ItemSignal } from "../shared/types";
import { buildStatusText } from "../shared/statusText";
import DetailsDisclosureHeader from "./DetailsDisclosureHeader";
import ModalDetailsTrigger from "./shared/ui/ModalDetailsTrigger";
import ItemNavigationLink from "./shared/ui/ItemNavigationLink";
import SecondaryLabel from "./shared/ui/SecondaryLabel";

export type UnhealthyDependencyRow = {
  id: string;
  title: string;
  signals: ItemSignal[];
  href?: string;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
};

type SignalActions = {
  buildSignalLink?: (id: string) => string;
  onSignalClick?: (event: MouseEvent<HTMLAnchorElement>, signal: ItemSignal) => void;
};

function SignalName({ signal, buildSignalLink, onSignalClick }: SignalActions & { signal: ItemSignal }) {
  const content = signal.title || signal.id;
  return (
    <>
      {buildSignalLink && onSignalClick ? (
        <ModalDetailsTrigger className="signal-name" title={content} href={buildSignalLink(signal.id)}
          onClick={(event) => onSignalClick(event, signal)}>{content}</ModalDetailsTrigger>
      ) : (
        <ModalDetailsTrigger className="signal-name" title={content}>{content}</ModalDetailsTrigger>
      )}
      {signal.status === "unknown" && <span className="signal-unknown-label">UNKNOWN</span>}
    </>
  );
}

type SignalsProps = SignalActions & {
  signals: ItemSignal[];
  expanded: boolean;
  onToggle?: () => void;
  help?: ReactNode;
};

function OwnSignalRow({ signal, healthy, ...actions }: SignalActions & { signal: ItemSignal; healthy: boolean }) {
  return (
    <li className={healthy ? "signals-healthy-row" : "signals-unhealthy-own-row"}
      aria-label={`${signal.title || signal.id}, ${buildStatusText(signal.status)}`}>
      <div className="signal-row signal-status-row"><SignalName signal={signal} {...actions} /></div>
    </li>
  );
}

export function HealthySignals({ signals, count = signals.length, expanded, onToggle, help, ...actions }: SignalsProps & { count?: number }) {
  return (
    <div className="details-disclosure-section">
      <DetailsDisclosureHeader label={`Healthy signals (${count})`} toggleLabel="Toggle Healthy signals"
        expanded={expanded} onToggle={onToggle} help={help}
        icon={<span className="status-indicator status-up details-disclosure-status" aria-hidden="true" />} />
      <div className={`disclosure-panel ${expanded ? "is-open" : ""}`}>
        <ul className="signals-healthy-list">
          {signals.map((signal) => <OwnSignalRow key={signal.id} signal={signal} healthy {...actions} />)}
        </ul>
      </div>
    </div>
  );
}

export function UnhealthySignals({ signals, dependencies, expanded, onToggle, help, ...actions }: SignalsProps & { dependencies: UnhealthyDependencyRow[] }) {
  const count = signals.length + dependencies.reduce((total, row) => total + row.signals.length, 0);
  return (
    <div className="details-disclosure-section">
      <DetailsDisclosureHeader label={`Unhealthy signals (${count})`} toggleLabel="Toggle Unhealthy signals"
        expanded={expanded} onToggle={onToggle} help={help}
        icon={<span className="status-indicator status-down details-disclosure-status" aria-hidden="true" />} />
      <div className={`disclosure-panel ${expanded ? "is-open" : ""}`}>
        <ul className="details-unhealthy-list">
          {signals.map((signal) => <OwnSignalRow key={signal.id} signal={signal} healthy={false} {...actions} />)}
          {dependencies.map((row) => (
            <li key={row.id} className="signals-incident-row">
              <div className="signals-dependency-row">
                <ItemNavigationLink title={row.title} href={row.href} onClick={row.onClick}>{row.title}</ItemNavigationLink>
                <SecondaryLabel text="Dependency" />
              </div>
              <ul className="signals-incident-signal-list">
                {row.signals.map((signal) => (
                  <li key={signal.id} className="signals-incident-signal" title={signal.title || signal.id}
                    aria-label={`${signal.title || signal.id}, ${buildStatusText(signal.status)}`}>
                    <SignalName signal={signal} {...actions} />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
