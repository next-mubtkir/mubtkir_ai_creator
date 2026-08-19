"""Connection Service — verify connection, detect ERP version, measure latency."""

import time

import frappe

from mubtkir_ai_creator.lib.client import FrappeSiteClient


def test_connection(client_site):
    """Test connection and return version info + latency."""
    start = time.time()
    try:
        client = FrappeSiteClient(client_site)
        user_resp = client.ping()
        latency_ms = round((time.time() - start) * 1000)
        user = user_resp.get("message", "")

        versions = {}
        try:
            ver_resp = client.get_versions()
            ver_data = ver_resp.get("message", {}) or {}
            versions = {
                "frappe": (ver_data.get("frappe") or {}).get("version", ""),
                "erpnext": (ver_data.get("erpnext") or {}).get("version", ""),
            }
        except Exception:
            pass

        return {
            "status": "Connected",
            "user": user,
            "latency_ms": latency_ms,
            "versions": versions,
        }
    except Exception as e:
        latency_ms = round((time.time() - start) * 1000)
        return {
            "status": "Failed",
            "error": str(e)[:500],
            "latency_ms": latency_ms,
        }


def get_client(client_site):
    """Return a FrappeSiteClient for the given client site."""
    return FrappeSiteClient(client_site)
