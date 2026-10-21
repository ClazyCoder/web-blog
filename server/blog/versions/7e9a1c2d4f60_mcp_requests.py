"""MCP approval requests, audit trail and cleanup preservation.

Revision ID: 7e9a1c2d4f60
Revises: 03944ec69ea4
"""
from alembic import op
import sqlalchemy as sa

revision = "7e9a1c2d4f60"
down_revision = "03944ec69ea4"
branch_labels = depends_on = None


def upgrade():
    op.add_column("images", sa.Column("mcp_managed", sa.Boolean(), nullable=False,
                                    server_default=sa.false()))
    op.create_table(
        "mcp_requests",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("owner", sa.String(64), nullable=False),
        sa.Column("client_id", sa.String(200), nullable=False),
        sa.Column("grant_id", sa.String(64)),
        sa.Column("idempotency_key", sa.String(128), nullable=False),
        sa.Column("action", sa.String(40), nullable=False),
        sa.Column("target_id", sa.Integer()),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("payload_hash", sa.String(64), nullable=False),
        sa.Column("snapshot", sa.JSON(), nullable=False),
        sa.Column("snapshot_hash", sa.String(64), nullable=False),
        sa.Column("blob", sa.LargeBinary()),
        sa.Column("state", sa.String(20), nullable=False),
        sa.Column("created_at", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.Integer(), nullable=False),
        sa.Column("result", sa.JSON()),
        sa.UniqueConstraint("owner", "idempotency_key", name="uq_mcp_owner_key"),
    )
    op.create_table(
        "mcp_audit",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("occurred_at", sa.Integer(), nullable=False),
        sa.Column("actor", sa.String(64), nullable=False),
        sa.Column("event", sa.String(50), nullable=False),
        sa.Column("request_id", sa.String(36)),
        sa.Column("details", sa.JSON(), nullable=False),
    )
    op.create_index("ix_mcp_audit_request_id", "mcp_audit", ["request_id"])
    op.create_table("mcp_oauth",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("client_id", sa.String(200), nullable=False),
        sa.Column("grant_id", sa.String(64)),
        sa.Column("data", sa.JSON(), nullable=False),
        sa.Column("expires_at", sa.Integer(), nullable=False),
        sa.Column("consumed", sa.Boolean(), nullable=False))
    op.create_index("ix_mcp_oauth_grant_id", "mcp_oauth", ["grant_id"])


def downgrade():
    op.drop_table("mcp_oauth")
    op.drop_table("mcp_audit")
    op.drop_table("mcp_requests")
    op.drop_column("images", "mcp_managed")
