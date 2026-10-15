"""Authentication: passwords, one-time codes, access and refresh tokens."""
from __future__ import annotations
import hashlib, hmac, re, secrets, time
from dataclasses import dataclass, field
from typing import Callable
import jwt
from .config import settings


class AuthError(Exception):
    """Raised for any failed sign-in or token check (message is safe to show)."""


# ---------- identifiers
def normalize_phone(raw: str, default_cc: str = "+91") -> str:
    """Return E.164 form. Accepts 10-digit Indian numbers, 0-prefixed, or +<cc>."""
    digits = re.sub(r"[^\d+]", "", raw or "")
    if digits.startswith("+"):
        num = "+" + re.sub(r"\D", "", digits)
    elif len(digits) == 11 and digits.startswith("0"):
        num = default_cc + digits[1:]
    elif len(digits) == 10:
        num = default_cc + digits
    elif len(digits) == 12 and digits.startswith("91"):
        num = "+" + digits
    else:
        raise AuthError("Enter a valid mobile number")
    if not re.fullmatch(r"\+\d{10,15}", num):
        raise AuthError("Enter a valid mobile number")
    return num


def normalize_email(raw: str) -> str:
    e = (raw or "").strip().lower()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", e):
        raise AuthError("Enter a valid email address")
    return e


# ---------- passwords (PBKDF2-SHA256, per-user salt)
_ITER = 210_000


def hash_password(password: str) -> str:
    if len(password or "") < settings.password_min_length:
        raise AuthError(f"Password must be at least {settings.password_min_length} characters")
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _ITER)
    return f"pbkdf2_sha256${_ITER}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str | None) -> bool:
    if not stored:
        return False
    try:
        _, it, salt, dk = stored.split("$")
    except ValueError:
        return False
    test = hashlib.pbkdf2_hmac("sha256", (password or "").encode(), bytes.fromhex(salt), int(it))
    return hmac.compare_digest(test.hex(), dk)


# ---------- one-time codes
def _h(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


@dataclass
class _Otp:
    code_hash: str
    expires: float
    attempts: int = 0


class OtpService:
    """6-digit codes, 5-minute expiry, limited attempts and requests per destination."""

    def __init__(self, sender: Callable[[str, str], None] | None = None, clock: Callable[[], float] = time.time):
        self.sender = sender or (lambda dest, code: None)
        self.clock = clock
        self._codes: dict[str, _Otp] = {}
        self._requests: dict[str, list[float]] = {}

    def request(self, tenant_id: str, destination: str) -> None:
        key = f"{tenant_id}:{destination}"
        now = self.clock()
        recent = [t for t in self._requests.get(key, []) if now - t < settings.otp_window_s]
        if len(recent) >= settings.otp_max_requests:
            raise AuthError("Too many codes requested. Try again later")
        recent.append(now)
        self._requests[key] = recent
        code = f"{secrets.randbelow(10**6):06d}"
        self._codes[key] = _Otp(_h(key + code), now + settings.otp_ttl_s)
        self.sender(destination, code)

    def verify(self, tenant_id: str, destination: str, code: str) -> None:
        key = f"{tenant_id}:{destination}"
        rec = self._codes.get(key)
        if not rec or self.clock() > rec.expires:
            self._codes.pop(key, None)
            raise AuthError("Code expired. Request a new one")
        rec.attempts += 1
        if rec.attempts > settings.otp_max_attempts:
            self._codes.pop(key, None)
            raise AuthError("Too many attempts. Request a new code")
        if not hmac.compare_digest(rec.code_hash, _h(key + (code or ""))):
            raise AuthError("Incorrect code")
        self._codes.pop(key, None)


# ---------- tokens
@dataclass
class Principal:
    sub: str
    tenant_id: str | None          # None only for the platform administrator
    kind: str                      # staff | customer | service | platform
    roles: list[str] = field(default_factory=list)
    stores: list[str] = field(default_factory=list)
    scopes: list[str] = field(default_factory=list)
    limits: dict = field(default_factory=dict)
    acting_for: str | None = None  # set when a service acts for a customer (WhatsApp)


def issue_access_token(p: Principal, ttl_s: int | None = None) -> str:
    now = int(time.time())
    claims = {"iss": settings.jwt_issuer, "sub": p.sub, "tid": p.tenant_id, "typ": p.kind, "roles": p.roles,
              "stores": p.stores, "scopes": p.scopes, "limits": p.limits, "iat": now,
              "exp": now + (ttl_s or settings.access_ttl_s), "jti": secrets.token_hex(8)}
    if p.acting_for:
        claims["act"] = p.acting_for
    return jwt.encode(claims, settings.jwt_secret, algorithm="HS256")


def verify_access_token(token: str) -> Principal:
    try:
        c = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"], issuer=settings.jwt_issuer,
                       options={"require": ["exp", "iat", "sub", "typ"]})
    except jwt.PyJWTError as e:
        raise AuthError("Invalid or expired token") from e
    return Principal(sub=c["sub"], tenant_id=c.get("tid"), kind=c["typ"], roles=c.get("roles", []),
                     stores=c.get("stores", []), scopes=c.get("scopes", []), limits=c.get("limits", {}),
                     acting_for=c.get("act"))


@dataclass
class _Refresh:
    family: str
    principal: Principal
    expires: float
    used: bool = False


class RefreshTokens:
    """Opaque refresh tokens with rotation; reuse of an old token revokes the whole family."""

    def __init__(self, clock: Callable[[], float] = time.time):
        self.clock = clock
        self._tokens: dict[str, _Refresh] = {}
        self._revoked_families: set[str] = set()

    def issue(self, p: Principal, ttl_s: int, family: str | None = None) -> str:
        tok = secrets.token_urlsafe(32)
        self._tokens[_h(tok)] = _Refresh(family or secrets.token_hex(8), p, self.clock() + ttl_s)
        return tok

    def rotate(self, token: str, ttl_s: int) -> tuple[Principal, str]:
        rec = self._tokens.get(_h(token or ""))
        if not rec or rec.family in self._revoked_families:
            raise AuthError("Session expired. Sign in again")
        if rec.used:
            self._revoked_families.add(rec.family)          # replay: kill the session everywhere
            raise AuthError("Session revoked. Sign in again")
        if self.clock() > rec.expires:
            raise AuthError("Session expired. Sign in again")
        rec.used = True
        return rec.principal, self.issue(rec.principal, ttl_s, rec.family)

    def revoke_subject(self, sub: str) -> None:
        for r in self._tokens.values():
            if r.principal.sub == sub:
                self._revoked_families.add(r.family)


# ---------- Sign in with Google (OpenID Connect ID token)
GOOGLE_ISSUERS = ("accounts.google.com", "https://accounts.google.com")


@dataclass
class GoogleIdentity:
    sub: str              # Google's stable account id
    email: str
    name: str | None = None
    hosted_domain: str | None = None   # set for Google Workspace accounts


class GoogleVerifier:
    """Verifies a Google ID token: signature against Google's published keys, issuer, audience (your client IDs),
    expiry and a verified email. `key_resolver` can be replaced in tests; by default Google's JWKS is fetched and cached."""

    def __init__(self, client_ids: list[str] | None = None, key_resolver=None):
        self.client_ids = client_ids if client_ids is not None else settings.google_client_ids
        self._resolve = key_resolver or jwt.PyJWKClient(settings.google_jwks_url, cache_keys=True).get_signing_key_from_jwt

    def verify(self, id_token: str) -> GoogleIdentity:
        if not self.client_ids:
            raise AuthError("Google sign-in is not configured")
        try:
            key = self._resolve(id_token)
            key = getattr(key, "key", key)
            c = jwt.decode(id_token, key, algorithms=["RS256"], audience=self.client_ids, options={"require": ["exp", "iat", "iss", "aud", "sub"]})
        except AuthError:
            raise
        except Exception as e:                       # bad signature, wrong audience, expired, malformed, key fetch failure
            raise AuthError("Google sign-in failed. Try again") from e
        if c.get("iss") not in GOOGLE_ISSUERS:
            raise AuthError("Google sign-in failed. Try again")
        if not c.get("email") or c.get("email_verified") not in (True, "true"):
            raise AuthError("Your Google account email is not verified")
        return GoogleIdentity(c["sub"], normalize_email(c["email"]), c.get("name"), c.get("hd"))
