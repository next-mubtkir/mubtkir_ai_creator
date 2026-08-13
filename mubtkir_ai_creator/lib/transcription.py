"""تحويل الصوت إلى نص عبر OpenAI Whisper API (بديل المايك السابق القائم على Web Speech API
والذي لا يعمل في متصفحات مثل Brave)."""

import frappe
import requests

from mubtkir_ai_creator.ai_creator.doctype.ai_settings.ai_settings import get_whisper_key

WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions"


def transcribe(audio_bytes, filename="audio.webm", content_type="audio/webm"):
    """يرسل مقطع صوتي إلى Whisper API ويرجع النص المستخرج."""
    key = get_whisper_key()

    data = {"model": "whisper-1"}
    lang = getattr(frappe.local, "lang", None)
    if lang in ("ar", "en"):
        data["language"] = lang

    try:
        resp = requests.post(
            WHISPER_URL,
            headers={"Authorization": f"Bearer {key}"},
            files={"file": (filename, audio_bytes, content_type)},
            data=data,
            timeout=60,
        )
    except requests.RequestException as e:
        frappe.throw(f"فشل الاتصال بخدمة Whisper: {e}")

    if resp.status_code >= 400:
        frappe.throw(f"فشل التفريغ الصوتي ({resp.status_code}): {resp.text[:300]}")

    return (resp.json() or {}).get("text", "").strip()
