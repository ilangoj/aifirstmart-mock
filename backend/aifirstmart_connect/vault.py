"""Per-tenant encrypted credential storage. Nothing outside connector run time can read a secret."""
from __future__ import annotations
import json, secrets
from cryptography.fernet import Fernet
from .config import settings


class Vault:
    def __init__(self, master_key: str | None = None):
        self._master = Fernet(master_key or settings.vault_master_key or Fernet.generate_key())
        self._tenant_keys: dict[str, bytes] = {}      # tenant data keys, stored encrypted by the master key
        self._items: dict[str, tuple[str, bytes]] = {}

    def _tenant_fernet(self, tenant_id: str) -> Fernet:
        if tenant_id not in self._tenant_keys:
            self._tenant_keys[tenant_id] = self._master.encrypt(Fernet.generate_key())
        return Fernet(self._master.decrypt(self._tenant_keys[tenant_id]))

    def put(self, tenant_id: str, secret: dict) -> str:
        ref = f"vault_{secrets.token_hex(8)}"
        self._items[ref] = (tenant_id, self._tenant_fernet(tenant_id).encrypt(json.dumps(secret).encode()))
        return ref

    def get_for_connector(self, tenant_id: str, ref: str) -> dict:
        owner, blob = self._items[ref]
        if owner != tenant_id:
            raise PermissionError("credential belongs to another tenant")
        return json.loads(self._tenant_fernet(tenant_id).decrypt(blob))

    def revoke(self, ref: str) -> None:
        self._items.pop(ref, None)

    def describe(self, ref: str) -> dict:
        """Safe metadata only: existence and owner, never the secret."""
        return {"ref": ref, "tenant_id": self._items[ref][0], "stored": True} if ref in self._items else {"ref": ref, "stored": False}
