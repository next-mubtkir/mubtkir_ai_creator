"""أدوات إدارة Workspace لدى العميل: اختصارات، روابط، بلوكات مخصصة."""

import json
import frappe
from mubtkir_ai_creator.lib.client import FrappeSiteClient


def _get_workspace(client, workspace_name):
    doc = client.get_doc("Workspace", workspace_name).get("data") or {}
    if not doc:
        raise ValueError(f"Workspace «{workspace_name}» غير موجود لدى العميل")
    return doc


def list_workspaces(client):
    """استعراض كل Workspaces المتاحة لدى العميل."""
    return client.get_list(
        "Workspace",
        fields=["name", "title", "module", "public", "is_hidden"],
        limit=50,
    ).get("data") or []


def get_workspace_content(client, workspace_name):
    """قراءة محتوى Workspace بالكامل: الاختصارات والروابط والبلوكات."""
    doc = _get_workspace(client, workspace_name)
    return {
        "name": doc.get("name"),
        "title": doc.get("title"),
        "module": doc.get("module"),
        "shortcuts": doc.get("shortcuts") or [],
        "links": doc.get("links") or [],
        "custom_blocks": doc.get("custom_blocks") or [],
        "content": doc.get("content"),
    }


def add_shortcut(client, workspace_name, label, link_to, link_type="DocType", doc_view="List", color="Blue"):
    """إضافة اختصار جديد إلى Workspace."""
    doc = _get_workspace(client, workspace_name)
    shortcuts = doc.get("shortcuts") or []

    if any(s.get("link_to") == link_to and s.get("label") == label for s in shortcuts):
        return {"status": "exists", "message": f"الاختصار «{label}» موجود مسبقًا"}

    shortcuts.append({
        "label": label,
        "link_to": link_to,
        "type": link_type,
        "doc_view": doc_view if link_type == "DocType" else "",
        "color": color,
    })

    return client.update_doc("Workspace", workspace_name, {"shortcuts": shortcuts}).get("data")


def add_link(client, workspace_name, card_name, label, link_to, link_type="DocType", description=""):
    """إضافة رابط داخل بطاقة موجودة في Workspace."""
    doc = _get_workspace(client, workspace_name)
    links = doc.get("links") or []

    card_exists = any(
        l.get("type") == "Card Break" and l.get("label") == card_name for l in links
    )
    if not card_exists:
        links.append({"type": "Card Break", "label": card_name, "link_count": 0, "hidden": 0, "onboard": 0})

    if any(l.get("link_to") == link_to and l.get("label") == label for l in links):
        return {"status": "exists", "message": f"الرابط «{label}» موجود مسبقًا في بطاقة «{card_name}»"}

    links.append({
        "type": "Link",
        "label": label,
        "link_to": link_to,
        "link_type": link_type,
        "description": description,
        "hidden": 0,
        "is_query_report": 0,
        "onboard": 0,
        "link_count": 0,
    })

    for l in links:
        if l.get("type") == "Card Break" and l.get("label") == card_name:
            l["link_count"] = l.get("link_count", 0) + 1

    return client.update_doc("Workspace", workspace_name, {"links": links}).get("data")


def add_custom_block(client, workspace_name, block_name):
    """إضافة Custom Block إلى Workspace."""
    doc = _get_workspace(client, workspace_name)
    custom_blocks = doc.get("custom_blocks") or []

    if any(b.get("custom_block_name") == block_name for b in custom_blocks):
        return {"status": "exists", "message": f"البلوك «{block_name}» مضاف مسبقًا"}

    custom_blocks.append({"custom_block_name": block_name})

    content = json.loads(doc.get("content") or "[]")
    block_id = f"cb_{block_name.lower().replace(' ', '_')}"
    content.append({
        "id": block_id,
        "type": "custom_block",
        "data": {"custom_block_name": block_name, "col": 12},
    })

    return client.update_doc("Workspace", workspace_name, {
        "custom_blocks": custom_blocks,
        "content": json.dumps(content, ensure_ascii=False),
    }).get("data")


def list_custom_blocks(client):
    """استعراض Custom Blocks المتاحة لدى العميل."""
    return client.get_list(
        "Custom HTML Block",
        fields=["name", "html", "private", "modified"],
        limit=50,
    ).get("data") or []
