"""Tests for CMS media: upload verification and re-encoding, storage, listing, deletion, public serving."""

from __future__ import annotations

import os
from io import BytesIO
from pathlib import Path

import pytest
from PIL import Image, PngImagePlugin
from sqlalchemy import select

from app.config import get_settings
from app.content.media import FILE_NAME_RE
from app.models import AuditLog, BlogPost, Media, Offer, PostStatus

ADMIN_MEDIA = "/api/v1/admin/media"
EXIF_ORIENTATION, EXIF_MAKE, EXIF_ARTIST = 0x0112, 0x010F, 0x013B


# ---------------------------------------------------------------------------
# Image factories
# ---------------------------------------------------------------------------


_COLORS: dict[str, tuple[int, ...]] = {
    "RGB": (200, 30, 30),
    "RGBA": (200, 30, 30, 255),
    "LA": (128, 255),
    "CMYK": (0, 80, 80, 0),
}


def make_image(fmt: str = "PNG", size: tuple[int, int] = (20, 10), mode: str = "RGB", **save: object) -> bytes:
    buf = BytesIO()
    Image.new(mode, size, _COLORS.get(mode, 128)).save(buf, fmt, **save)
    return buf.getvalue()


def exif_bytes(orientation: int | None = None) -> bytes:
    exif = Image.Exif()
    exif[EXIF_MAKE] = "SecretCam"
    exif[EXIF_ARTIST] = "Jane Private"
    if orientation is not None:
        exif[EXIF_ORIENTATION] = orientation
    return exif.tobytes()


def animated_gif() -> bytes:
    frames = [Image.new("P", (8, 8), i) for i in (1, 2)]
    buf = BytesIO()
    frames[0].save(buf, "GIF", save_all=True, append_images=frames[1:], duration=100, loop=0, comment=b"hello")
    return buf.getvalue()


def _incompressible_png(side: int) -> bytes:
    buf = BytesIO()
    Image.frombytes("RGB", (side, side), os.urandom(side * side * 3)).save(buf, "PNG")
    return buf.getvalue()


def upload(client, data: bytes, name: str = "photo.png", content_type: str = "image/png"):
    return client.post(ADMIN_MEDIA, files={"file": (name, data, content_type)})


def stored_files() -> list[Path]:
    directory = get_settings().media_dir
    return sorted(directory.iterdir()) if directory.exists() else []


@pytest.fixture
def editor(admin_client):
    return admin_client("editor")


# ---------------------------------------------------------------------------
# Successful uploads
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("fmt", "ext", "content_type"),
    [
        ("PNG", "png", "image/png"),
        ("JPEG", "jpg", "image/jpeg"),
        ("WEBP", "webp", "image/webp"),
        ("GIF", "gif", "image/gif"),
    ],
)
def test_upload_each_allowed_format(editor, client, db, fmt, ext, content_type):
    r = upload(editor, make_image(fmt), name=f"pic.{ext}", content_type="application/octet-stream")
    assert r.status_code == 201, r.text
    body = r.json()
    assert FILE_NAME_RE.fullmatch(body["file_name"]) and body["file_name"].endswith(f".{ext}")
    assert body["url"] == f"/api/v1/media/{body['file_name']}"
    assert (body["content_type"], body["width"], body["height"]) == (content_type, 20, 10)
    assert {"id", "url", "file_name", "content_type", "size_bytes", "width", "height", "created_at"} <= set(body)
    path = get_settings().media_dir / body["file_name"]
    assert path.is_file() and path.stat().st_size == body["size_bytes"]
    served = client.get(body["url"])
    assert served.status_code == 200
    assert served.content == path.read_bytes()
    assert served.headers["content-type"] == content_type
    row = db.get(Media, body["id"])
    assert (row.file_name, row.width, row.height, row.original_name) == (body["file_name"], 20, 10, f"pic.{ext}")
    [entry] = db.scalars(select(AuditLog).where(AuditLog.action == "media.upload"))
    assert entry.entity_id == str(body["id"])
    assert entry.data == {"file_name": body["file_name"], "size_bytes": body["size_bytes"]}


def test_format_is_detected_from_content_not_name(editor):
    r = upload(editor, make_image("JPEG"), name="looks-like.png", content_type="image/png")
    assert r.status_code == 201
    assert r.json()["content_type"] == "image/jpeg" and r.json()["file_name"].endswith(".jpg")


def test_each_upload_gets_a_fresh_random_name(editor):
    names = {upload(editor, make_image()).json()["file_name"] for _ in range(3)}
    assert len(names) == 3


@pytest.mark.parametrize(
    ("fmt", "mode", "save"),
    [
        ("PNG", "P", {"transparency": 0}),
        ("PNG", "LA", {}),
        ("PNG", "I;16", {}),
        ("JPEG", "CMYK", {}),
        ("JPEG", "L", {}),
        ("WEBP", "RGBA", {"lossless": True}),
    ],
)
def test_upload_various_modes(editor, fmt, mode, save):
    r = upload(editor, make_image(fmt, mode=mode, **save))
    assert r.status_code == 201, r.text


def test_jpeg_metadata_is_stripped_and_orientation_applied(editor):
    data = make_image("JPEG", size=(20, 10), exif=exif_bytes(orientation=6))
    assert Image.open(BytesIO(data)).getexif()[EXIF_MAKE] == "SecretCam"
    body = upload(editor, data, name="IMG_0001.jpg").json()
    stored = (get_settings().media_dir / body["file_name"]).read_bytes()
    assert b"SecretCam" not in stored and b"Jane Private" not in stored
    with Image.open(BytesIO(stored)) as img:
        assert len(img.getexif()) == 0
        assert img.size == (10, 20)  # rotated 90 degrees: orientation baked into the pixels
    assert (body["width"], body["height"]) == (10, 20)


def test_png_text_chunks_and_trailing_data_are_stripped(editor):
    info = PngImagePlugin.PngInfo()
    info.add_text("Comment", "GPS 30.06N 31.25E")
    data = make_image("PNG", pnginfo=info) + b"<html><script>alert(1)</script></html>"
    body = upload(editor, data).json()
    stored = (get_settings().media_dir / body["file_name"]).read_bytes()
    assert b"GPS" not in stored and b"<script" not in stored
    with Image.open(BytesIO(stored)) as img:
        assert "Comment" not in img.info


def test_webp_exif_is_stripped_and_lossless_kept(editor):
    from app.content.media import _webp_is_lossless

    data = make_image("WEBP", mode="RGBA", lossless=True, exif=exif_bytes())
    assert b"SecretCam" in data
    body = upload(editor, data, name="logo.webp").json()
    stored = (get_settings().media_dir / body["file_name"]).read_bytes()
    assert b"SecretCam" not in stored
    assert _webp_is_lossless(stored)
    lossy = upload(editor, make_image("WEBP", quality=50), name="photo.webp").json()
    assert not _webp_is_lossless((get_settings().media_dir / lossy["file_name"]).read_bytes())


def test_animated_webp_keeps_its_frames(editor):
    frames = [Image.new("RGB", (8, 8), c) for c in ("red", "blue")]
    buf = BytesIO()
    frames[0].save(buf, "WEBP", save_all=True, append_images=frames[1:], duration=100)
    body = upload(editor, buf.getvalue(), name="anim.webp").json()
    with Image.open(get_settings().media_dir / body["file_name"]) as img:
        assert img.n_frames == 2


def test_gif_is_stored_unchanged(editor):
    data = animated_gif()
    body = upload(editor, data, name="anim.gif", content_type="image/gif").json()
    assert (get_settings().media_dir / body["file_name"]).read_bytes() == data
    assert body["size_bytes"] == len(data)


def test_original_name_is_reduced_to_a_clean_base_name(editor, db):
    body = upload(editor, make_image(), name="..\\..\\evil/\x07../dir/photo‮.png").json()
    row = db.get(Media, body["id"])
    assert "/" not in row.original_name and "\\" not in row.original_name
    assert "\x07" not in row.original_name
    assert row.original_name.endswith(".png")


def test_max_dimension_is_accepted(editor):
    r = upload(editor, make_image("PNG", size=(6000, 1), mode="L"))
    assert r.status_code == 201
    assert (r.json()["width"], r.json()["height"]) == (6000, 1)


# ---------------------------------------------------------------------------
# Rejected uploads
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("data", "name"),
    [
        (b"hello, I am plain text pretending to be a picture", "notes.png"),
        (b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', "logo.svg"),
        (b'<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>', "logo.png"),
        (b"<html><body>hi</body></html>", "page.gif"),
        (b"\x89PNG\r\n\x1a\n" + b"\x00" * 40, "broken.png"),
        (b"GIF89a" + b"\x00" * 3, "short.gif"),
    ],
)
def test_non_images_are_rejected(editor, db, data, name):
    r = upload(editor, data, name=name)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "invalid_image"
    assert stored_files() == [] and db.scalar(select(Media)) is None


@pytest.mark.parametrize("fmt", ["BMP", "TIFF", "ICO", "PPM"])
def test_other_pillow_formats_are_rejected(editor, fmt):
    r = upload(editor, make_image(fmt, size=(16, 16)), name=f"x.{fmt.lower()}")
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "invalid_image"


def test_truncated_image_is_rejected(editor):
    data = _incompressible_png(300)
    r = upload(editor, data[: len(data) // 2])
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "invalid_image"
    assert stored_files() == []


def test_empty_file_is_rejected(editor):
    r = upload(editor, b"")
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "invalid_image"


@pytest.mark.parametrize("size", [(6001, 1), (1, 6001)])
def test_oversized_dimensions_are_rejected(editor, size):
    r = upload(editor, make_image("PNG", size=size, mode="L"))
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "image_too_large"
    assert r.json()["error"]["details"] == {"max_width": 6000, "max_height": 6000}
    assert stored_files() == []


def test_file_slightly_over_the_limit_is_413(editor, monkeypatch):
    data = _incompressible_png(40)  # ~4.8 KB
    monkeypatch.setattr(get_settings(), "max_upload_bytes", len(data) - 1)
    r = upload(editor, data)
    assert r.status_code == 413
    assert r.json()["error"]["code"] == "file_too_large"
    assert r.json()["error"]["details"] == {"max_bytes": len(data) - 1}
    assert stored_files() == []


def test_file_far_over_the_limit_is_413_before_parsing(editor, monkeypatch):
    monkeypatch.setattr(get_settings(), "max_upload_bytes", 1000)
    r = upload(editor, _incompressible_png(200))  # ~120 KB: over the limit plus multipart overhead
    assert r.status_code == 413
    assert r.json()["error"]["code"] == "file_too_large"


def test_file_exactly_at_the_limit_is_accepted(editor, monkeypatch):
    data = _incompressible_png(40)
    monkeypatch.setattr(get_settings(), "max_upload_bytes", len(data))
    assert upload(editor, data).status_code == 201


def test_default_limit_is_five_megabytes():
    assert get_settings().max_upload_bytes == 5 * 1024 * 1024


def test_missing_file_field(editor):
    r = editor.post(ADMIN_MEDIA, files={"image": ("a.png", make_image(), "image/png")})
    assert r.status_code == 422
    assert r.json()["error"]["details"]["fields"][0]["field"] == "file"


def test_plain_form_field_named_file_is_rejected(editor):
    r = editor.post(ADMIN_MEDIA, data={"file": "not a file"}, files={"x": ("a.txt", b"x", "text/plain")})
    assert r.status_code == 422


def test_non_multipart_body_is_415(editor):
    r = editor.post(ADMIN_MEDIA, json={"file": "iVBORw0KGgo="})
    assert r.status_code == 415
    assert r.json()["error"]["code"] == "unsupported_media_type"


def test_two_files_are_rejected(editor):
    files = [("file", ("a.png", make_image(), "image/png")), ("file", ("b.png", make_image(), "image/png"))]
    r = editor.post(ADMIN_MEDIA, files=files)
    assert r.status_code == 422
    assert stored_files() == []


def test_malformed_multipart_is_rejected(editor):
    r = editor.post(
        ADMIN_MEDIA,
        content=b"--nope\r\ngarbage",
        headers={"Content-Type": "multipart/form-data; boundary=xyz"},
    )
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# Access control
# ---------------------------------------------------------------------------


def test_upload_requires_login(client, db):
    r = client.post(ADMIN_MEDIA, files={"file": ("a.png", make_image(), "image/png")}, headers={"X-ZB-Admin": "1"})
    assert r.status_code == 401
    assert stored_files() == [] and db.scalar(select(Media)) is None


def test_upload_requires_admin_header(editor, db):
    del editor.headers["X-ZB-Admin"]
    r = upload(editor, make_image())
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "csrf_failed"
    assert stored_files() == [] and db.scalar(select(Media)) is None


def test_list_and_delete_require_login(client):
    assert client.get(ADMIN_MEDIA).status_code == 401
    assert client.delete(f"{ADMIN_MEDIA}/1", headers={"X-ZB-Admin": "1"}).status_code == 401


@pytest.mark.parametrize("role", ["owner", "admin", "editor"])
def test_all_admin_roles_can_upload(admin_client, role):
    assert upload(admin_client(role), make_image()).status_code == 201


# ---------------------------------------------------------------------------
# Listing and deletion
# ---------------------------------------------------------------------------


def test_list_media_newest_first_with_pagination(editor):
    ids = [upload(editor, make_image()).json()["id"] for _ in range(3)]
    listing = editor.get(ADMIN_MEDIA).json()
    assert [m["id"] for m in listing["items"]] == ids[::-1]
    assert (listing["total"], listing["page"], listing["page_size"]) == (3, 1, 20)
    page2 = editor.get(ADMIN_MEDIA, params={"page": 2, "page_size": 2}).json()
    assert [m["id"] for m in page2["items"]] == [ids[0]]
    assert editor.get(ADMIN_MEDIA, params={"page": 0}).status_code == 422


def test_delete_media_removes_row_and_file(editor, client, db):
    body = upload(editor, make_image()).json()
    path = get_settings().media_dir / body["file_name"]
    r = editor.delete(f"{ADMIN_MEDIA}/{body['id']}")
    assert r.status_code == 200 and r.json() == {"deleted": True}
    assert not path.exists()
    db.expire_all()
    assert db.get(Media, body["id"]) is None
    assert client.get(body["url"]).status_code == 404
    assert editor.delete(f"{ADMIN_MEDIA}/{body['id']}").status_code == 404
    [entry] = db.scalars(select(AuditLog).where(AuditLog.action == "media.delete"))
    assert entry.data == {"file_name": body["file_name"]}


def test_delete_media_with_missing_file_still_removes_row(editor, db):
    body = upload(editor, make_image()).json()
    (get_settings().media_dir / body["file_name"]).unlink()
    assert editor.delete(f"{ADMIN_MEDIA}/{body['id']}").status_code == 200
    db.expire_all()
    assert db.get(Media, body["id"]) is None


def test_delete_media_in_use_is_refused(editor, db):
    body = upload(editor, make_image()).json()
    offer = Offer(slug="promo", translations={"en": {"title": "Promo"}}, image_url=body["url"])
    post = BlogPost(
        slug="post",
        translations={"en": {"title": "Post"}},
        cover_image_url=f"https://zodiacblend.com{body['url']}",
        status=PostStatus.DRAFT,
    )
    db.add_all([offer, post])
    db.commit()
    r = editor.delete(f"{ADMIN_MEDIA}/{body['id']}")
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "media_in_use"
    refs = r.json()["error"]["details"]["references"]
    assert {(ref["entity_type"], ref["id"]) for ref in refs} == {("offer", offer.id), ("blog_post", post.id)}
    assert (get_settings().media_dir / body["file_name"]).exists()
    offer.image_url = None
    post.cover_image_url = None
    db.commit()
    assert editor.delete(f"{ADMIN_MEDIA}/{body['id']}").status_code == 200


@pytest.mark.parametrize("bad_id", ["0", "abc", "-5"])
def test_delete_media_bad_id(editor, bad_id):
    assert editor.delete(f"{ADMIN_MEDIA}/{bad_id}").status_code == 422
