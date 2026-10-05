"""Tests for the admin prompts API (/api/v1/admin/prompts)."""

from __future__ import annotations

from typing import Any

import pytest
from sqlalchemy import select

from app.generation import ai
from app.generation.ai import AIPermanentError, AITransientError, FakeAIClient
from app.generation.templating import sample_variables
from app.generation.words import count_words
from app.models import AuditLog, PromptStatus, PromptVersion
from app.prompts.service import VARIABLE_DESCRIPTIONS, published_versions
from app.settings_store import set_settings

BASE = "/api/v1/admin/prompts"
TEMPLATE = "Write in {{ language }} about the {{ sun_sign }} Sun and the {{ year_animal }}."


def new_draft(client, slot: int = 1, /, **fields: Any):
    body = {"name": f"Prompt {slot}", "template": TEMPLATE, "section_titles": {"en": "Core", "ar": "الجوهر"}}
    body.update(fields)
    return client.post(f"{BASE}/{slot}/versions", json=body)


def audit_actions(db) -> list[str]:
    db.expire_all()
    return [a.action for a in db.scalars(select(AuditLog).order_by(AuditLog.id))]


@pytest.fixture
def manager(admin_client):
    return admin_client("admin")


@pytest.fixture
def fake_ai(monkeypatch):
    def _install(client: Any = None) -> Any:
        client = client or FakeAIClient()
        monkeypatch.setattr(ai, "get_ai_client", lambda: client)
        return client

    return _install


# ---------------------------------------------------------------------------
# Access control
# ---------------------------------------------------------------------------


def test_requires_login(client):
    assert client.get(BASE).status_code == 401
    r = client.post(f"{BASE}/1/versions", json={"template": TEMPLATE}, headers={"X-ZB-Admin": "1"})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "unauthorized"


def test_editors_are_forbidden(admin_client):
    editor = admin_client("editor")
    for method, path, body in [
        ("get", BASE, None),
        ("get", f"{BASE}/variables", None),
        ("get", f"{BASE}/1/versions", None),
        ("post", f"{BASE}/1/versions", {"template": TEMPLATE}),
        ("patch", f"{BASE}/versions/1", {"name": "x"}),
        ("post", f"{BASE}/versions/1/publish", None),
        ("post", f"{BASE}/versions/1/preview", {"locale": "en"}),
        ("post", f"{BASE}/versions/1/test", {"locale": "en"}),
        ("delete", f"{BASE}/versions/1", None),
    ]:
        r = editor.request(method.upper(), path, json=body)
        assert r.status_code == 403, (method, path)
        assert r.json()["error"]["code"] == "forbidden"


@pytest.mark.parametrize("role", ["owner", "admin"])
def test_managers_are_allowed(admin_client, role):
    assert admin_client(role).get(BASE).status_code == 200


def test_mutations_require_csrf_header(manager):
    del manager.headers["X-ZB-Admin"]
    r = new_draft(manager)
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "csrf_failed"


# ---------------------------------------------------------------------------
# Listing
# ---------------------------------------------------------------------------


def test_overview_lists_six_slots(manager):
    r = manager.get(BASE)
    assert r.status_code == 200
    assert r.json() == {
        "slots": [{"slot": s, "published": None, "draft": None, "versions_count": 0} for s in range(1, 7)]
    }

    v1 = new_draft(manager, 2).json()
    manager.post(f"{BASE}/versions/{v1['id']}/publish")
    v2 = new_draft(manager, 2).json()
    slots = manager.get(BASE).json()["slots"]
    assert slots[1]["published"]["id"] == v1["id"]
    assert slots[1]["draft"]["id"] == v2["id"]
    assert slots[1]["versions_count"] == 2
    assert slots[0]["versions_count"] == 0


def test_variables_lists_every_template_variable(manager):
    r = manager.get(f"{BASE}/variables", params={"locale": "ar"})
    assert r.status_code == 200
    body = r.json()
    assert body["locale"] == "ar"
    names = [item["name"] for item in body["items"]]
    assert names == list(sample_variables("ar"))
    assert all(item["description"] for item in body["items"])
    by_name = {item["name"]: item for item in body["items"]}
    assert by_name["language"]["example"] == "Arabic"
    assert by_name["sun_sign"]["example"] == "Leo"
    assert set(VARIABLE_DESCRIPTIONS) == set(sample_variables())


def test_variables_unknown_locale_falls_back_to_default(manager):
    assert manager.get(f"{BASE}/variables", params={"locale": "xx"}).json()["locale"] == "en"


def test_versions_list_is_paginated_newest_first(manager):
    for _ in range(3):
        draft = new_draft(manager, 3).json()
        manager.post(f"{BASE}/versions/{draft['id']}/publish")
    r = manager.get(f"{BASE}/3/versions", params={"page_size": 2})
    body = r.json()
    assert body["total"] == 3 and body["page"] == 1 and body["page_size"] == 2
    assert [v["version"] for v in body["items"]] == [3, 2]
    assert [v["status"] for v in body["items"]] == ["published", "archived"]
    page2 = manager.get(f"{BASE}/3/versions", params={"page": 2, "page_size": 2}).json()
    assert [v["version"] for v in page2["items"]] == [1]


@pytest.mark.parametrize("slot", [0, 7, -1])
def test_slot_must_be_between_1_and_6(manager, slot):
    r = manager.get(f"{BASE}/{slot}/versions")
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "validation_error"
    assert new_draft(manager, slot).status_code == 422


def test_unknown_version_is_404(manager):
    assert manager.get(f"{BASE}/versions/999").status_code == 404
    assert manager.patch(f"{BASE}/versions/999", json={"name": "x"}).status_code == 404
    assert manager.post(f"{BASE}/versions/999/publish").status_code == 404
    assert manager.post(f"{BASE}/versions/999/preview", json={}).status_code == 404


# ---------------------------------------------------------------------------
# Drafts
# ---------------------------------------------------------------------------


def test_create_draft(manager, db):
    r = new_draft(manager, 1, system_instruction="Answer in {{ language }}.", min_words=40, notes="first try")
    assert r.status_code == 201
    body = r.json()
    assert body["slot"] == 1 and body["version"] == 1
    assert body["status"] == "draft"
    assert body["template"] == TEMPLATE
    assert body["section_titles"] == {"en": "Core", "ar": "الجوهر"}
    assert body["min_words"] == 40
    assert body["notes"] == "first try"
    assert body["created_by_id"] is not None and body["created_by_name"] == "Admin"
    assert body["published_at"] is None
    assert manager.get(f"{BASE}/versions/{body['id']}").json() == body
    assert audit_actions(db) == ["prompt.create_draft"]


def test_only_one_draft_per_slot(manager):
    assert new_draft(manager, 1).status_code == 201
    r = new_draft(manager, 1)
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "draft_exists"
    assert new_draft(manager, 2).status_code == 201  # other slots are independent


def test_new_draft_copies_published_version_and_increments_number(manager):
    v1 = new_draft(manager, 4, system_instruction="Be kind.", min_words=30).json()
    manager.post(f"{BASE}/versions/{v1['id']}/publish")

    r = manager.post(f"{BASE}/4/versions", json={"notes": "tweak"})
    assert r.status_code == 201
    v2 = r.json()
    assert v2["version"] == 2
    assert (v2["template"], v2["system_instruction"], v2["min_words"], v2["section_titles"], v2["name"]) == (
        v1["template"],
        "Be kind.",
        30,
        v1["section_titles"],
        v1["name"],
    )
    assert v2["notes"] == "tweak"


def test_new_draft_from_explicit_base_version(manager):
    v1 = new_draft(manager, 5, template="Version one {{ sun_sign }}").json()
    manager.post(f"{BASE}/versions/{v1['id']}/publish")
    v2 = new_draft(manager, 5, template="Version two {{ moon_sign }}").json()
    manager.post(f"{BASE}/versions/{v2['id']}/publish")

    v3 = manager.post(f"{BASE}/5/versions", json={"base_version_id": v1["id"], "min_words": None}).json()
    assert v3["version"] == 3
    assert v3["template"] == "Version one {{ sun_sign }}"
    assert v3["min_words"] is None


def test_base_version_must_belong_to_the_slot(manager):
    other = new_draft(manager, 1).json()
    r = manager.post(f"{BASE}/2/versions", json={"base_version_id": other["id"]})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "invalid_base_version"


def test_first_version_requires_a_template(manager):
    r = manager.post(f"{BASE}/1/versions", json={"name": "Empty"})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "template_required"


@pytest.mark.parametrize(
    ("template", "fragment"),
    [
        ("Hello {{ unknown_variable }}", "unknown_variable"),
        ("Hello {{ sun_sign ", ""),
        ("{% for x in %}", ""),
        ("{{ ''.__class__.__mro__ }}", ""),  # sandbox escape attempt
        ("{{ sun_sign.__class__.__init__.__globals__ }}", ""),
    ],
)
def test_invalid_template_is_rejected(manager, db, template, fragment):
    r = new_draft(manager, 1, template=template)
    assert r.status_code == 422
    error = r.json()["error"]
    assert error["code"] == "invalid_template"
    assert error["details"] == {"field": "template"}
    assert fragment in error["message"]
    assert db.scalar(select(PromptVersion)) is None


def test_invalid_system_instruction_is_rejected(manager):
    r = new_draft(manager, 1, system_instruction="Answer in {{ lang }}")
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "invalid_template"
    assert r.json()["error"]["details"] == {"field": "system_instruction"}


@pytest.mark.parametrize(
    "fields",
    [
        {"section_titles": {"fr": "Titre"}},
        {"section_titles": {"en": "x" * 301}},
        {"name": ""},
        {"template": "   "},
        {"template": "x" * 20_001},
        {"min_words": -1},
        {"min_words": 5001},
        {"status": "published"},  # unknown fields are rejected
        {"slot": 3},
    ],
)
def test_draft_validation(manager, fields):
    r = new_draft(manager, 1, **fields)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "validation_error"


def test_empty_section_titles_are_dropped(manager):
    body = new_draft(manager, 1, section_titles={"en": "  Core  ", "ar": "   "}).json()
    assert body["section_titles"] == {"en": "Core"}


def test_update_draft(manager, db):
    draft = new_draft(manager, 1).json()
    r = manager.patch(
        f"{BASE}/versions/{draft['id']}",
        json={"template": "New {{ moon_sign }}", "min_words": None, "section_titles": {"en": "Heart"}},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["template"] == "New {{ moon_sign }}"
    assert body["min_words"] is None
    assert body["section_titles"] == {"en": "Heart"}
    assert body["name"] == draft["name"]  # omitted fields unchanged
    logs = db.scalars(select(AuditLog).where(AuditLog.action == "prompt.update_draft")).all()
    assert len(logs) == 1
    assert sorted(logs[0].data["fields"]) == ["section_titles", "template"]

    # A no-op update records nothing.
    manager.patch(f"{BASE}/versions/{draft['id']}", json={"template": "New {{ moon_sign }}"})
    assert audit_actions(db).count("prompt.update_draft") == 1


def test_update_rejects_invalid_template_and_keeps_old_one(manager):
    draft = new_draft(manager, 1).json()
    r = manager.patch(f"{BASE}/versions/{draft['id']}", json={"template": "{{ nope }}"})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "invalid_template"
    assert manager.get(f"{BASE}/versions/{draft['id']}").json()["template"] == TEMPLATE


def test_only_drafts_can_be_updated_or_deleted(manager):
    draft = new_draft(manager, 1).json()
    manager.post(f"{BASE}/versions/{draft['id']}/publish")
    r = manager.patch(f"{BASE}/versions/{draft['id']}", json={"name": "changed"})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "not_draft"
    r = manager.delete(f"{BASE}/versions/{draft['id']}")
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "not_draft"


def test_delete_draft_allows_a_new_one(manager, db):
    draft = new_draft(manager, 1).json()
    assert manager.delete(f"{BASE}/versions/{draft['id']}").status_code == 204
    assert manager.get(f"{BASE}/versions/{draft['id']}").status_code == 404
    assert new_draft(manager, 1).status_code == 201
    assert "prompt.delete_draft" in audit_actions(db)


# ---------------------------------------------------------------------------
# Publishing
# ---------------------------------------------------------------------------


def test_publish_archives_previous_version(manager, db):
    v1 = new_draft(manager, 1).json()
    r = manager.post(f"{BASE}/versions/{v1['id']}/publish")
    assert r.status_code == 200
    assert r.json()["status"] == "published"
    assert r.json()["published_at"] is not None

    v2 = new_draft(manager, 1, template="Second {{ ascendant }}").json()
    assert manager.post(f"{BASE}/versions/{v2['id']}/publish").json()["status"] == "published"

    db.expire_all()
    rows = {v.version: v.status for v in db.scalars(select(PromptVersion).where(PromptVersion.slot == 1))}
    assert rows == {1: PromptStatus.ARCHIVED, 2: PromptStatus.PUBLISHED}
    assert published_versions(db)[1].id == v2["id"]
    publish_logs = db.scalars(select(AuditLog).where(AuditLog.action == "prompt.publish")).all()
    assert [log.data["archived_version_id"] for log in publish_logs] == [None, v1["id"]]


def test_archived_version_can_be_republished_as_rollback(manager, db):
    v1 = new_draft(manager, 1).json()
    manager.post(f"{BASE}/versions/{v1['id']}/publish")
    v2 = new_draft(manager, 1).json()
    manager.post(f"{BASE}/versions/{v2['id']}/publish")

    assert manager.post(f"{BASE}/versions/{v1['id']}/publish").json()["status"] == "published"
    db.expire_all()
    statuses = {v.id: v.status for v in db.scalars(select(PromptVersion))}
    assert statuses == {v1["id"]: PromptStatus.PUBLISHED, v2["id"]: PromptStatus.ARCHIVED}


def test_publishing_twice_is_a_noop(manager, db):
    v1 = new_draft(manager, 1).json()
    first = manager.post(f"{BASE}/versions/{v1['id']}/publish").json()
    second = manager.post(f"{BASE}/versions/{v1['id']}/publish")
    assert second.status_code == 200
    assert second.json()["published_at"] == first["published_at"]
    assert audit_actions(db).count("prompt.publish") == 1


def test_publish_rejects_template_that_no_longer_renders(manager, db):
    row = PromptVersion(slot=6, version=1, name="legacy", template="{{ removed_variable }}", status=PromptStatus.DRAFT)
    db.add(row)
    db.commit()
    r = manager.post(f"{BASE}/versions/{row.id}/publish")
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "invalid_template"
    db.expire_all()
    assert db.get(PromptVersion, row.id).status == PromptStatus.DRAFT


# ---------------------------------------------------------------------------
# Preview & test
# ---------------------------------------------------------------------------


def test_preview_renders_with_sample_variables(manager):
    draft = new_draft(manager, 1, system_instruction="Answer in {{ language }} only.").json()
    r = manager.post(f"{BASE}/versions/{draft['id']}/preview", json={"locale": "ar"})
    assert r.status_code == 200
    assert r.json() == {
        "locale": "ar",
        "rendered_prompt": "Write in Arabic about the Leo Sun and the Horse.",
        "rendered_system_instruction": "Answer in Arabic only.",
    }
    # No body: default locale.
    r = manager.post(f"{BASE}/versions/{draft['id']}/preview")
    assert r.json()["rendered_prompt"] == "Write in English about the Leo Sun and the Horse."


def test_preview_of_unsaved_editor_text(manager):
    draft = new_draft(manager, 1).json()
    r = manager.post(
        f"{BASE}/versions/{draft['id']}/preview",
        json={"locale": "en", "template": "Moon in {{ moon_sign }} at {{ moon_degree }}°", "system_instruction": ""},
    )
    assert r.json()["rendered_prompt"] == "Moon in Pisces at 3.8°"
    assert r.json()["rendered_system_instruction"] is None

    r = manager.post(f"{BASE}/versions/{draft['id']}/preview", json={"template": "{{ oops"})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "invalid_template"


def test_test_endpoint_calls_ai_with_sample_variables(manager, db, fake_ai):
    set_settings(
        db,
        {
            "gemini_model": "gemini-test-model",
            "gemini_temperature": 0.3,
            "gemini_max_output_tokens": 1000,
            "gemini_timeout_seconds": 30,
        },
    )
    db.commit()
    client = fake_ai()
    draft = new_draft(manager, 1, system_instruction="Answer in {{ language }}.", min_words=50).json()
    r = manager.post(f"{BASE}/versions/{draft['id']}/test", json={"locale": "ar"})
    assert r.status_code == 200
    body = r.json()
    assert body["word_count"] == count_words(body["output"]) > 300
    assert body["min_words"] == 50
    assert body["model"] == "gemini-test-model"
    assert body["finish_reason"] == "STOP"
    assert body["output_html"].startswith("<h2>")
    assert any("؀" <= ch <= "ۿ" for ch in body["output"])  # Arabic reply for the ar locale

    (call,) = client.calls
    assert call.prompt == "Write in Arabic about the Leo Sun and the Horse."
    assert call.system_instruction == "Answer in Arabic."
    assert (call.temperature, call.max_output_tokens, call.timeout_seconds) == (0.3, 1000, 30)
    assert "prompt.test" in audit_actions(db)


def test_test_endpoint_is_rate_limited_per_admin(manager, admin_client, fake_ai):
    fake_ai(FakeAIClient(target_words=30))
    draft = new_draft(manager, 1).json()
    url = f"{BASE}/versions/{draft['id']}/test"
    for _ in range(10):
        assert manager.post(url, json={}).status_code == 200
    r = manager.post(url, json={})
    assert r.status_code == 429
    assert r.json()["error"]["code"] == "rate_limited"
    assert "Retry-After" in r.headers

    other = admin_client("owner")  # logs the shared test client in as a different admin
    assert other.post(url, json={}).status_code == 200


@pytest.mark.parametrize(
    ("error", "status", "code"),
    [
        (AITransientError("Gemini API error 503 UNAVAILABLE: overloaded"), 503, "ai_unavailable"),
        (AIPermanentError("Gemini API error 404 NOT_FOUND: model"), 502, "ai_error"),
        (ai.AIConfigurationError("ZB_GEMINI_API_KEY missing"), 503, "ai_not_configured"),
    ],
)
def test_test_endpoint_maps_ai_errors(manager, fake_ai, error, status, code):
    fake_ai(FakeAIClient([error]))
    draft = new_draft(manager, 1).json()
    r = manager.post(f"{BASE}/versions/{draft['id']}/test", json={"locale": "en"})
    assert r.status_code == status
    assert r.json()["error"]["code"] == code


def test_test_endpoint_reports_missing_ai_configuration(manager, monkeypatch):
    from app.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "ai_provider", "gemini")
    monkeypatch.setattr(settings, "gemini_api_key", "")
    draft = new_draft(manager, 1).json()
    r = manager.post(f"{BASE}/versions/{draft['id']}/test", json={})
    assert r.status_code == 503
    assert r.json()["error"]["code"] == "ai_not_configured"
