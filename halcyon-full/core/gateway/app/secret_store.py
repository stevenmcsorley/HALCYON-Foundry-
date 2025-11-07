from __future__ import annotations

import base64
import logging
import os
from typing import Optional

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


logger = logging.getLogger("gateway.secret_store")


def _load_key() -> bytes:
    raw = os.getenv("DATASOURCE_ENCRYPTION_KEY")
    if raw:
        try:
            key = base64.urlsafe_b64decode(raw)
        except Exception as exc:  # pragma: no cover - configuration error
            raise ValueError("DATASOURCE_ENCRYPTION_KEY must be base64 urlsafe encoded") from exc
        if len(key) != 32:
            raise ValueError("DATASOURCE_ENCRYPTION_KEY must decode to 32 bytes (256-bit)")
        return key
    logger.warning("DATASOURCE_ENCRYPTION_KEY not set; falling back to development key.")
    return b"\x01" * 32


class SecretStore:
    """Symmetric AES-256-GCM helper for datasource secrets."""

    def __init__(self, key: Optional[bytes] = None):
        self._key = key or _load_key()
        self._aesgcm = AESGCM(self._key)

    def encrypt(self, plaintext: str) -> bytes:
        if not isinstance(plaintext, str):
            raise TypeError("Secret plaintext must be string")
        nonce = os.urandom(12)
        ciphertext = self._aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
        return nonce + ciphertext

    def decrypt(self, data: bytes) -> str:
        if not isinstance(data, (bytes, bytearray)):
            raise TypeError("Encrypted secret must be bytes")
        if len(data) < 13:  # nonce + minimum tag
            raise ValueError("Encrypted secret payload too short")
        nonce, ciphertext = data[:12], data[12:]
        plaintext = self._aesgcm.decrypt(nonce, ciphertext, None)
        return plaintext.decode("utf-8")


secret_store = SecretStore()

