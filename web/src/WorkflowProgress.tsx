import type { ReactNode } from "react";
import { Check, ArrowRight } from "lucide-react";

export function WorkflowProgress({
  steps,
  stage,
  label = "Progress",
  compact = false,
  cancelled = false,
  partialStep,
}: {
  steps: string[];
  stage: number;
  label?: string;
  compact?: boolean;
  cancelled?: boolean;
  partialStep?: number;
}) {
  return (
    <ol
      className={`workflow-progress ${compact ? "compact" : ""}`}
      aria-label={label}
    >
      {steps.map((step, i) => (
        <li
          key={step}
          className={
            partialStep === i
              ? "partial"
              : cancelled && stage < 0
                ? "stopped"
                : i < stage || stage === steps.length - 1
                  ? "complete"
                  : i === stage
                    ? "current"
                    : "upcoming"
          }
          aria-current={i === stage ? "step" : undefined}
        >
          <span className="workflow-dot">
            {partialStep !== i && (i < stage || stage === steps.length - 1) ? (
              <Check size={13} />
            ) : (
              i + 1
            )}
          </span>
          <span>
            {step}
            {partialStep === i && <small> · partial</small>}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function Details({
  title,
  children,
  open = false,
}: {
  title: string;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details className="disclosure" open={open || undefined}>
      <summary>{title}</summary>
      <div className="disclosure-content">{children}</div>
    </details>
  );
}

export function NextStep({
  title = "Next step",
  children,
  complete = false,
}: {
  title?: string;
  children: ReactNode;
  complete?: boolean;
}) {
  return (
    <div className={`next-step ${complete ? "is-complete" : ""}`}>
      <span className="next-step-icon">
        {complete ? <Check size={18} /> : <ArrowRight size={18} />}
      </span>
      <div>
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
    </div>
  );
}
