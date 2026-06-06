"""
agents/lib/crypto.py — encryption for account secrets
──────────────────────────────────────────────────────
A Telegram session string is full account access, so it is encrypted at rest
(Implentation.md §14). We use Fernet (AES-128-CBC + HMAC) with a key from the
``ACCOUNT_ENC_KEY`` env var.

Generate a key once and put it in .env:
    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
"""

from __future__ import annotations

from functools import lru_cache

from cryptography.fernet import Fernet

from agents.lib.config import settings


@lru_cache(maxsize=1)
def _fernet() -> Fernet:
    if not settings.account_enc_key:
        raise RuntimeError(
            "ACCOUNT_ENC_KEY is not set; cannot encrypt/decrypt account secrets. "
            "Generate one: "
            'python -c "from cryptography.fernet import Fernet; '
            'print(Fernet.generate_key().decode())"'
        )
    return Fernet(settings.account_enc_key.encode())


def encrypt(plaintext: str) -> str:
    """Encrypt a secret (e.g. a session string) → a storable token string."""
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt(token: str) -> str:
    """Decrypt a token produced by :func:`encrypt` back to the plaintext secret."""
    return _fernet().decrypt(token.encode()).decode()
