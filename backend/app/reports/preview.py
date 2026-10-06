"""Sample report data, used to preview the PDF design without a real order (and by the tests).

python -m app.reports.preview --locale ar --out /tmp/sample-ar.pdf
"""

from __future__ import annotations

import argparse
import sys
import uuid
from pathlib import Path

from app.charts.schemas import CALC_VERSION, Chart, ChartInput, ChineseChart, Pillar, WesternChart, ZodiacPoint
from app.generation.service import REPORT_SLOTS
from app.models import Order, OrderStatus, ReportSection, SectionStatus
from app.security import hash_token, new_token

_TITLES: dict[str, list[str]] = {
    "en": [
        "Your Core Self",
        "Heart and Emotions",
        "The Face You Show the World",
        "The Spirit of Your Year Animal",
        "Your Four Pillars in Harmony",
        "Your Path Forward",
    ],
    "ar": [
        "جوهرك الحقيقي",
        "القلب والمشاعر",
        "الوجه الذي تُظهره للعالم",
        "روح حيوان سنتك",
        "أعمدتك الأربعة في تناغم",
        "طريقك إلى الأمام",
    ],
}

_PARAGRAPHS: dict[str, list[str]] = {
    "en": [
        "With the Sun in **Leo**, you carry a warmth that others notice before you say a word. You are at "
        "your best when you can create, lead and be generous with your light, and you quietly need to be "
        "seen for who you truly are rather than for the role you play.",
        "The Chinese tradition adds a second voice to this portrait. Born in a year of the *Metal Horse*, "
        "you pair that solar warmth with restless independence: you would rather gallop toward an open "
        "horizon than wait for permission. The two traditions agree on one thing — you are meant to move.",
        "When these energies are balanced you inspire people simply by being yourself. When they are not, "
        "pride can make it hard to ask for help, and impatience can make you leave just before the harvest.",
    ],
    "ar": [
        "مع وجود الشمس في برج **الأسد**، تحمل دفئاً يلاحظه الآخرون قبل أن تنطق بكلمة. تكون في أفضل حالاتك "
        "عندما تُبدع وتقود وتمنح من نورك بسخاء، وتحتاج في أعماقك إلى أن يُرى جوهرك الحقيقي لا الدور الذي تؤديه.",
        "ويضيف التقليد الصيني صوتاً ثانياً إلى هذه الصورة. فقد وُلدت في سنة *الحصان المعدني*، فتمزج دفء الشمس "
        "باستقلالية لا تهدأ: تفضّل أن تنطلق نحو أفق مفتوح على أن تنتظر الإذن. "
        "ويتفق التقليدان على أمر واحد: خُلقت لتتحرك.",
        "عندما تتوازن هذه الطاقات تُلهم الناس بمجرد أن تكون نفسك، وعندما تختل قد يصعّب الكبرياء طلب المساعدة، "
        "وقد يدفعك نفاد الصبر إلى الرحيل قبل موسم الحصاد بقليل.",
    ],
}

_EXTRAS: dict[str, str] = {
    "en": (
        "### Strengths to lean on\n\n- Natural confidence and creative courage\n- Loyalty to the people you love\n"
        "- A gift for turning ideas into movement\n\n> Your light is not diminished when you share it."
    ),
    "ar": (
        "### نقاط قوة تستند إليها\n\n- ثقة طبيعية وشجاعة إبداعية\n- وفاء لمن تحب\n- موهبة في تحويل الأفكار إلى حركة\n\n"
        "> نورك لا ينقص حين تشاركه."
    ),
}


def sample_chart() -> Chart:
    """A realistic chart: 17 Aug 1990 14:30 in Cairo (Leo Sun, Metal Horse year)."""
    return Chart(
        calc_version=CALC_VERSION,
        input=ChartInput(
            local_datetime="1990-08-17T14:30:00+03:00",
            utc_datetime="1990-08-17T11:30:00+00:00",
            timezone="Africa/Cairo",
            utc_offset_minutes=180,
            is_dst=True,
            fold=0,
            latitude=30.06263,
            longitude=31.24967,
            place_label="Cairo, Egypt",
        ),
        western=WesternChart(
            sun=ZodiacPoint(sign="leo", longitude=144.3, degree_in_sign=24.3),
            moon=ZodiacPoint(sign="pisces", longitude=333.8, degree_in_sign=3.8),
            ascendant=ZodiacPoint(sign="scorpio", longitude=227.2, degree_in_sign=17.2),
            sun_on_cusp=False,
        ),
        chinese=ChineseChart(
            year_boundary="lichun",
            day_boundary="midnight",
            year=_pillar("庚", "午", "gēng", "wǔ", "horse", "metal", "yang"),
            month=_pillar("甲", "申", "jiǎ", "shēn", "monkey", "wood", "yang"),
            day=_pillar("乙", "卯", "yǐ", "mǎo", "rabbit", "wood", "yin"),
            hour=_pillar("癸", "未", "guǐ", "wèi", "goat", "water", "yin"),
        ),
    )


def _pillar(stem: str, branch: str, stem_py: str, branch_py: str, animal: str, element: str, polarity: str) -> Pillar:
    return Pillar.model_validate(
        {
            "stem": stem,
            "branch": branch,
            "stem_pinyin": stem_py,
            "branch_pinyin": branch_py,
            "animal": animal,
            "element": element,
            "polarity": polarity,
        }
    )


def sample_section_content(locale: str, slot: int) -> str:
    lang = locale if locale in _PARAGRAPHS else "en"
    paragraphs = _PARAGRAPHS[lang]
    # Rotate paragraphs so every chapter reads a little differently; repeat to fill ~1.5 pages.
    body = [paragraphs[(slot + i) % len(paragraphs)] for i in range(len(paragraphs) * 2)]
    return "\n\n".join([*body[:3], _EXTRAS[lang], *body[3:]])


def sample_sections(order: Order) -> list[ReportSection]:
    """Six completed (transient) sections for ``order``."""
    lang = order.locale if order.locale in _TITLES else "en"
    sections = []
    for slot in REPORT_SLOTS:
        content = sample_section_content(order.locale, slot)
        sections.append(
            ReportSection(
                order_id=order.id,
                slot=slot,
                title=_TITLES[lang][slot - 1],
                content=content,
                word_count=len(content.split()),
                attempts=1,
                status=SectionStatus.DONE,
                model="sample",
            )
        )
    return sections


def sample_order(
    locale: str = "en",
    *,
    display_name: str | None = "Layla Hassan",
    status: OrderStatus = OrderStatus.GENERATING,
    access_token_hash: str | None = None,
    email: str = "layla@example.com",
) -> Order:
    """A complete transient order (all required columns set) carrying :func:`sample_chart`."""
    return Order(
        id=uuid.uuid4(),
        status=status,
        email=email,
        locale=locale,
        display_name=display_name,
        chart=sample_chart().model_dump(mode="json"),
        calc_version=CALC_VERSION,
        list_price_cents=2900,
        discount_cents=0,
        amount_cents=2900,
        currency="USD",
        payment_provider="fake",
        access_token_hash=access_token_hash or hash_token(new_token()),
        time_fold=0,
        prompt_version_ids=[],
    )


def main(argv: list[str] | None = None) -> int:
    from app.reports.pdf import render_report_pdf

    parser = argparse.ArgumentParser(description="Render a sample Zodiac Blend report PDF.")
    parser.add_argument("--locale", default="en")
    parser.add_argument("--name", default="Layla Hassan")
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args(argv)
    order = sample_order(args.locale, display_name=args.name or None)
    args.out.write_bytes(render_report_pdf(order, sample_sections(order)))
    print(f"Wrote {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
