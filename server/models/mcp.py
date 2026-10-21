"""Durable MCP requests and append-only application audit events."""
import time
import uuid

from sqlalchemy import Column, Integer, String, JSON, LargeBinary, UniqueConstraint, Boolean
from .base import Base


class MCPRequest(Base):
    __tablename__ = "mcp_requests"
    __table_args__ = (UniqueConstraint("owner", "idempotency_key", name="uq_mcp_owner_key"),)
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    owner = Column(String(64), nullable=False)
    client_id = Column(String(200), nullable=False)
    grant_id = Column(String(64))
    idempotency_key = Column(String(128), nullable=False)
    action = Column(String(40), nullable=False)
    target_id = Column(Integer)
    payload = Column(JSON, nullable=False)
    payload_hash = Column(String(64), nullable=False)
    snapshot = Column(JSON, nullable=False)
    snapshot_hash = Column(String(64), nullable=False)
    blob = Column(LargeBinary)
    state = Column(String(20), nullable=False, default="pending")
    created_at = Column(Integer, nullable=False, default=lambda: int(time.time()))
    expires_at = Column(Integer, nullable=False)
    result = Column(JSON)


class MCPAudit(Base):
    __tablename__ = "mcp_audit"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    occurred_at = Column(Integer, nullable=False, default=lambda: int(time.time()))
    actor = Column(String(64), nullable=False)
    event = Column(String(50), nullable=False)
    request_id = Column(String(36), index=True)
    details = Column(JSON, nullable=False, default=dict)


class MCPOAuth(Base):
    """Opaque credentials are stored only as SHA-256 hashes, with grant families."""
    __tablename__ = "mcp_oauth"
    id = Column(String(64), primary_key=True)
    kind = Column(String(20), nullable=False)
    client_id = Column(String(200), nullable=False)
    grant_id = Column(String(64), index=True)
    data = Column(JSON, nullable=False)
    expires_at = Column(Integer, nullable=False)
    consumed = Column(Boolean, nullable=False, default=False)
