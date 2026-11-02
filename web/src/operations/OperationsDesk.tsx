import { useState } from "react";
import {
  Bell,
  ClipboardCheck,
  FileCheck2,
  PackagePlus,
  RotateCcw,
} from "lucide-react";
import type { Data } from "../types";
import { Suppliers } from "./Suppliers";
import { Counts } from "./Counts";
import { Inbox } from "./Inbox";
import { Returns } from "./Returns";
import { Documents } from "./Documents";

export function OperationsDesk(props: {
  data: Data;
  asOf: string;
  onRefresh: () => Promise<void>;
  notify: (s: string) => void;
  onOpen: (kind: string, id: string) => void;
  initialTab?: string;
}) {
  const [tab, setTab] = useState(props.initialTab || "inbox");
  return (
    <div className="operations-space">
      <div className="page-heading">
        <div>
          <p className="eyebrow">FROM DECISION TO DELIVERY</p>
          <h1>Every handoff, accounted for.</h1>
          <p>
            One desk for exceptions, replenishment, warehouse work and returns.
          </p>
        </div>
      </div>
      <div
        className="ops-navigation"
        role="tablist"
        aria-label="Operations workspaces"
      >
        {[
          { id: "inbox", label: "Exception inbox", Icon: Bell },
          { id: "orders", label: "Supplier orders", Icon: PackagePlus },
          { id: "counts", label: "Count sessions", Icon: ClipboardCheck },
          { id: "documents", label: "Dispatch & delivery", Icon: FileCheck2 },
          { id: "returns", label: "Return transfers", Icon: RotateCcw },
        ].map(({ id, label, Icon }) => (
          <button
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "active" : ""}
            key={id}
            onClick={() => setTab(id)}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </div>
      <section className="panel ops-main-panel">
        {tab === "inbox" && (
          <Inbox
            {...props}
            onOpen={(kind, id) => {
              if (kind === "count_session") setTab("counts");
              else if (kind === "supplier_order") setTab("orders");
              else props.onOpen(kind, id);
            }}
          />
        )}
        {tab === "orders" && <Suppliers {...props} />}{" "}
        {tab === "counts" && <Counts {...props} />}{" "}
        {tab === "documents" && <Documents {...props} />}{" "}
        {tab === "returns" && <Returns {...props} />}
      </section>
    </div>
  );
}
