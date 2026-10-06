from app.markdown import render_markdown

MEDIA = "/api/v1/media/0123456789abcdef0123456789abcdef.webp"


def test_scripts_and_raw_html_are_neutralised():
    html = render_markdown("**b** <script>alert(1)</script> [x](javascript:alert(1)) <img src=x onerror=alert(1)>")
    # Raw HTML survives only as escaped text; no live tags or javascript: links.
    assert "<script" not in html and "<img" not in html and 'href="javascript:' not in html
    assert "&lt;script&gt;" in html
    assert "<strong>b</strong>" in html


def test_links_get_safe_rel():
    assert 'rel="noopener noreferrer nofollow"' in render_markdown("[ok](https://example.com)")


def test_images_are_dropped_unless_allowed():
    assert "<img" not in render_markdown(f"![a]({MEDIA})")


def test_allowed_images_only_from_media_library_or_https():
    html = render_markdown(
        f"![a]({MEDIA}) ![b](http://insecure.example/a.png) ![c](https://cdn.example/c.png) ![d](data:image/png;base64,AA)",
        allow_images=True,
    )
    assert f'src="{MEDIA}"' in html
    assert 'src="https://cdn.example/c.png"' in html
    assert "insecure.example" not in html
    assert "data:" not in html
