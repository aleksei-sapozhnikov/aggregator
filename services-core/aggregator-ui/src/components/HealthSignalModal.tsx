import { useEffect, useState } from "react";
import type { CatalogItem } from "../shared/types";
import { isPlainLeftClick } from "../shared/catalogUtils";
import ModalWindow from "./shared/ui/ModalWindow";
import ItemNavigationLink from "./ItemNavigationLink";

type HealthSignalDetails = Record<string, unknown> & {
  id: string;
  itemId: string;
  type: string;
  title?: string;
};

type HealthSignalModalProps = {
  isOpen: boolean;
  signalId: string;
  fallbackTitle?: string;
  items: CatalogItem[];
  buildItemLink: (itemId: string) => string;
  onSelectItemById: (itemId: string) => void;
  onClose: () => void;
};

const formatFieldValue = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, 2) ?? String(value);
};

const isHealthSignalDetails = (
  value: unknown,
  signalId: string,
): value is HealthSignalDetails =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  "id" in value &&
  value.id === signalId &&
  "itemId" in value &&
  typeof value.itemId === "string" &&
  "type" in value &&
  typeof value.type === "string";

export default function HealthSignalModal({
  isOpen,
  signalId,
  fallbackTitle,
  items,
  buildItemLink,
  onSelectItemById,
  onClose,
}: HealthSignalModalProps) {
  const [details, setDetails] = useState<HealthSignalDetails | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !signalId) {
      return undefined;
    }

    const controller = new AbortController();
    setDetails(null);
    setError("");
    setIsLoading(true);

    const loadSignal = async () => {
      try {
        const response = await fetch(
          new URL(
            `catalog/api/signals/${encodeURIComponent(signalId)}`,
            new URL(import.meta.env.BASE_URL || "/", window.location.origin),
          ),
          { signal: controller.signal },
        );
        if (!response.ok) {
          throw new Error(
            response.status === 404
              ? "Signal not found in the catalog."
              : "Unable to load signal details from the catalog.",
          );
        }
        const payload: unknown = await response.json();
        if (!isHealthSignalDetails(payload, signalId)) {
          throw new Error("Invalid signal details returned by the catalog.");
        }
        if (!controller.signal.aborted) {
          setDetails(payload);
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to load signal details from the catalog.",
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    void loadSignal();
    return () => controller.abort();
  }, [isOpen, signalId]);

  const signal = details?.id === signalId ? details : null;
  const itemId = signal?.itemId || "";
  const itemTitle = items.find((item) => item.id === itemId)?.title || itemId;
  const otherFields = signal
    ? Object.entries(signal).filter(
        ([key]) =>
          key !== "id" && key !== "title" && key !== "itemId" && key !== "type",
      )
    : [];

  return (
    <ModalWindow
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel="Health signal details"
      closeLabel="Close health signal details"
      header={<h2>Health signal</h2>}
    >
      {isLoading && <p role="status">Loading signal details...</p>}
      {error && <p role="alert">{error}</p>}
      {signal && (
        <table className="health-signal-details-table">
          <tbody>
            <tr>
              <th scope="row">title</th>
              <td className="health-signal-field-value">
                {signal.title || fallbackTitle || signal.id}
              </td>
            </tr>
            <tr>
              <th scope="row">item</th>
              <td>
                <ItemNavigationLink
                  href={buildItemLink(itemId)}
                  onClick={(event) => {
                    if (!isPlainLeftClick(event)) {
                      return;
                    }
                    event.preventDefault();
                    onClose();
                    onSelectItemById(itemId);
                  }}
                >
                  {itemTitle}
                </ItemNavigationLink>
              </td>
            </tr>
            <tr>
              <th scope="row">type</th>
              <td>{signal.type}</td>
            </tr>
            {otherFields.map(([key, value]) => (
              <tr key={key}>
                <th scope="row">{key}</th>
                <td className="health-signal-field-value">
                  {formatFieldValue(value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ModalWindow>
  );
}
