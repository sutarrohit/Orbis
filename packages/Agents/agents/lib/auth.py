"""
agents/lib/auth.py
──────────────────
Service-to-service auth for the agent API.

Every request from the Hono API carries a JWT signed with a **shared secret**
(HS256). Hono creates it (see apps/server/src/lib/agents-jwt.ts); we verify it
here with the same ``AGENTS_JWT_SECRET``. If the signature checks out, the call
is allowed. The token has no expiry.

Apply as a FastAPI dependency so it guards every route::

    app.include_router(agents.router, dependencies=[Depends(require_service_auth)])
"""

from __future__ import annotations

import jwt
from fastapi import Header, HTTPException, status

from agents.lib.config import settings

_ALGORITHMS = ["HS256"]


def require_service_auth(authorization: str = Header(default="")) -> dict:
    """Verify the Hono service JWT. Returns its payload, or raises 401."""
    if not settings.agents_jwt_secret:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="AGENTS_JWT_SECRET is not configured",
        )

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        # No expiry is set by Hono, so don't require/verify exp.
        return jwt.decode(
            token,
            settings.agents_jwt_secret,
            algorithms=_ALGORITHMS,
            options={"verify_exp": False},
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid service token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
