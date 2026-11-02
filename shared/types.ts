export interface Me {
  session_expires_at?: string;
  id: string;
  email: string;
  role: string;
  location_ids: string[];
  organisation_id: string;
  evidence_type: string;
  inventory_revision: number;
  scenario_on: string | null;
}
export interface Product {
  id: string;
  name: string;
  base_unit: string;
  pack_size: number;
  unit_cost_paise: number | null;
  transfer_allowed: boolean;
  provenance: Record<string, unknown>;
}
export interface Location {
  id: string;
  name: string;
  kind: string;
  district: string;
  latitude: number | null;
  longitude: number | null;
  coordinate_source: string;
}
export interface Batch {
  id: string;
  product_id: string;
  location_id: string;
  code: string;
  expiry: string;
  status: string;
  quantity: number;
  reserved: number;
  updated_at: string;
}
export interface NetworkRow {
  timeline?: import("./operations").TimelineDay[];
  input_status?: string;
  service_gap_units?: number | null;
  action_deadline?: {
    latest_action_on: string;
    slack_days: number;
    lead_days_upper: number;
    approval_handling_days: number;
    assumption: string;
  } | null;
  location_id: string;
  name: string;
  district: string;
  kind: string;
  product_id: string;
  coordinate_source: string;
  balance: {
    known: boolean;
    physical: number;
    usable: number;
    reserved: number;
    available: number;
    updated_at: string | null;
  };
  daily_rate: number | null;
  rate_measure: string | null;
  history_days: number;
  shortage_date: string | null;
  days_of_cover: number | null;
  projected_expiry_units: number;
  stock_age_hours: number | null;
  status: string;
  projection_method: string;
  inbound_units: number;
  evidence_type: string;
  forecast_job_id?: string | null;
}
export interface Network {
  type: string;
  table: NetworkRow[];
  features: unknown[];
  horizon_days: number;
  as_of: string;
  inventory_revision: number;
  evidence_type: string;
}
export interface StockRequest {
  id: string;
  product_id: string;
  destination_id: string;
  quantity: number;
  fulfilled: number;
  cancelled: number;
  needed_by: string;
  reason: string;
  created_at: string;
}
export interface Explanation {
  allocations: { batch_id: string; quantity: number }[];
  arrival_date: string;
  minimum_shelf_days: number;
  source_available: number;
  donor_protected: number;
  cost_paise: number | null;
  policy_source: string;
  [key: string]: unknown;
}
export interface Plan {
  id: string;
  request_id: string | null;
  source_id: string;
  destination_id: string;
  product_id: string;
  quantity: number;
  version: number;
  status: string;
  input_revision: number;
  arrival_date: string;
  as_of: string;
  explanation: Explanation;
  created_at: string;
}
export interface ShipmentLine {
  batch_code?: string;
  expiry?: string;
  id: string;
  source_batch_id: string;
  quantity: number;
  received: number;
  accepted: number;
  returned: number;
}
export interface Shipment {
  id: string;
  plan_id: string;
  expected_on: string;
  dispatched_on: string;
  received_on: string | null;
  source_id: string;
  destination_id: string;
  lines: ShipmentLine[];
  created_at: string;
}
export interface Case {
  id: string;
  location_id: string;
  kind: string;
  reference: string;
  status: string;
  details: Record<string, unknown>;
  owner_id: string | null;
  due_on: string | null;
  comments: { actor_id: string; text: string }[];
  created_at: string;
}
export interface Audit {
  id: string;
  action: string;
  reference: string;
  details: Record<string, unknown>;
  created_at: string;
  actor_id: string;
}
export interface Dataset {
  id: string;
  name: string;
  row_count: number;
  digest: string;
  provenance: Record<string, unknown>;
}
export interface ForecastPoint {
  weeks_ahead: number;
  week_ending: string;
  quantity: number;
  lower?: number | null;
  upper?: number | null;
}
export interface Metrics {
  wape_pct: number | null;
  bias_pct: number | null;
  mae: number;
  observations: number;
  interval_coverage?: number;
}
export interface ForecastResult {
  selection?: string;
  status?: string;
  reason?: string;
  selected_model?: string;
  forecast?: ForecastPoint[];
  operational_forecast?: ForecastPoint[];
  test_metrics_by_horizon?: Record<string, Record<string, Metrics>>;
  complete_weeks?: number;
  interval_note?: string;
  model_version?: string;
  dataset_ids?: string[];
  source_cutoff?: string;
  evidence_type?: string;
  baseline?: Record<string, number | null>;
  proposed?: Record<string, number | null>;
  change?: Record<string, { absolute: number; relative_pct: number | null }>;
  service_change_percentage_points?: number | null;
  assumptions?: string[];
  [key: string]: unknown;
}
export interface Job {
  id: string;
  kind: string;
  status: string;
  progress: number;
  payload: {
    product_id: string;
    location_id: string;
    as_of: string;
    [key: string]: unknown;
  };
  result: ForecastResult;
  error: string | null;
  created_at: string;
}
export interface Route {
  id: string;
  origin_id: string;
  destination_id: string;
  lead_days: number;
  lead_days_upper: number;
  permitted: boolean;
  min_shelf_days: number;
  cost_paise: number | null;
  policy_source: string;
}
export interface Data {
  operations?: import("./operations").Workflow<unknown>[];
  me: Me;
  products: Product[];
  locations: Location[];
  routes: Route[];
  batches: Batch[];
  requests: StockRequest[];
  plans: Plan[];
  shipments: Shipment[];
  cases: Case[];
  jobs: Job[];
  audit: Audit[];
  datasets: Dataset[];
  reconciliation: { ok: boolean; batches: unknown[] };
}
export interface Option {
  source_id: string;
  feasible: boolean;
  reason?: string;
  evidence?: Explanation;
}
export type View =
  | "overview"
  | "actions"
  | "inventory"
  | "forecasts"
  | "activity"
  | "sources"
  | "planning"
  | "operations"
  | "evidence";
