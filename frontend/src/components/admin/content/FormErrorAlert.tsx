import { Icon } from "@/components/admin/icons";
import { errorSummary } from "./forms";

/**
 * Error box at the top of a form (used inside dialogs, where toasts are hidden behind the
 * backdrop): a general message and/or one line per invalid field, so errors further down the
 * form are not missed. Renders nothing when there is nothing to report.
 */
export function FormErrorAlert({
  message,
  errors,
  labels,
}: {
  /** Error without a field (network, 5xx…). */
  message?: string | null;
  /** Field errors to list (`{field: message}`). */
  errors?: Record<string, string>;
  /** Readable names of fields (`{cta_url: "Button link"}`). */
  labels?: Record<string, string>;
}) {
  const lines = errors ? errorSummary(errors, labels) : [];
  if (!message && !lines.length) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-lg bg-danger-soft px-3 py-2.5 text-sm text-danger"
    >
      <Icon name="alert" className="mt-0.5 size-4" />
      <div className="min-w-0">
        <p className="font-medium">{message ?? "Some fields need attention:"}</p>
        {lines.length ? (
          <ul className="mt-1 list-disc space-y-0.5 ps-4 text-[0.8125rem]">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
