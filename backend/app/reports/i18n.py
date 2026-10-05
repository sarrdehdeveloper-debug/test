"""Translated labels for the PDF report and the report email (English fallback for other locales).

Sign/animal/element names are fixed vocabulary, so they live here rather than in the CMS.
Strings may contain ``{placeholders}`` filled with ``str.format`` by the caller.
"""

from __future__ import annotations

FALLBACK_LOCALE = "en"
RTL_LOCALES = frozenset({"ar", "fa", "he", "ur"})

SIGN_NAMES: dict[str, dict[str, str]] = {
    "en": {
        "aries": "Aries",
        "taurus": "Taurus",
        "gemini": "Gemini",
        "cancer": "Cancer",
        "leo": "Leo",
        "virgo": "Virgo",
        "libra": "Libra",
        "scorpio": "Scorpio",
        "sagittarius": "Sagittarius",
        "capricorn": "Capricorn",
        "aquarius": "Aquarius",
        "pisces": "Pisces",
    },
    "ar": {
        "aries": "الحمل",
        "taurus": "الثور",
        "gemini": "الجوزاء",
        "cancer": "السرطان",
        "leo": "الأسد",
        "virgo": "العذراء",
        "libra": "الميزان",
        "scorpio": "العقرب",
        "sagittarius": "القوس",
        "capricorn": "الجدي",
        "aquarius": "الدلو",
        "pisces": "الحوت",
    },
}

ANIMAL_NAMES: dict[str, dict[str, str]] = {
    "en": {
        "rat": "Rat",
        "ox": "Ox",
        "tiger": "Tiger",
        "rabbit": "Rabbit",
        "dragon": "Dragon",
        "snake": "Snake",
        "horse": "Horse",
        "goat": "Goat",
        "monkey": "Monkey",
        "rooster": "Rooster",
        "dog": "Dog",
        "pig": "Pig",
    },
    "ar": {
        "rat": "الفأر",
        "ox": "الثور",
        "tiger": "النمر",
        "rabbit": "الأرنب",
        "dragon": "التنين",
        "snake": "الأفعى",
        "horse": "الحصان",
        "goat": "الماعز",
        "monkey": "القرد",
        "rooster": "الديك",
        "dog": "الكلب",
        "pig": "الخنزير",
    },
}

ELEMENT_NAMES: dict[str, dict[str, str]] = {
    "en": {"wood": "Wood", "fire": "Fire", "earth": "Earth", "metal": "Metal", "water": "Water"},
    "ar": {"wood": "الخشب", "fire": "النار", "earth": "الأرض", "metal": "المعدن", "water": "الماء"},
}

POLARITY_NAMES: dict[str, dict[str, str]] = {
    "en": {"yang": "Yang", "yin": "Yin"},
    "ar": {"yang": "يانغ", "yin": "يين"},
}

STRINGS: dict[str, dict[str, str]] = {
    "en": {
        # PDF
        "report_title": "Your Zodiac Blend Report",
        "tagline": "Two Traditions. One Truth.",
        "prepared_for": "Prepared for",
        "chart_at_a_glance": "Your Chart at a Glance",
        "western_heading": "Western Astrology",
        "chinese_heading": "Chinese Zodiac · Four Pillars",
        "sun": "Sun",
        "moon": "Moon",
        "ascendant": "Ascendant",
        "pillar_year": "Year",
        "pillar_month": "Month",
        "pillar_day": "Day",
        "pillar_hour": "Hour",
        "day_master": "Day Master",
        "pillar_value": "{polarity} {element} {animal}",
        "day_master_value": "{polarity} {element}",
        "sun_on_cusp": "Your Sun sits within one degree of a sign boundary (on the cusp).",
        "generated_on": "Generated on {date}",
        "part_label": "Part {number} of {total}",
        "section_fallback_title": "Chapter {number}",
        "zodiac_note": "Tropical zodiac",
        "boundary_lichun": "Chinese year begins at Lichun (Start of Spring)",
        "boundary_lunar_new_year": "Chinese year begins at the Lunar New Year",
        "closing_title": "About This Report",
        "disclaimer": (
            "This report blends Western astrology with the Chinese zodiac to offer perspectives for "
            "reflection and personal exploration. It is intended for entertainment and self-reflection "
            "only, and it is not a substitute for professional medical, psychological, legal or "
            "financial advice. Your choices and your path remain entirely your own."
        ),
        "ai_note": (
            "The interpretations were written with the help of artificial intelligence, guided by the "
            "positions calculated from your birth date, time and place."
        ),
        "privacy_note": "Your personal report is private. Please keep this file in a safe place.",
        "contact_heading": "Stay in touch",
        "thank_you": "Thank you for exploring your Zodiac Blend.",
        # Email
        "email_subject": "Your Zodiac Blend report is ready",
        "email_preheader": "Your personal report is ready to download. The secure link expires on {expires}.",
        "email_greeting_named": "Dear {name},",
        "email_greeting": "Hello,",
        "email_intro": (
            "Your personal Zodiac Blend report, blending Western astrology with the Chinese zodiac, is ready."
        ),
        "email_cta": "Download my report",
        "email_expiry": "For your privacy, this download link expires on {expires}.",
        "email_after_expiry": "After that time the report is permanently deleted from our servers.",
        "email_link_fallback": "If the button does not work, copy and paste this link into your browser:",
        "email_attachment_note": "For your convenience, the report is also attached to this email as a PDF.",
        "email_not_you": "If you did not request this report, you can safely ignore this email.",
        "email_signoff": "With warm regards,",
        "email_team": "The Zodiac Blend team",
    },
    "ar": {
        # PDF
        "report_title": "تقرير زودياك بلند الخاص بك",
        "tagline": "تقليدان. حقيقة واحدة.",
        "prepared_for": "أُعدّ خصيصاً لـ",
        "chart_at_a_glance": "خريطتك في لمحة",
        "western_heading": "علم التنجيم الغربي",
        "chinese_heading": "الأبراج الصينية · الأعمدة الأربعة",
        "sun": "الشمس",
        "moon": "القمر",
        "ascendant": "الطالع",
        "pillar_year": "السنة",
        "pillar_month": "الشهر",
        "pillar_day": "اليوم",
        "pillar_hour": "الساعة",
        "day_master": "سيّد اليوم",
        "pillar_value": "{animal} · {element} ({polarity})",
        "day_master_value": "{element} ({polarity})",
        "sun_on_cusp": "تقع شمسك على بُعد أقل من درجة واحدة من حدود البرج (على الحافة بين برجين).",
        "generated_on": "تاريخ الإصدار: {date}",
        "part_label": "الجزء {number} من {total}",
        "section_fallback_title": "الفصل {number}",
        "zodiac_note": "دائرة البروج الاستوائية",
        "boundary_lichun": "تبدأ السنة الصينية عند ليتشون (بداية الربيع)",
        "boundary_lunar_new_year": "تبدأ السنة الصينية عند رأس السنة القمرية",
        "closing_title": "عن هذا التقرير",
        "disclaimer": (
            "يمزج هذا التقرير بين علم التنجيم الغربي والأبراج الصينية ليقدّم لك رؤى للتأمل واستكشاف الذات. "
            "وهو مخصّص للترفيه والتأمل الشخصي فقط، ولا يُعدّ بديلاً عن الاستشارة الطبية أو النفسية أو "
            "القانونية أو المالية المتخصصة. تبقى قراراتك وطريقك ملكك وحدك."
        ),
        "ai_note": (
            "كُتبت التفسيرات بمساعدة الذكاء الاصطناعي، استناداً إلى المواقع المحسوبة من تاريخ ووقت ومكان ميلادك."
        ),
        "privacy_note": "تقريرك الشخصي خاص بك. يُرجى الاحتفاظ بهذا الملف في مكان آمن.",
        "contact_heading": "لنبقَ على تواصل",
        "thank_you": "شكراً لاستكشافك مزيجك الفلكي مع زودياك بلند.",
        # Email
        "email_subject": "تقرير زودياك بلند الخاص بك جاهز",
        "email_preheader": "تقريرك الشخصي جاهز للتحميل. ينتهي الرابط الآمن في {expires}.",
        "email_greeting_named": "عزيزنا {name}،",
        "email_greeting": "مرحباً،",
        "email_intro": "تقريرك الشخصي من زودياك بلند، الذي يمزج بين علم التنجيم الغربي والأبراج الصينية، أصبح جاهزاً.",
        "email_cta": "تحميل تقريري",
        "email_expiry": "حفاظاً على خصوصيتك، تنتهي صلاحية رابط التحميل في {expires}.",
        "email_after_expiry": "بعد ذلك يُحذف التقرير نهائياً من خوادمنا.",
        "email_link_fallback": "إذا لم يعمل الزر، انسخ هذا الرابط والصقه في متصفحك:",
        "email_attachment_note": "لراحتك، أرفقنا التقرير أيضاً بهذه الرسالة كملف PDF.",
        "email_not_you": "إذا لم تطلب هذا التقرير، يمكنك تجاهل هذه الرسالة بأمان.",
        "email_signoff": "مع أطيب التحيات،",
        "email_team": "فريق زودياك بلند",
    },
}


def _table(tables: dict[str, dict[str, str]], locale: str) -> dict[str, str]:
    return tables.get(locale) or tables[FALLBACK_LOCALE]


def text(locale: str, key: str, **values: object) -> str:
    """Translated string for ``key`` (falls back to English), formatted with ``values``."""
    template = _table(STRINGS, locale).get(key) or STRINGS[FALLBACK_LOCALE][key]
    return template.format(**values) if values else template


def strings(locale: str) -> dict[str, str]:
    """All strings for a locale, with English filling any gaps."""
    return {**STRINGS[FALLBACK_LOCALE], **STRINGS.get(locale, {})}


def _name(tables: dict[str, dict[str, str]], locale: str, key: str) -> str:
    return _table(tables, locale).get(key) or tables[FALLBACK_LOCALE].get(key) or key.replace("_", " ").title()


def sign_name(locale: str, sign: str) -> str:
    return _name(SIGN_NAMES, locale, sign)


def animal_name(locale: str, animal: str) -> str:
    return _name(ANIMAL_NAMES, locale, animal)


def element_name(locale: str, element: str) -> str:
    return _name(ELEMENT_NAMES, locale, element)


def polarity_name(locale: str, polarity: str) -> str:
    return _name(POLARITY_NAMES, locale, polarity)


def is_rtl(locale: str) -> bool:
    return locale in RTL_LOCALES
