import os
import json
from dataclasses import dataclass
from urllib.parse import urlsplit

SCOPES = ("blog:read", "blog:read_private", "blog:propose", "images:read",
          "images:read_private", "images:propose")


@dataclass(frozen=True)
class Settings:
    origin: str
    issuer: str
    jwks_url: str
    subject: str
    clients: frozenset[str]
    local: bool = False
    client_metadata: tuple = ()
    registration_redirects: tuple = ()

    @property
    def resource(self):
        return self.origin + "/mcp"

    @classmethod
    def from_env(cls):
        origin = os.getenv("SITE_URL", "").rstrip("/")
        if os.getenv("MCP_OAUTH_MODE", "local") == "local":
            parsed = urlsplit(origin)
            if parsed.scheme != "https" or not parsed.hostname or parsed.path or parsed.query or parsed.fragment or parsed.username:
                raise RuntimeError("MCP requires an HTTPS SITE_URL origin")
            metadata = json.loads(os.getenv("MCP_OAUTH_CLIENTS", "[]"))
            redirects = tuple(x.strip() for x in os.getenv("MCP_OAUTH_REGISTRATION_REDIRECTS", "").split(",") if x.strip())
            if not metadata and not redirects:
                raise RuntimeError("Configure OAuth clients or exact dynamic registration callback URLs")
            for redirect in [*(r for c in metadata for r in c.get("redirect_uris", [])), *redirects]:
                url = urlsplit(redirect)
                if (url.scheme != "https" and not (url.scheme == "http" and url.hostname in ("127.0.0.1", "localhost", "::1"))) or url.fragment or url.username or not url.hostname:
                    raise RuntimeError("OAuth callbacks must use HTTPS or loopback HTTP and have no fragment/credentials")
            return cls(origin, origin, "", "admin", frozenset(c["client_id"] for c in metadata),
                       True, tuple(metadata), redirects)
        values = {name: os.environ.get(name, "") for name in (
            "SITE_URL", "MCP_OAUTH_ISSUER", "MCP_OAUTH_JWKS_URL",
            "MCP_OAUTH_ADMIN_SUBJECT", "MCP_OAUTH_CLIENT_IDS")}
        if not all(values.values()):
            raise RuntimeError("MCP requires SITE_URL and all MCP_OAUTH_* settings")
        for key in ("SITE_URL", "MCP_OAUTH_ISSUER", "MCP_OAUTH_JWKS_URL"):
            url = urlsplit(values[key])
            if url.scheme != "https" or not url.netloc or url.username or url.password or url.fragment or url.query:
                raise RuntimeError(f"{key} must be an explicit HTTPS URL")
        if urlsplit(values["SITE_URL"]).path not in ("", "/"):
            raise RuntimeError("SITE_URL must be an origin without a path")
        clients = frozenset(x.strip() for x in values["MCP_OAUTH_CLIENT_IDS"].split(",") if x.strip())
        if not clients:
            raise RuntimeError("At least one OAuth client must be allowlisted")
        return cls(values["SITE_URL"].rstrip("/"), values["MCP_OAUTH_ISSUER"].rstrip("/"),
                   values["MCP_OAUTH_JWKS_URL"], values["MCP_OAUTH_ADMIN_SUBJECT"], clients)
