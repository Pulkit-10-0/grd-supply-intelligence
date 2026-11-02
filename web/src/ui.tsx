import { useEffect, useRef, type ReactNode } from "react";
import { X, LoaderCircle, ArrowUpRight, Inbox } from "lucide-react";

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return (
    <span className={`badge ${tone}`}>
      <i />
      {children}
    </span>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Inbox size={23} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Loading({ label = "Loading workspace" }: { label?: string }) {
  return (
    <div className="loading">
      <LoaderCircle className="spin" size={24} />
      <span>{label}</span>
    </div>
  );
}
export function Modal({
  title,
  eyebrow,
  children,
  onClose,
  wide = false,
  busy = false,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const node = ref.current;
    const focusable = () =>
      Array.from(
        node?.querySelectorAll<HTMLElement>(
          "button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]",
        ) || [],
      );
    focusable()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busyRef.current) closeRef.current();
      if (e.key === "Tab") {
        const list = focusable();
        const first = list[0],
          last = list.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={ref}
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="modal-header">
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            <h2>{title}</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close dialog"
            disabled={busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
export function SectionTitle({
  eyebrow,
  title,
  children,
  action,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="section-title">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
        {children && <p>{children}</p>}
      </div>
      {action}
    </div>
  );
}
export function Stat({
  label,
  value,
  detail,
  icon,
  tone = "green",
}: {
  label: string;
  value: ReactNode;
  detail: ReactNode;
  icon: ReactNode;
  tone?: string;
}) {
  return (
    <div className="stat">
      <div className="stat-top">
        <span>{label}</span>
        <span className={`stat-icon ${tone}`}>{icon}</span>
      </div>
      <strong>{value}</strong>
      <div className="stat-bottom">
        {detail}
        <ArrowUpRight size={14} />
      </div>
    </div>
  );
}
