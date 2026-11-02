from datetime import datetime, timedelta, timezone
import os

import jwt
from pwdlib import PasswordHash

passwords = PasswordHash.recommended()
ROLES = {"admin", "manager", "planner", "operator", "steward", "viewer"}


def secret():
    key = os.environ.get("GRD_TOKEN_SECRET", "")
    if len(key) < 32 or key == "replace-with-at-least-32-random-characters":
        raise RuntimeError("Set GRD_TOKEN_SECRET to at least 32 random characters")
    return key


def token(user):
    issued = datetime.now(timezone.utc)
    return jwt.encode(
        {
            "sub": user.id,
            "ver": user.token_version,
            "iat": issued,
            "exp": issued + timedelta(hours=8),
            "iss": "grd",
            "aud": "grd-clients",
        },
        secret(),
        algorithm="HS256",
    )


def decode(value):
    return jwt.decode(
        value,
        secret(),
        algorithms=["HS256"],
        issuer="grd",
        audience="grd-clients",
        options={"require": ["exp", "sub", "ver", "iat"]},
    )
