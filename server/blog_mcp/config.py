"""Deployment configuration only; OAuth clients live in the database."""
import os
from dataclasses import dataclass
from urllib.parse import urlsplit

SCOPES = ("blog:read", "blog:read_private", "blog:propose", "images:read",
          "images:read_private", "images:propose")


@dataclass(frozen=True)
class Settings:
    origin: str

    @property
    def issuer(self):
        return self.origin

    @property
    def resource(self):
        return self.origin + "/mcp"

    @classmethod
    def from_env(cls):
        origin = os.getenv("SITE_URL", "").rstrip("/")
        parsed = urlsplit(origin)
        if (parsed.scheme != "https" or not parsed.hostname or parsed.path or parsed.query
                or parsed.fragment or parsed.username or parsed.password):
            raise RuntimeError("MCP requires an HTTPS SITE_URL origin")
        if os.getenv("MCP_OAUTH_MODE", "local") != "local":
            raise RuntimeError("External OAuth mode was retired. Reconnect through the blog OAuth consent flow.")
        return cls(origin)
