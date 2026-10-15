import pytest
from aifirstmart_connect.identity import (AuthError, OtpService, Principal, RefreshTokens, hash_password,
                                          issue_access_token, normalize_email, normalize_phone, verify_access_token,
                                          verify_password)


def test_phone_normalisation():
    assert normalize_phone("98765 43210") == "+919876543210"
    assert normalize_phone("09876543210") == "+919876543210"
    assert normalize_phone("+91 98765-43210") == "+919876543210"
    with pytest.raises(AuthError):
        normalize_phone("12345")


def test_email_normalisation():
    assert normalize_email("  Priya@Example.COM ") == "priya@example.com"
    with pytest.raises(AuthError):
        normalize_email("not-an-email")


def test_password_hash_and_minimum_length():
    h = hash_password("correct horse battery")
    assert verify_password("correct horse battery", h) and not verify_password("wrong", h)
    with pytest.raises(AuthError):
        hash_password("short")


def test_otp_flow_expiry_attempts_and_rate_limit():
    sent, t = {}, [1000.0]
    otp = OtpService(sender=lambda d, c: sent.__setitem__(d, c), clock=lambda: t[0])
    otp.request("ten_a", "+919876543210")
    with pytest.raises(AuthError):
        otp.verify("ten_a", "+919876543210", "000000" if sent["+919876543210"] != "000000" else "111111")
    otp.verify("ten_a", "+919876543210", sent["+919876543210"])          # correct code works once
    with pytest.raises(AuthError):
        otp.verify("ten_a", "+919876543210", sent["+919876543210"])      # and only once
    otp.request("ten_a", "+919876543210"); t[0] += 301                   # expired after 5 minutes
    with pytest.raises(AuthError, match="expired"):
        otp.verify("ten_a", "+919876543210", sent["+919876543210"])
    otp.request("ten_a", "+919876543210")                                 # third request in the window
    with pytest.raises(AuthError, match="Too many"):
        otp.request("ten_a", "+919876543210")


def test_otp_attempt_limit():
    sent = {}
    otp = OtpService(sender=lambda d, c: sent.__setitem__(d, c))
    otp.request("t", "+919000000001")
    wrong = "123456" if sent["+919000000001"] != "123456" else "654321"
    for _ in range(5):
        with pytest.raises(AuthError):
            otp.verify("t", "+919000000001", wrong)
    with pytest.raises(AuthError, match="Too many attempts"):
        otp.verify("t", "+919000000001", sent["+919000000001"])


def test_access_token_round_trip_and_tamper():
    tok = issue_access_token(Principal("usr_1", "ten_a", "staff", ["cashier"], ["loc_1"], [], {"discount_pct": 10}))
    p = verify_access_token(tok)
    assert (p.tenant_id, p.roles, p.stores, p.limits) == ("ten_a", ["cashier"], ["loc_1"], {"discount_pct": 10})
    with pytest.raises(AuthError):
        verify_access_token(tok[:-2] + ("A" if tok[-2] != "A" else "B") + tok[-1])


def test_refresh_rotation_and_reuse_revokes_family():
    rt = RefreshTokens()
    first = rt.issue(Principal("cus_1", "ten_a", "customer", ["customer"]), 3600)
    _, second = rt.rotate(first, 3600)
    with pytest.raises(AuthError, match="revoked"):
        rt.rotate(first, 3600)                       # replay of an old token
    with pytest.raises(AuthError):
        rt.rotate(second, 3600)                      # whole family is now dead
