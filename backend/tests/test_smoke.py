def test_health(client):
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_settings_defaults(db):
    from app.settings_store import get_all_settings, set_settings

    s = get_all_settings(db)
    assert s["min_words"] == 25
    set_settings(db, {"min_words": 30})
    db.commit()
    assert get_all_settings(db)["min_words"] == 30


def test_enqueue_dedupe(db):
    from app.jobs.queue import claim_next, enqueue

    assert enqueue(db, "cleanup", {}, dedupe_key="k1") is not None
    assert enqueue(db, "cleanup", {}, dedupe_key="k1") is None
    db.commit()
    job = claim_next(db, "w1", 60)
    assert job is not None and job.attempts == 1
    db.commit()
    assert claim_next(db, "w2", 60) is None
