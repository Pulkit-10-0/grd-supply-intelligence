from datetime import date
from typing import Annotated, Literal
from pydantic import Field
from .schemas import Input, Identifier, Reason, Positive, Nonnegative, ReceiptLine


class Compare(Input):
    product_id: Identifier
    destination_id: Identifier
    quantity: Positive
    as_of: date
    horizon: Annotated[int, Field(ge=7, le=90)] = 28
    name: Annotated[str, Field(min_length=3, max_length=120)] = "Supply comparison"


class Shock(Input):
    name: Annotated[str, Field(min_length=3, max_length=120)]
    delay_days: Annotated[int, Field(ge=0, le=60)] = 0
    demand_uplift_pct: Annotated[int, Field(ge=0, le=300)] = 0
    supply_reduction_pct: Annotated[int, Field(ge=0, le=100)] = 0
    location_ids: Annotated[list[Identifier], Field(max_length=100)] = []


class Version(Input):
    version: Positive
    as_of: date


class Choice(Version):
    alternative: Annotated[int, Field(ge=1, le=100)]


class Delivery(Input):
    lines: Annotated[list[ReceiptLine], Field(min_length=0, max_length=100)]
    as_of: date
    receiver: Annotated[str, Field(min_length=2, max_length=120)]
    reference: Annotated[str, Field(min_length=3, max_length=120)]
    confirmed: Literal[True]
    short_lines: Annotated[list[Identifier], Field(max_length=100)] = []


class SupplierOrder(Input):
    product_id: Identifier
    location_id: Identifier
    supplier: Annotated[str, Field(min_length=2, max_length=150)]
    quantity: Positive
    unit_cost_paise: Nonnegative
    lead_days: Annotated[int, Field(ge=1, le=90)] = 7
    coverage_days: Annotated[int, Field(ge=1, le=180)] = 28
    as_of: date
    reason: Reason


class OrderEvent(Version):
    action: Literal["approve", "acknowledge", "cancel"]
    reference: Reason
    promised_on: date | None = None


class SupplierReceipt(Version):
    quantity: Nonnegative
    damaged: Nonnegative = 0
    code: Annotated[str, Field(min_length=1, max_length=100)]
    expiry: date
    reference: Reason


class CountSession(Input):
    location_id: Identifier
    batch_ids: Annotated[list[Identifier], Field(min_length=1, max_length=100)]
    owner_id: Identifier
    due_on: date
    reason: Reason


class CountEntry(Input):
    batch_id: Identifier
    quantity: Nonnegative


class CountEvent(Version):
    action: Literal["submit", "recount", "approve", "cancel"]
    lines: Annotated[list[CountEntry], Field(max_length=100)] = []
    reason: Reason


class AvailabilityDay(Input):
    date: date
    reported: bool
    available: bool


class AvailabilityInput(Input):
    product_id: Identifier
    location_id: Identifier
    days: Annotated[list[AvailabilityDay], Field(min_length=1, max_length=366)]
    source: Annotated[str, Field(min_length=3, max_length=500)]


class InboxEvent(Input):
    version: Positive
    action: Literal["acknowledge", "resolve", "reopen", "assign"]
    owner_id: Identifier | None = None
    due_on: date | None = None
    reason: Reason


class SyncFailure(Input):
    location_id: Identifier
    command_id: Identifier
    reason: Reason


class ReturnStart(Input):
    line_id: Identifier
    batch_id: Identifier
    quantity: Positive
    as_of: date
    reason: Reason


class ReturnEvent(Version):
    action: Literal["approve", "dispatch", "receive", "cancel", "release", "quarantine"]
    reason: Reason
