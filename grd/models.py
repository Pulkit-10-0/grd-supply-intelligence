from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    Index,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def uid():
    return str(uuid4())


def now():
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Record:
    id: Mapped[str] = mapped_column(String(80), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Organisation(Base):
    __tablename__ = "organisations"
    id: Mapped[str] = mapped_column(String(80), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(200))
    revision: Mapped[int] = mapped_column(Integer, default=1)
    mode: Mapped[str] = mapped_column(String(30), default="synthetic")
    scenario_on: Mapped[datetime | None] = mapped_column(Date)


class User(Record, Base):
    __tablename__ = "users"
    email: Mapped[str] = mapped_column(String(200), unique=True)
    password_hash: Mapped[str] = mapped_column(Text)
    role: Mapped[str] = mapped_column(String(30))
    location_ids: Mapped[list] = mapped_column(JSON, default=list)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    token_version: Mapped[int] = mapped_column(Integer, default=1)


class Product(Record, Base):
    __tablename__ = "products"
    name: Mapped[str] = mapped_column(String(200))
    strength: Mapped[str] = mapped_column(String(80), default="")
    dosage_form: Mapped[str] = mapped_column(String(40), default="")
    base_unit: Mapped[str] = mapped_column(String(40))
    pack_size: Mapped[int] = mapped_column(Integer)
    unit_cost_paise: Mapped[int | None] = mapped_column(Integer, nullable=True)
    transfer_allowed: Mapped[bool] = mapped_column(Boolean, default=True)
    provenance: Mapped[dict] = mapped_column(JSON)
    unit_conversions: Mapped[dict] = mapped_column(JSON, default=dict)
    __table_args__ = (CheckConstraint("pack_size > 0"),)


class Location(Record, Base):
    __tablename__ = "locations"
    name: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(30))
    district: Mapped[str] = mapped_column(String(100))
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    coordinate_source: Mapped[str] = mapped_column(String(100), default="not supplied")


class Route(Record, Base):
    __tablename__ = "routes"
    origin_id: Mapped[str] = mapped_column(ForeignKey("locations.id"))
    destination_id: Mapped[str] = mapped_column(ForeignKey("locations.id"))
    lead_days: Mapped[int] = mapped_column(Integer)
    lead_days_upper: Mapped[int] = mapped_column(Integer)
    min_shelf_days: Mapped[int] = mapped_column(Integer, default=30)
    safety_days: Mapped[int] = mapped_column(Integer, default=7)
    min_order: Mapped[int] = mapped_column(Integer, default=1)
    cost_paise: Mapped[int | None] = mapped_column(Integer)
    permitted: Mapped[bool] = mapped_column(Boolean, default=True)
    policy_source: Mapped[str] = mapped_column(String(200))
    max_order_units: Mapped[int | None] = mapped_column(Integer)
    destination_capacity_units: Mapped[int | None] = mapped_column(Integer)
    order_budget_paise: Mapped[int | None] = mapped_column(Integer)
    __table_args__ = (
        UniqueConstraint("org_id", "origin_id", "destination_id"),
        CheckConstraint(
            "lead_days >= 0 AND lead_days_upper >= lead_days AND min_shelf_days >= 0 AND safety_days >= 0 AND min_order > 0"
        ),
    )


class Batch(Record, Base):
    __tablename__ = "batches"
    product_id: Mapped[str] = mapped_column(ForeignKey("products.id"), index=True)
    location_id: Mapped[str] = mapped_column(ForeignKey("locations.id"), index=True)
    code: Mapped[str] = mapped_column(String(100))
    expiry: Mapped[datetime] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(30), default="usable")
    quantity: Mapped[int] = mapped_column(Integer, default=0)
    reserved: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    __table_args__ = (CheckConstraint("quantity >= 0 AND reserved >= 0 AND reserved <= quantity"),)


class Movement(Record, Base):
    __tablename__ = "movements"
    batch_id: Mapped[str] = mapped_column(ForeignKey("batches.id"), index=True)
    delta: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str] = mapped_column(String(100))
    reference: Mapped[str] = mapped_column(String(100))
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    reverses_id: Mapped[str | None] = mapped_column(ForeignKey("movements.id"))


class Demand(Record, Base):
    __tablename__ = "demand"
    date: Mapped[datetime] = mapped_column(Date, index=True)
    product_id: Mapped[str] = mapped_column(ForeignKey("products.id"))
    location_id: Mapped[str] = mapped_column(ForeignKey("locations.id"))
    quantity: Mapped[int] = mapped_column(Integer)
    measure: Mapped[str] = mapped_column(String(30))
    dataset_id: Mapped[str] = mapped_column(String(100))
    __table_args__ = (
        Index("ix_demand_series_date", "org_id", "product_id", "location_id", "measure", "date"),
        UniqueConstraint("org_id", "dataset_id", "date", "product_id", "location_id", "measure"),
        CheckConstraint("quantity >= 0"),
    )


class StockRequest(Record, Base):
    __tablename__ = "requests"
    product_id: Mapped[str] = mapped_column(ForeignKey("products.id"))
    destination_id: Mapped[str] = mapped_column(ForeignKey("locations.id"))
    quantity: Mapped[int] = mapped_column(Integer)
    fulfilled: Mapped[int] = mapped_column(Integer, default=0)
    cancelled: Mapped[int] = mapped_column(Integer, default=0)
    needed_by: Mapped[datetime] = mapped_column(Date)
    reason: Mapped[str] = mapped_column(Text)
    __table_args__ = (
        CheckConstraint(
            "quantity > 0 AND fulfilled >= 0 AND cancelled >= 0 AND fulfilled + cancelled <= quantity"
        ),
    )


class Plan(Record, Base):
    __tablename__ = "plans"
    request_id: Mapped[str | None] = mapped_column(ForeignKey("requests.id"))
    source_id: Mapped[str] = mapped_column(ForeignKey("locations.id"))
    destination_id: Mapped[str] = mapped_column(ForeignKey("locations.id"))
    product_id: Mapped[str] = mapped_column(ForeignKey("products.id"))
    quantity: Mapped[int] = mapped_column(Integer)
    version: Mapped[int] = mapped_column(Integer, default=1)
    input_revision: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(30), default="proposed")
    explanation: Mapped[dict] = mapped_column(JSON)
    approved_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    minimum_shelf_days: Mapped[int] = mapped_column(Integer)
    arrival_date: Mapped[datetime] = mapped_column(Date)
    as_of: Mapped[datetime] = mapped_column(Date)
    __table_args__ = (CheckConstraint("quantity > 0"),)


class Allocation(Record, Base):
    __tablename__ = "allocations"
    plan_id: Mapped[str] = mapped_column(ForeignKey("plans.id"), index=True)
    batch_id: Mapped[str] = mapped_column(ForeignKey("batches.id"))
    quantity: Mapped[int] = mapped_column(Integer)
    dispatched: Mapped[int] = mapped_column(Integer, default=0)
    released: Mapped[int] = mapped_column(Integer, default=0)
    __table_args__ = (
        CheckConstraint(
            "quantity > 0 AND dispatched >= 0 AND released >= 0 AND dispatched + released <= quantity"
        ),
    )


class Shipment(Record, Base):
    __tablename__ = "shipments"
    plan_id: Mapped[str] = mapped_column(ForeignKey("plans.id"), index=True)
    expected_on: Mapped[datetime] = mapped_column(Date)
    dispatched_on: Mapped[datetime] = mapped_column(Date)
    received_on: Mapped[datetime | None] = mapped_column(Date)


class ShipmentLine(Record, Base):
    __tablename__ = "shipment_lines"
    shipment_id: Mapped[str] = mapped_column(ForeignKey("shipments.id"), index=True)
    source_batch_id: Mapped[str] = mapped_column(ForeignKey("batches.id"))
    quantity: Mapped[int] = mapped_column(Integer)
    received: Mapped[int] = mapped_column(Integer, default=0)
    accepted: Mapped[int] = mapped_column(Integer, default=0)
    returned: Mapped[int] = mapped_column(Integer, default=0)
    __table_args__ = (
        CheckConstraint(
            "quantity > 0 AND received >= 0 AND received <= quantity AND accepted >= 0 AND accepted <= received AND returned >= 0 AND returned <= accepted"
        ),
    )


class Case(Record, Base):
    __tablename__ = "cases"
    location_id: Mapped[str] = mapped_column(ForeignKey("locations.id"))
    kind: Mapped[str] = mapped_column(String(40))
    reference: Mapped[str] = mapped_column(String(100))
    details: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(30), default="open")
    owner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    due_on: Mapped[datetime | None] = mapped_column(Date)
    comments: Mapped[list] = mapped_column(JSON, default=list)


class Audit(Record, Base):
    __tablename__ = "audit"
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(100))
    reference: Mapped[str] = mapped_column(String(100))
    details: Mapped[dict] = mapped_column(JSON)
    location_ids: Mapped[list] = mapped_column(JSON, default=list)


class Idempotency(Record, Base):
    __tablename__ = "idempotency"
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    key: Mapped[str] = mapped_column(String(150))
    digest: Mapped[str] = mapped_column(String(64))
    result: Mapped[dict] = mapped_column(JSON)
    __table_args__ = (UniqueConstraint("org_id", "actor_id", "key"),)


class Dataset(Record, Base):
    __tablename__ = "datasets"
    name: Mapped[str] = mapped_column(String(200))
    provenance: Mapped[dict] = mapped_column(JSON)
    digest: Mapped[str] = mapped_column(String(64))
    row_count: Mapped[int] = mapped_column(Integer)


class Policy(Record, Base):
    __tablename__ = "policies"
    title: Mapped[str] = mapped_column(String(200))
    version: Mapped[str] = mapped_column(String(40))
    effective_on: Mapped[datetime] = mapped_column(Date)
    approved: Mapped[bool] = mapped_column(Boolean, default=False)
    text: Mapped[str] = mapped_column(Text)
    location_ids: Mapped[list] = mapped_column(JSON, default=list)


class Job(Record, Base):
    __tablename__ = "jobs"
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    kind: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(30), default="queued")
    progress: Mapped[int] = mapped_column(Integer, default=0)
    payload: Mapped[dict] = mapped_column(JSON)
    result: Mapped[dict] = mapped_column(JSON, default=dict)
    error: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Workflow(Record, Base):
    """Versioned operational aggregate. Payloads validated by workflow-specific inputs.

    Organisation lock serialises transitions and their ledger/idempotency writes.
    Every location in a payload must also be present in location_ids.
    """
    __tablename__ = "workflows"
    kind: Mapped[str] = mapped_column(String(40), index=True)
    state: Mapped[str] = mapped_column(String(30), default="draft")
    version: Mapped[int] = mapped_column(Integer, default=1)
    location_ids: Mapped[list] = mapped_column(JSON, default=list)
    payload: Mapped[dict] = mapped_column(JSON)
    identity: Mapped[str | None] = mapped_column(String(200), nullable=True)
    __table_args__ = (UniqueConstraint("org_id", "kind", "identity"),)


class Availability(Record, Base):
    __tablename__ = "availability"
    product_id: Mapped[str] = mapped_column(ForeignKey("products.id"))
    location_id: Mapped[str] = mapped_column(ForeignKey("locations.id"))
    date: Mapped[datetime] = mapped_column(Date)
    reported: Mapped[bool] = mapped_column(Boolean)
    available: Mapped[bool] = mapped_column(Boolean)
    source: Mapped[str] = mapped_column(String(500))
    __table_args__ = (UniqueConstraint("org_id", "product_id", "location_id", "date"),)
