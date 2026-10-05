"""Sample commercial content: a launch discount and offer, the first Galaxy Library series and
three foundational blog posts, all in English and Arabic.

These rows are "sample" content: once seeded, admins own them. If an admin deletes one, normal
seed runs do not bring it back (see ``app.seed.loader``).
"""

from __future__ import annotations

from typing import Final

from app.models import DiscountKind
from app.seed.schemas import (
    BlogPostSeed,
    BookSeed,
    DiscountSeed,
    OfferSeed,
    OfferTranslation,
    PostTranslation,
    SeriesSeed,
    TitleDescription,
)

# ---------------------------------------------------------------------------
# Discount & offer
# ---------------------------------------------------------------------------

WELCOME_CODE: Final = "WELCOME10"

DISCOUNTS: Final[tuple[DiscountSeed, ...]] = (
    DiscountSeed(
        code=WELCOME_CODE,
        description="Launch offer: 10% off the full report",
        kind=DiscountKind.PERCENT,
        value=10,
        is_active=True,
    ),
)

OFFERS: Final[tuple[OfferSeed, ...]] = (
    OfferSeed(
        slug="launch",
        cta_url="/reading",
        discount_code=WELCOME_CODE,
        show_banner=True,
        is_active=True,
        sort_order=0,
        translations={
            "en": OfferTranslation(
                title="Launch offer: 10% off your full report",
                subtitle=f"Celebrate the opening of Zodiac Blend with code {WELCOME_CODE}.",
                body=(
                    "To welcome you to Zodiac Blend, take **10% off** your full blended report: your Sun, Moon "
                    "and Ascendant together with your four Chinese pillars, crafted into a personal six-part PDF.\n\n"
                    f"Enter the code **{WELCOME_CODE}** when you order. One code per order."
                ),
                cta_label="Get my full report",
            ),
            "ar": OfferTranslation(
                title="عرض الإطلاق: خصم 10% على تقريرك الكامل",
                subtitle=f"احتفل بانطلاق Zodiac Blend مع الرمز {WELCOME_CODE}.",
                body=(
                    "ترحيبًا بك في Zodiac Blend، احصل على **خصم 10%** على تقريرك المدمج الكامل: الشمس والقمر "
                    "والطالع مع أعمدتك الصينية الأربعة، في تقرير شخصي من ستة أقسام بصيغة PDF.\n\n"
                    f"أدخل الرمز **{WELCOME_CODE}** عند الطلب. رمز واحد لكل طلب."
                ),
                cta_label="احصل على تقريري الكامل",
            ),
        },
    ),
)

# ---------------------------------------------------------------------------
# Galaxy Library
# ---------------------------------------------------------------------------

LIBRARY: Final[tuple[SeriesSeed, ...]] = (
    SeriesSeed(
        slug="galaxy-library-volume-1",
        sort_order=0,
        translations={
            "en": TitleDescription(
                title="Galaxy Library: Volume One",
                description=(
                    "The first volume of the Galaxy Library: illustrated tales in which a sign of the Western "
                    "sky and an animal of the Chinese calendar set out on a journey together, and discover how "
                    "much they share.\n\n"
                    "Written for curious readers of every age, each story closes with a few reflections to "
                    "bring the two traditions into your own life."
                ),
            ),
            "ar": TitleDescription(
                title="مكتبة المجرّة: المجلد الأول",
                description=(
                    "المجلد الأول من مكتبة المجرّة: حكايات مصوّرة ينطلق فيها برج من السماء الغربية وحيوان من "
                    "التقويم الصيني في رحلة واحدة، فيكتشفان كم يتشابهان.\n\n"
                    "كُتبت للقرّاء الفضوليين من كل الأعمار، وتُختتم كل حكاية بتأملات قصيرة تقرّب التقليدين من "
                    "حياتك اليومية."
                ),
            ),
        },
        books=(
            BookSeed(
                slug="the-dragon-and-the-ram",
                sort_order=1,
                translations={
                    "en": TitleDescription(
                        title="The Dragon and the Ram",
                        description=(
                            "Bold Aries the Ram meets the Chinese Dragon, and two born leaders learn that true "
                            "strength sometimes means letting another lead. A story of courage, pride and the "
                            "fire that brings people together.\n\n*Coming soon.*"
                        ),
                    ),
                    "ar": TitleDescription(
                        title="التنين والكبش",
                        description=(
                            "يلتقي الكبش، رمز برج الحمل الجريء، بالتنين الصيني، فيتعلّم قائدان بالفطرة أن القوة "
                            "الحقيقية تعني أحيانًا أن تترك القيادة لغيرك. حكاية عن الشجاعة والكبرياء والنار التي "
                            "تجمع القلوب.\n\n*قريبًا.*"
                        ),
                    ),
                },
            ),
            BookSeed(
                slug="the-scorpion-and-the-snake",
                sort_order=2,
                translations={
                    "en": TitleDescription(
                        title="The Scorpion and the Snake",
                        description=(
                            "Two keepers of secrets, one from the Western sky and one from the Chinese calendar, "
                            "guard a hidden spring in the desert. A tale of intuition, trust and transformation."
                            "\n\n*Coming soon.*"
                        ),
                    ),
                    "ar": TitleDescription(
                        title="العقرب والأفعى",
                        description=(
                            "حارسا أسرار، أحدهما من السماء الغربية والآخر من التقويم الصيني، يحرسان نبعًا خفيًا "
                            "في الصحراء. حكاية عن الحدس والثقة والتحوّل.\n\n*قريبًا.*"
                        ),
                    ),
                },
            ),
            BookSeed(
                slug="the-archer-and-the-horse",
                sort_order=3,
                translations={
                    "en": TitleDescription(
                        title="The Archer and the Horse",
                        description=(
                            "Sagittarius the Archer and the free-spirited Horse race across the steppe in search "
                            "of the edge of the map, and find that home travels with them. A story of freedom, "
                            "friendship and belonging.\n\n*Coming soon.*"
                        ),
                    ),
                    "ar": TitleDescription(
                        title="الرامي والحصان",
                        description=(
                            "ينطلق الرامي، رمز برج القوس، مع الحصان الحرّ عبر السهوب بحثًا عن حافة الخريطة، "
                            "فيكتشفان أن الوطن يرافقهما أينما ذهبا. حكاية عن الحرية والصداقة والانتماء."
                            "\n\n*قريبًا.*"
                        ),
                    ),
                },
            ),
        ),
    ),
)

# ---------------------------------------------------------------------------
# Blog
# ---------------------------------------------------------------------------

_TWO_LENSES_EN = """\
Ask a Western astrologer who you are, and they will look at the sky: where the Sun, the Moon and the rising sign stood at the moment you were born. Ask a Chinese astrologer, and they will look at time itself: the year, month, day and hour of your birth, each written as a pair of ancient characters. Both are describing the same person. At Zodiac Blend we believe the most interesting answers appear when you hold the two lenses side by side.

## The Western lens: a map of the sky

Western astrology grew out of Babylonian sky-watching, took its familiar shape in the Hellenistic world and was preserved and refined by astronomers of the Islamic golden age before it returned to Europe. It divides the Sun's yearly path into twelve signs of thirty degrees each, from Aries to Pisces.

Three placements carry most of the weight in a personal chart:

- **The Sun**: your core drive and the way you shine when you are most yourself.
- **The Moon**: your emotional needs, your instincts and what makes you feel safe.
- **The Ascendant**: the sign rising on the eastern horizon at your birth, describing how you meet the world and how others first experience you.

The Western lens is wonderfully psychological. It asks what motivates you, what you need and how the different parts of your personality talk to one another.

## The Chinese lens: a map of time

The Chinese zodiac is built on the traditional calendar, which counts time with twelve Earthly Branches (the familiar animals, from the Rat to the Pig) and ten Heavenly Stems, which carry the five elements of Wood, Fire, Earth, Metal and Water in their yin and yang forms.

Most people know only their year animal. BaZi, often translated as the Four Pillars of Destiny, goes much further: it writes the year, month, day and hour of your birth as four pillars, each with its own stem and branch. The stem of your day pillar, called the Day Master, is read as your essential self, and the balance of elements across the four pillars shows where you are naturally strong and where you seek balance.

The Chinese lens is elemental and relational. It asks how your energies flow, what nourishes you and how you move with the seasons of life.

## Where the two lenses meet

Read together, the two traditions often say the same thing in different words. A fiery Leo Sun born in a Horse year speaks twice about warmth, movement and the need to be seen. When a message is repeated by two independent systems, it deserves your attention.

Just as often, they differ, and that is where the most useful insight lives. A careful Virgo Sun born in an adventurous Monkey year may describe someone who plans meticulously precisely so that they can improvise freely. Neither tradition alone captures that tension; the blend does.

## How to use a blended reading

Treat your chart as a mirror, not a verdict. Notice which descriptions feel true, which surprise you and which you resist: resistance is often where growth begins. A reading is an invitation to reflect, never a prediction of what must happen.

A free Zodiac Blend reading starts with your sun sign and your Chinese year animal. The full report adds your Moon, your Ascendant and all four pillars, so you can see the whole of you through both lenses at once.
"""

_TWO_LENSES_AR = """\
اسأل منجّمًا غربيًا عمّن تكون، فسينظر إلى السماء: أين كانت الشمس والقمر والبرج الطالع لحظة ولادتك. واسأل منجّمًا صينيًا، فسينظر إلى الزمن نفسه: سنة ولادتك وشهرها ويومها وساعتها، وكلٌّ منها مكتوب بحرفين صينيين عريقين. كلاهما يصف الشخص نفسه، ونحن في Zodiac Blend نؤمن بأن أجمل الإجابات تظهر حين تضع العدستين جنبًا إلى جنب.

## العدسة الغربية: خريطة للسماء

نشأ التنجيم الغربي من رصد البابليين للسماء، واتخذ شكله المعروف في العالم الهلنستي، ثم حفظه فلكيو العصر الذهبي الإسلامي وطوّروه قبل أن يعود إلى أوروبا. وهو يقسم مسار الشمس السنوي إلى اثني عشر برجًا، لكلٍّ منها ثلاثون درجة، من الحمل إلى الحوت.

وتحمل ثلاثة مواقع معظم الثقل في الخريطة الشخصية:

- **الشمس**: دافعك الجوهري وطريقتك في التألق حين تكون على طبيعتك.
- **القمر**: احتياجاتك العاطفية وغرائزك وما يمنحك الشعور بالأمان.
- **الطالع**: البرج الذي كان يشرق في الأفق الشرقي لحظة ولادتك، ويصف طريقتك في ملاقاة العالم وانطباع الآخرين الأول عنك.

العدسة الغربية نفسية بامتياز؛ فهي تسأل عمّا يحرّكك، وما تحتاج إليه، وكيف تتحاور جوانب شخصيتك المختلفة.

## العدسة الصينية: خريطة للزمن

تقوم الأبراج الصينية على التقويم التقليدي الذي يعدّ الزمن باثني عشر فرعًا أرضيًا، هي الحيوانات المعروفة من الفأر إلى الخنزير، وعشرة جذوع سماوية تحمل العناصر الخمسة: الخشب والنار والأرض والمعدن والماء، بصورتيها الين واليانغ.

معظم الناس لا يعرفون إلا حيوان سنتهم. أما «با تسي»، التي تُترجم غالبًا بأعمدة القدر الأربعة، فتذهب أبعد بكثير: إذ تكتب سنة ولادتك وشهرها ويومها وساعتها في أربعة أعمدة، لكلٍّ منها جذعه وفرعه. ويُقرأ جذع عمود اليوم، المسمّى «سيّد اليوم»، على أنه ذاتك الجوهرية، بينما يكشف توازن العناصر عبر الأعمدة الأربعة مواطن قوتك الطبيعية والمواضع التي تبحث فيها عن التوازن.

العدسة الصينية عنصرية وعلائقية؛ فهي تسأل كيف تتدفق طاقتك، وما الذي يغذّيك، وكيف تتحرك مع فصول الحياة.

## حيث تلتقي العدستان

حين نقرأ التقليدين معًا نجدهما كثيرًا ما يقولان الشيء نفسه بكلمات مختلفة. فشمس في برج الأسد الناري لشخص وُلد في سنة الحصان تتحدث مرتين عن الدفء والحركة والحاجة إلى أن يُرى. وحين تتكرر الرسالة في منظومتين مستقلتين فهي تستحق انتباهك.

وكثيرًا أيضًا ما يختلفان، وهناك تكمن أنفع البصائر. فشمس في برج العذراء الدقيق لشخص وُلد في سنة القرد المغامر قد تصف إنسانًا يخطط بإتقان كي يتمكن من الارتجال بحرية. لا يلتقط أيٌّ من التقليدين وحده هذا التوتر، أما المزيج فيلتقطه.

## كيف تستفيد من قراءة مدمجة

تعامل مع خريطتك كمرآة لا كحكم نهائي. لاحظ الأوصاف التي تشعر بصدقها، وتلك التي تفاجئك، وتلك التي تقاومها؛ فالمقاومة كثيرًا ما تكون بداية النمو. القراءة دعوة إلى التأمل، وليست أبدًا نبوءة بما يجب أن يحدث.

تبدأ القراءة المجانية في Zodiac Blend ببرجك الشمسي وحيوان سنتك الصيني، ويضيف التقرير الكامل القمر والطالع والأعمدة الأربعة كلها، لترى ذاتك كاملة من خلال العدستين معًا.
"""

_BIRTH_TIME_EN = """\
If you know your birth date, you already know two things about yourself: your Western sun sign and your Chinese year animal. So why does a full Zodiac Blend report ask for the exact time and the city where you were born? Because the parts of your chart that make it truly personal move far faster than the Sun.

## The sky changes by the minute

The Sun moves about one degree a day, which is why your birth date alone usually settles your sun sign. The Moon is much quicker: it crosses a whole sign in about two and a half days, moving roughly half a degree every hour. Two people born on the same day can easily have their Moon in different signs.

The Ascendant is quicker still. As the Earth turns, a new sign rises over the eastern horizon about every two hours on average, faster for some signs and slower for others depending on your latitude. Being an hour out can change your rising sign, and with it the way your report describes how you meet the world.

## The Chinese hour pillar

The Chinese calendar divides the day into twelve double-hours, each linked with one of the animals: the Rat hour runs from 23:00 to 01:00, the Ox hour from 01:00 to 03:00, and so on around the clock. Your hour pillar, one of the four pillars of BaZi, depends on the double-hour in which you were born. It adds the final layer to your chart and is traditionally linked with your aspirations and with the way your ideas take shape.

## Why the city matters

Your birthplace does two jobs.

First, **it shapes the sky you were born under**. The Ascendant depends on latitude and longitude: at the very same moment, the sign rising over Cairo differs from the one rising over London or New York.

Second, **it tells us what your clock meant**. A birth certificate records local clock time, but astronomy needs the precise universal moment. To convert one into the other, we look up your city's time zone and its historical rules, including daylight-saving time, which many countries have introduced, changed or abolished over the decades. We rely on the international time-zone database rather than a fixed offset, so a birth in 1975 is treated by the rules that applied in 1975.

Occasionally a local time is ambiguous, for example on the night the clocks went back and the same hour happened twice. If that applies to you, we ask you to confirm which one you mean.

## Finding your birth time

The best sources, in order, are:

1. Your birth certificate or a hospital record.
2. A family record, such as a baby book or a letter written at the time.
3. A parent's or relative's memory, which is useful but often rounded to the nearest hour.

If you only know an approximate time, enter your best estimate. Your sun sign and your year, month and day pillars will usually be unaffected, but treat your Ascendant and hour pillar as provisional.

## The difference it makes

With your exact time and place, we calculate your Sun, Moon and Ascendant with astronomical precision, alongside your year, month, day and hour pillars. That is the difference between a horoscope written for millions of people and a report written for one.
"""

_BIRTH_TIME_AR = """\
إن كنت تعرف تاريخ ميلادك فأنت تعرف عن نفسك أمرين: برجك الشمسي الغربي وحيوان سنتك الصيني. فلماذا يطلب التقرير الكامل في Zodiac Blend الوقت الدقيق لولادتك والمدينة التي وُلدت فيها؟ لأن أجزاء الخريطة التي تجعلها شخصية حقًا تتحرك أسرع من الشمس بكثير.

## السماء تتغير من دقيقة إلى أخرى

تتحرك الشمس نحو درجة واحدة في اليوم، ولهذا يكفي تاريخ الميلاد عادةً لتحديد برجك الشمسي. أما القمر فأسرع بكثير، إذ يعبر البرج الواحد في نحو يومين ونصف، قاطعًا قرابة نصف درجة كل ساعة. وقد يولد شخصان في اليوم نفسه والقمر لكلٍّ منهما في برج مختلف.

والطالع أسرع من ذلك أيضًا؛ فمع دوران الأرض يشرق برج جديد في الأفق الشرقي كل ساعتين تقريبًا في المتوسط، وأسرع أو أبطأ في بعض الأبراج بحسب خط العرض. وخطأ بمقدار ساعة واحدة قد يغيّر برجك الطالع، ومعه الطريقة التي يصف بها تقريرك ملاقاتك للعالم.

## عمود الساعة الصيني

يقسم التقويم الصيني اليوم إلى اثنتي عشرة ساعة مزدوجة، ترتبط كلٌّ منها بأحد الحيوانات: فساعة الفأر من 23:00 إلى 01:00، وساعة الثور من 01:00 إلى 03:00، وهكذا على مدار اليوم. ويعتمد عمود الساعة، وهو أحد أعمدة با تسي الأربعة، على الساعة المزدوجة التي وُلدت فيها، فيضيف الطبقة الأخيرة إلى خريطتك، ويرتبط تقليديًا بطموحاتك وبالطريقة التي تتشكل بها أفكارك.

## لماذا تهمّ المدينة؟

لمكان ولادتك مهمتان.

الأولى أنه **يحدد السماء التي وُلدت تحتها**؛ فالطالع يعتمد على خطَّي العرض والطول، وفي اللحظة نفسها يختلف البرج الطالع فوق القاهرة عنه فوق لندن أو نيويورك.

والثانية أنه **يوضح معنى الساعة التي سُجّلت**؛ فشهادة الميلاد تسجل التوقيت المحلي، بينما يحتاج الحساب الفلكي إلى اللحظة العالمية الدقيقة. وللتحويل بينهما نعود إلى المنطقة الزمنية لمدينتك وقواعدها التاريخية، ومنها التوقيت الصيفي الذي أقرّته دول كثيرة أو عدّلته أو ألغته على مرّ العقود. ونعتمد على قاعدة بيانات المناطق الزمنية الدولية بدلًا من فارق ثابت، فتُعامل ولادة عام 1975 بالقواعد التي كانت سارية عام 1975.

وأحيانًا يكون التوقيت المحلي ملتبسًا، كما في الليلة التي أُعيدت فيها الساعة إلى الوراء فتكررت الساعة نفسها مرتين. فإن انطبق ذلك عليك نطلب منك تأكيد الوقت الذي تقصده.

## كيف تعرف وقت ولادتك؟

أفضل المصادر بالترتيب:

1. شهادة الميلاد أو سجل المستشفى.
2. سجل عائلي، كدفتر ذكريات الطفولة أو رسالة كُتبت في حينها.
3. ذاكرة أحد الوالدين أو الأقارب، وهي مفيدة لكنها كثيرًا ما تُقرَّب إلى أقرب ساعة.

وإن كنت تعرف وقتًا تقريبيًا فأدخل أقرب تقدير لديك. فبرجك الشمسي وأعمدة السنة والشهر واليوم لا تتأثر في الغالب، لكن تعامل مع الطالع وعمود الساعة على أنهما تقديريان.

## الفرق الذي يصنعه ذلك

بالوقت والمكان الدقيقين نحسب الشمس والقمر والطالع بدقة فلكية، إلى جانب أعمدة السنة والشهر واليوم والساعة. وهذا هو الفرق بين طالع يومي يُكتب لملايين الناس وتقرير يُكتب لشخص واحد.
"""

_BAZI_EN = """\
BaZi (八字) literally means "eight characters". It is a classical Chinese method that writes the moment of your birth as four pillars (year, month, day and hour), each made of two characters. Often called the Four Pillars of Destiny, it is far richer than the year animal most people know, and it forms the Chinese half of every Zodiac Blend report.

## Stems and branches

Each pillar pairs a **Heavenly Stem** above with an **Earthly Branch** below.

- The ten Heavenly Stems carry the five elements (Wood, Fire, Earth, Metal and Water), each in a yang and a yin form. Yang Wood is often pictured as a tall tree, Yin Wood as a flexible vine.
- The twelve Earthly Branches are associated with the twelve animals, from the Rat to the Pig.

Stems and branches combine in a repeating cycle of sixty, which the traditional calendar uses to count years, months, days and hours. A pillar written 庚午, for example, reads Geng Wu: Yang Metal above the Horse.

## The four pillars

**The year pillar** gives you your year animal. In BaZi it is linked with your roots, your family background and the social self that people recognise first. The BaZi year changes neither on 1 January nor at Chinese New Year, but at Lichun, the "Start of Spring", around 4 February.

**The month pillar** follows the solar seasons, which makes it highly influential: it shows the climate your Day Master was born into and whether its element was in season. It is often associated with upbringing and your inner world.

**The day pillar** is the heart of the chart. Its stem is your Day Master, and its branch is traditionally called the Spouse Palace, linked with close partnership.

**The hour pillar** depends on the two-hour period of your birth. It is associated with aspirations and the later chapters of life, and it adds fine detail that distinguishes people born on the same day.

## The Day Master: you at the centre

Classical BaZi reads every other character in relation to the Day Master. If your Day Master is Yin Wood, for instance, Water nourishes you, Fire expresses you, Earth is what you cultivate and manage, and Metal shapes and challenges you. These relationships, known as the productive and controlling cycles of the five elements, are what turn eight characters into a portrait of personality.

## Balance rather than fate

A BaZi chart is best understood as a map of balance. Some elements may be plentiful, others faint or missing altogether. Thoughtful practitioners do not treat this as good or bad luck; they see a natural temperament, with strengths to lean on and areas that ask for balance. That is the spirit in which we use it: as a mirror for self-understanding rather than a script for your life.

## BaZi and Western astrology together

The Four Pillars describe your energy through time and the elements; Western astrology describes your psychology through the Sun, the Moon and the Ascendant. In a Zodiac Blend report your Day Master sits beside your Sun sign, your month pillar beside your Moon and your hour pillar beside your Ascendant, so that each tradition can confirm, deepen or gently challenge the other.

To calculate your pillars precisely, we need your date, exact time and place of birth: the year and month pillars change at exact solar-term moments, while the day and hour pillars follow the local clock where you were born.
"""

_BAZI_AR = """\
تعني «با تسي» (八字) حرفيًا «الأحرف الثمانية»، وهي طريقة صينية كلاسيكية تكتب لحظة ولادتك في أربعة أعمدة: السنة والشهر واليوم والساعة، يتألف كلٌّ منها من حرفين. وتُسمّى غالبًا «أعمدة القدر الأربعة»، وهي أغنى بكثير من حيوان السنة الذي يعرفه معظم الناس، وتشكّل النصف الصيني من كل تقرير في Zodiac Blend.

## الجذوع والفروع

يجمع كل عمود بين **جذع سماوي** في الأعلى و**فرع أرضي** في الأسفل.

- تحمل الجذوع السماوية العشرة العناصر الخمسة: الخشب والنار والأرض والمعدن والماء، لكلٍّ منها صورة يانغ وصورة ين. فكثيرًا ما يُصوَّر خشب اليانغ شجرةً باسقة، وخشب الين كرمةً مرنة.
- وترتبط الفروع الأرضية الاثنا عشر بالحيوانات الاثني عشر، من الفأر إلى الخنزير.

وتتعاقب الجذوع والفروع في دورة من ستين تركيبًا يستخدمها التقويم التقليدي لعدّ السنوات والشهور والأيام والساعات. فالعمود المكتوب 庚午 مثلًا يُقرأ «غنغ وو»: معدن اليانغ فوق الحصان.

## الأعمدة الأربعة

**عمود السنة** يمنحك حيوان سنتك، ويرتبط في با تسي بجذورك وخلفيتك العائلية وبالصورة الاجتماعية التي يعرفك بها الناس أولًا. ولا تتغير سنة با تسي في الأول من يناير ولا مع رأس السنة الصينية، بل عند «ليتشون» أي «بداية الربيع» نحو الرابع من فبراير.

**عمود الشهر** يتبع الفصول الشمسية، ولذلك فهو بالغ التأثير؛ إذ يكشف المناخ الذي وُلد فيه سيّد يومك، وهل كان عنصره في موسمه أم لا. ويرتبط غالبًا بالنشأة وبعالمك الداخلي.

**عمود اليوم** هو قلب الخريطة؛ فجذعه هو «سيّد اليوم»، وفرعه يُسمّى تقليديًا «قصر الشريك» ويرتبط بالشراكة الوثيقة.

**عمود الساعة** يعتمد على الفترة ذات الساعتين التي وُلدت فيها، ويرتبط بالطموحات وبالمراحل اللاحقة من الحياة، ويضيف تفاصيل دقيقة تميّز بين من وُلدوا في اليوم نفسه.

## سيّد اليوم: أنت في المركز

تقرأ با تسي الكلاسيكية كل حرف آخر في علاقته بسيّد اليوم. فإن كان سيّد يومك خشب الين مثلًا، فالماء يغذّيك، والنار تعبّر عنك، والأرض هي ما تزرعه وتديره، والمعدن يصقلك ويتحداك. وهذه العلاقات، المعروفة بدورتي التوليد والسيطرة بين العناصر الخمسة، هي ما يحوّل الأحرف الثمانية إلى صورة للشخصية.

## التوازن لا القدر

أفضل ما تُفهم به خريطة با تسي أنها خريطة للتوازن؛ فبعض العناصر قد يكون وفيرًا، وبعضها خافتًا أو غائبًا تمامًا. ولا يرى الممارسون المتبصّرون في ذلك حظًا حسنًا أو سيئًا، بل طبعًا فطريًا له نقاط قوة يُستند إليها وجوانب تحتاج إلى توازن. وبهذه الروح نستخدمها: مرآةً لفهم الذات لا نصًّا مكتوبًا لحياتك.

## با تسي والتنجيم الغربي معًا

تصف الأعمدة الأربعة طاقتك عبر الزمن والعناصر، ويصف التنجيم الغربي نفسيتك عبر الشمس والقمر والطالع. وفي تقرير Zodiac Blend يقف سيّد يومك إلى جانب برجك الشمسي، وعمود الشهر إلى جانب قمرك، وعمود الساعة إلى جانب طالعك، ليؤكد كل تقليد الآخر أو يعمّقه أو يتحداه بلطف.

ولحساب أعمدتك بدقة نحتاج إلى تاريخ ولادتك ووقتها الدقيق ومكانها؛ فعمودا السنة والشهر يتغيران في لحظات دقيقة من الفصول الشمسية، بينما يتبع عمودا اليوم والساعة التوقيت المحلي في مكان ولادتك.
"""

BLOG_POSTS: Final[tuple[BlogPostSeed, ...]] = (
    BlogPostSeed(
        slug="western-and-chinese-astrology-two-lenses",
        published_days_ago=0,
        translations={
            "en": PostTranslation(
                title="Western and Chinese Astrology: Two Lenses on One Life",
                excerpt="One tradition reads the sky at the moment you were born; the other reads the rhythm of time. Here is what each one sees, and why they are richer together.",
                body=_TWO_LENSES_EN,
                seo_title="Western vs Chinese Astrology: Two Lenses on One Life",
                seo_description="How Western astrology and the Chinese zodiac describe you, where they agree, where they differ, and why reading them together reveals more.",
            ),
            "ar": PostTranslation(
                title="التنجيم الغربي والأبراج الصينية: عدستان على حياة واحدة",
                excerpt="تقليد يقرأ السماء لحظة ولادتك، وآخر يقرأ إيقاع الزمن. إليك ما يراه كلٌّ منهما، ولماذا يصبحان أغنى معًا.",
                body=_TWO_LENSES_AR,
                seo_title="التنجيم الغربي والأبراج الصينية: عدستان على حياة واحدة",
                seo_description="كيف يصفك التنجيم الغربي والأبراج الصينية، وأين يتفقان وأين يختلفان، ولماذا تكشف قراءتهما معًا ما هو أعمق.",
            ),
        },
    ),
    BlogPostSeed(
        slug="why-your-birth-time-and-city-matter",
        published_days_ago=1,
        translations={
            "en": PostTranslation(
                title="Why Your Birth Time and City Matter",
                excerpt="Your birth date gives you a sun sign and a year animal. Your exact time and city unlock the rest of your chart. Here is why.",
                body=_BIRTH_TIME_EN,
                seo_title="Why Your Birth Time and City Matter in Astrology",
                seo_description="Why the Moon, the Ascendant and the Chinese hour pillar depend on your exact birth time and city, and how to find your birth time.",
            ),
            "ar": PostTranslation(
                title="لماذا يهمّ وقت ولادتك ومدينتك؟",
                excerpt="تاريخ ميلادك يمنحك برجك الشمسي وحيوان سنتك، أما الوقت الدقيق والمدينة فيفتحان بقية خريطتك. إليك السبب.",
                body=_BIRTH_TIME_AR,
                seo_title="لماذا يهمّ وقت الولادة ومدينتها في قراءة الأبراج؟",
                seo_description="لماذا يعتمد القمر والطالع وعمود الساعة الصيني على وقت ولادتك ومدينتك بدقة، وكيف تعرف وقت ولادتك.",
            ),
        },
    ),
    BlogPostSeed(
        slug="what-is-a-bazi-chart-four-pillars-explained",
        published_days_ago=2,
        translations={
            "en": PostTranslation(
                title="What Is a BaZi Chart? The Four Pillars Explained",
                excerpt="BaZi turns the moment of your birth into eight characters across four pillars. Here is how to read the year, month, day and hour, and why the Day Master matters most.",
                body=_BAZI_EN,
                seo_title="What Is a BaZi Chart? The Four Pillars Explained",
                seo_description="A clear guide to BaZi, the Chinese Four Pillars: stems and branches, the year, month, day and hour pillars, and the Day Master.",
            ),
            "ar": PostTranslation(
                title="ما خريطة با تسي؟ شرح الأعمدة الأربعة",
                excerpt="تحوّل با تسي لحظة ولادتك إلى ثمانية أحرف في أربعة أعمدة. إليك كيف تقرأ أعمدة السنة والشهر واليوم والساعة، ولماذا يُعدّ سيّد اليوم الأهم بينها.",
                body=_BAZI_AR,
                seo_title="ما خريطة با تسي؟ شرح أعمدة القدر الأربعة",
                seo_description="دليل واضح إلى با تسي، أعمدة القدر الأربعة الصينية: الجذوع والفروع، وأعمدة السنة والشهر واليوم والساعة، وسيّد اليوم.",
            ),
        },
    ),
)
