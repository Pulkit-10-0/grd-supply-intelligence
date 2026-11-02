"""Versioned workflows and dated availability evidence (additive upgrade)."""

from alembic import op
import sqlalchemy as sa

revision = "c92e56a1f710"
down_revision = "b8d3c71a402e"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "workflows",
        sa.Column("id", sa.String(80), primary_key=True),
        sa.Column("org_id", sa.String(80), sa.ForeignKey("organisations.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("kind", sa.String(40), nullable=False),
        sa.Column("state", sa.String(30), nullable=False),
        sa.Column("version", sa.Integer, nullable=False),
        sa.Column("location_ids", sa.JSON, nullable=False),
        sa.Column("payload", sa.JSON, nullable=False),
        sa.Column("identity", sa.String(200)),
        sa.UniqueConstraint("org_id", "kind", "identity"),
    )
    op.create_index("ix_workflows_org_id", "workflows", ["org_id"])
    op.create_index("ix_workflows_kind", "workflows", ["kind"])
    op.create_table(
        "availability",
        sa.Column("id", sa.String(80), primary_key=True),
        sa.Column("org_id", sa.String(80), sa.ForeignKey("organisations.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("product_id", sa.String(80), sa.ForeignKey("products.id"), nullable=False),
        sa.Column("location_id", sa.String(80), sa.ForeignKey("locations.id"), nullable=False),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("reported", sa.Boolean, nullable=False),
        sa.Column("available", sa.Boolean, nullable=False),
        sa.Column("source", sa.String(500), nullable=False),
        sa.UniqueConstraint("org_id", "product_id", "location_id", "date"),
    )
    op.create_index("ix_availability_org_id", "availability", ["org_id"])


def downgrade():
    op.drop_table("availability")
    op.drop_table("workflows")
