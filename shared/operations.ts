export interface TimelineDay {
  date: string;
  balance: number | null;
  unserved: number | null;
  receipts: number;
  expiry: number;
  demand: number;
  status: string;
}
export interface ProjectionRow {
  location_id: string;
  name: string;
  timeline: TimelineDay[];
  shortage_date: string | null;
  service_gap_units: number | null;
  input_status: string;
}
export interface Projection {
  rows: ProjectionRow[];
  total_service_gap: number;
  unsupported_locations: number;
  note: string;
}
export interface Leg {
  source_id: string;
  destination_id: string;
  product_id: string;
  quantity: number;
  evidence: {
    arrival_date: string;
    allocations: { batch_id: string; quantity: number }[];
  };
}
export interface Alternative {
  name: string;
  legs: Leg[];
  projection: Projection;
  unallocated_units?: number;
}
export interface Workflow<T = Record<string, unknown>> {
  id: string;
  kind: string;
  state: string;
  version: number;
  location_ids: string[];
  created_at: string;
  payload: T;
}
export interface ComparisonPayload {
  name: string;
  product_id: string;
  destination_id: string;
  quantity: number;
  as_of: string;
  horizon: number;
  snapshot: {
    inventory_revision: number;
    digest: string;
    locations?: import("./types").NetworkRow[];
  };
  alternatives: Alternative[];
  exclusions: { source_id: string; reason: string }[];
  plan_ids?: string[];
}
export interface ScenarioPayload {
  name: string;
  base_id: string;
  snapshot_digest: string;
  product_id: string;
  as_of: string;
  shock: {
    delay_days: number;
    demand_uplift_pct: number;
    supply_reduction_pct: number;
    location_ids: string[];
  };
  alternatives: Alternative[];
}
export interface SupplierPayload {
  product_id: string;
  location_id: string;
  supplier: string;
  quantity: number;
  received: number;
  accepted: number;
  unit_cost_paise: number;
  promised_on?: string;
  reason: string;
  history: { action: string; reference: string; date?: string }[];
  suggestion: Suggestion;
}
export interface Suggestion {
  suggested_quantity: number | null;
  available_surviving_arrival: number;
  physical: number;
  reserved: number;
  confirmed_inbound: number;
  commitments: number;
  daily_rate: number | null;
  history_days: number;
  pack_size: number;
  lead_days: number;
  coverage_days: number;
  formula: string;
  warning: string | null;
}
export interface CountPayload {
  location_id: string;
  owner_id: string;
  due_on: string;
  reason: string;
  batch_ids: string[];
  snapshot: {
    batch_id: string;
    code: string;
    recorded: number;
    updated_at: string;
    product_id: string;
  }[];
  round: number;
  counts?: Record<string, number>;
  variances?: Record<string, number>;
}
export interface ExceptionPayload {
  title: string;
  kind: string;
  reference: string;
  owner_id: string | null;
  due_on: string | null;
  active: boolean;
  comments: { actor_id: string; text: string; at?: string }[];
}
export interface ReturnPayload {
  line_id: string;
  batch_id: string;
  quantity: number;
  source_id: string;
  destination_id: string;
  reason: string;
  received_batch_id?: string;
}
export interface StockCard {
  opening: number;
  receipts_and_positive_adjustments: number;
  issues_and_negative_adjustments: number;
  calculated_physical: number;
  reconciled: boolean;
  balance: {
    physical: number;
    usable: number;
    reserved: number;
    available: number;
    updated_at: string | null;
  };
  movements: {
    id: string;
    batch_id: string;
    delta: number;
    reason: string;
    reference: string;
    created_at: string;
  }[];
}
export interface Quality {
  raw_sales: number | null;
  raw_requested: number | null;
  adjusted_demand: number | null;
  inferred_lost_units: number | null;
  status: string;
  supported_available_sales_days: number;
  sales_reporting_days: number;
  availability_reporting_days: number;
  calendar_days: number;
  observed_stockout_days: number;
  unsupported_stockout_days: number;
  sensitivity: { rate_multiplier: number; estimated_lost_units: number }[];
  assumptions: string;
  sources: string[];
}
