from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt, StringConstraints

Positive = Annotated[StrictInt, Field(gt=0, le=100_000_000)]
Nonnegative = Annotated[StrictInt, Field(ge=0, le=100_000_000)]
Identifier = Annotated[str, Field(min_length=1, max_length=80)]
Reason = Annotated[str, Field(min_length=3, max_length=2000)]


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, allow_inf_nan=False)


class Login(Input):
    email: Annotated[str, Field(max_length=200)]
    password: Annotated[str, StringConstraints(strip_whitespace=False), Field(max_length=200)]


class UserInput(Input):
    email: Annotated[str, Field(min_length=3, max_length=200)]
    password: Annotated[str, StringConstraints(strip_whitespace=False), Field(min_length=12, max_length=200)]
    role: Literal["manager", "planner", "operator", "steward", "viewer"]
    location_ids: list[Identifier]


class ProductInput(Input):
    id: Identifier
    name: Annotated[str, Field(min_length=2, max_length=200)]
    strength: str = ""
    dosage_form: str = ""
    base_unit: Annotated[str, Field(min_length=1, max_length=40)]
    pack_size: Positive
    unit_cost_paise: Nonnegative | None = None
    transfer_allowed: bool = True
    provenance: dict
    unit_conversions: dict[str, Positive] = {}


class LocationInput(Input):
    id: Identifier
    name: str
    kind: Literal["warehouse", "distributor", "retailer", "hospital"]
    district: str
    latitude: Annotated[float, Field(ge=-90, le=90)] | None = None
    longitude: Annotated[float, Field(ge=-180, le=180)] | None = None
    coordinate_source: str = "not supplied"


class RouteInput(Input):
    origin_id: Identifier
    destination_id: Identifier
    lead_days: Nonnegative
    lead_days_upper: Nonnegative
    min_shelf_days: Nonnegative = 30
    safety_days: Nonnegative = 7
    min_order: Positive = 1
    cost_paise: Nonnegative | None = None
    permitted: bool = True
    policy_source: Reason
    max_order_units: Positive | None = None
    destination_capacity_units: Positive | None = None
    order_budget_paise: Nonnegative | None = None


class UnitConversion(Input):
    product_id: Identifier
    quantity: Nonnegative
    from_unit: str
    to_unit: str


class Issue(Input):
    quantity: Positive
    reason: Reason
    as_of: date


class BatchInput(Input):
    product_id: Identifier
    location_id: Identifier
    code: Annotated[str, Field(min_length=1, max_length=100)]
    expiry: date
    quantity: Nonnegative
    status: Literal["usable", "quarantined", "damaged", "return_pending", "blocked"] = "usable"
    reason: Reason


class RequestInput(Input):
    product_id: Identifier
    destination_id: Identifier
    quantity: Positive
    needed_by: date
    reason: Reason


class PlanInput(Input):
    source_id: Identifier
    destination_id: Identifier
    product_id: Identifier
    quantity: Positive
    as_of: date
    request_id: Identifier | None = None


class Approval(Input):
    version: Positive
    as_of: date


class Explanation(Input):
    reason: Reason


class Dispatch(Input):
    quantity: Positive
    as_of: date


class ReceiptLine(Input):
    line_id: Identifier
    accepted: Nonnegative
    damaged: Nonnegative = 0
    reason: str = ""


class Receipt(Input):
    lines: Annotated[list[ReceiptLine], Field(min_length=1, max_length=100)]
    as_of: date


class Hold(Input):
    status: Literal["usable", "quarantined", "damaged", "return_pending", "blocked"]
    reason: Reason


class Count(Input):
    quantity: Nonnegative
    reason: Reason
    expected_updated_at: datetime | None = None


class Adjustment(Input):
    case_id: Identifier
    reason: Reason


class Return(Input):
    line_id: Identifier
    batch_id: Identifier
    quantity: Positive
    reason: Reason


class ForecastJob(Input):
    product_id: Identifier
    location_id: Identifier
    as_of: date
    measure: Literal["requested", "sales"] = "requested"
    horizons: Annotated[list[Annotated[StrictInt, Field(ge=1, le=4)]], Field(min_length=1, max_length=4)] = [
        1,
        2,
        4,
    ]


class SimulationJob(Input):
    product_id: Identifier
    location_id: Identifier
    as_of: date
    seed: Annotated[StrictInt, Field(ge=0, le=4_294_967_295)] = 42
    days: Annotated[int, Field(ge=30, le=365)] = 90
    lead_days: Annotated[int, Field(ge=1, le=60)] = 5
    proposed_safety_days: Annotated[int, Field(ge=0, le=90)] = 10


class Question(Input):
    mode: Literal["operations", "policy"]
    question: Annotated[str, Field(min_length=3, max_length=1000)]
    reference_id: str | None = None
    as_of: date


class PolicyInput(Input):
    title: str
    version: str
    effective_on: date
    text: Annotated[str, Field(min_length=10, max_length=100000)]
    location_ids: list[Identifier] = []


class CaseUpdate(Input):
    comment: Reason
    owner_id: Identifier | None = None
    due_on: date | None = None
    resolve: bool = False
