"""Index the actual demand-series queries used by forecasts and the map.

Revision ID: b8d3c71a402e
Revises: afc5260f2879
"""

from alembic import op

revision = "b8d3c71a402e"
down_revision = "afc5260f2879"
branch_labels = None
depends_on = None


def upgrade():
    op.create_index(
        "ix_demand_series_date", "demand", ["org_id", "product_id", "location_id", "measure", "date"]
    )


def downgrade():
    op.drop_index("ix_demand_series_date", table_name="demand")
