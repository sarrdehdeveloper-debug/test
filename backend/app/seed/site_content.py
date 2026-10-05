"""Seed values for every editable site-content key (``app.content.keys``), in English and Arabic.

``lines`` keys hold one item per line; ``markdown`` keys are Markdown (the public API returns
sanitised HTML for them). Prices are deliberately not mentioned: they are a dashboard setting.
"""

from __future__ import annotations

from typing import Final

COMPANY_NAME: Final = "Zodiac Blend LLC"
COMPANY_ADDRESS: Final = "2106 House Ave, Suite 581, Cheyenne, Wyoming 82001, USA"
COMPANY_PHONE: Final = "+1-307-443-6533"
COMPANY_EMAIL: Final = "info@zodiacblend.com"

_PRIVACY_EN = f"""\
> **Draft for legal review.** This privacy policy is a plain-language draft prepared for {COMPANY_NAME}. It must be reviewed by qualified legal counsel before it is relied upon.

_Last updated: October 2026_

{COMPANY_NAME} ("Zodiac Blend", "we", "us") runs zodiacblend.com. This policy explains what we collect when you request a free reading or order a full report, why we collect it, who helps us process it and how long we keep it. There is no account to create.

## 1. What we collect

- **Email address**: to send your reading or your report link, and to reply when you contact us.
- **Birth date**: for the free reading, to find your Western sun sign and Chinese zodiac animal.
- **Birth time and place (country and city)**: for the full report, to calculate your Moon, Ascendant and Chinese pillars.
- **Language and an optional display name**: to write your report in your language and address you by the name you choose.
- **Order details**: the price, any discount code and the payment status. We never see or store your full card details.
- **Technical data**: basic server logs (such as IP address and browser type) used to keep the service secure and prevent abuse. For free readings we store a pseudonymised (hashed) form of the IP address, not the address itself.

## 2. Why we use it

- To calculate your chart and deliver your free reading or full report.
- To email you your report link and messages about your order.
- To process payments, prevent fraud and abuse, and keep accounting records.
- To answer your questions and requests.
- To send you news and offers, **only if you tick the marketing box**. You can withdraw this consent at any time by writing to us or using the unsubscribe link in our emails.

## 3. How your report is written (AI processing)

The text of the full report is written with the help of **Google Gemini**, an AI service provided by Google. To write it, we send Google your calculated chart (signs, degrees and Chinese pillars), the report language and your display name if you gave one. **We never send your email address**, and we do not send your birth date, time or place. Google processes this information on our behalf as a service provider.

_[Legal review: confirm that the Gemini plan used does not allow Google to use this data to improve its products.]_

Free readings are pre-written, so no AI processing takes place when you request one.

## 4. Payments

Payments are handled by our payment processor (currently Stripe), which receives your payment details directly. Zodiac Blend never receives or stores your card number. We keep only a reference to the payment, the amount and its status.

## 5. Who we share data with

We share personal data only with service providers that help us run Zodiac Blend (hosting, email delivery, payment processing and AI text generation), and only as far as each one needs it. We do not sell your personal data. We may disclose information where the law requires it.

## 6. How long we keep it

- **Birth date, time and place**: deleted 30 days after your request.
- **Your report**: the download link expires 24 hours after the report is ready, and the PDF file is then permanently deleted.
- **Email address and order records**: kept as long as needed for customer support, accounting, tax and legal obligations. _[Legal review: define the retention period.]_
- **Marketing list**: until you unsubscribe.
- **Server logs**: kept for a short period for security purposes.

## 7. Security

The site uses encrypted connections (HTTPS). Reports are stored privately under random file names, download links are secret and time-limited, and we store only hashed versions of access keys. Access to our systems is restricted to authorised staff. Please keep your report link private: anyone who has it can download the report until it expires.

## 8. Cookies and local storage

We use only essential cookies and browser storage needed to run the site, such as remembering your language and keeping the private key that lets you return to your order page. We do not use advertising or tracking cookies. If this ever changes, we will update this policy and ask for your consent where required.

## 9. Your rights

Depending on where you live (for example in the European Union, the United Kingdom or California), you may have the right to access, correct or delete your personal data, to restrict or object to its processing, to receive a copy of it, and to withdraw consent at any time. To make a request, email **{COMPANY_EMAIL}**. We may need to confirm that you control the email address concerned, and we aim to reply within 30 days. You may also complain to your local data protection authority.

## 10. Other people's details and children

If you enter someone else's birth details, for example to order a report as a gift, please make sure they are happy for you to do so. Zodiac Blend is not directed at children under 16, and we do not knowingly collect their email addresses.

## 11. International transfers

We are based in the United States, and our service providers may process data in the United States and other countries. _[Legal review: describe the safeguards used for visitors from the EU and the UK.]_

## 12. Changes to this policy

We may update this policy as the service evolves. The date at the top shows when it last changed, and we will highlight significant changes on the site.

## 13. Contact

{COMPANY_NAME}\\
{COMPANY_ADDRESS}\\
Email: {COMPANY_EMAIL}\\
Phone: {COMPANY_PHONE}
"""

_TERMS_EN = f"""\
> **Draft for legal review.** These terms are a plain-language draft prepared for {COMPANY_NAME}. They must be reviewed by qualified legal counsel before they are relied upon.

_Last updated: October 2026_

These terms govern your use of zodiacblend.com and the readings and reports offered by {COMPANY_NAME} ("Zodiac Blend", "we", "us"). By using the site or placing an order, you agree to them.

## 1. What we offer

- **Free reading**: from your birth date, we show your Western sun sign and Chinese zodiac animal with a pre-written reading for each.
- **Full report**: from your birth date, exact time and place, we calculate your Sun, Moon and Ascendant and your Chinese year, month, day and hour pillars, then create a personal six-part PDF report.

No account is required.

## 2. For reflection and entertainment

Astrology and the Chinese zodiac are traditional symbolic systems, not sciences. Our readings and reports are offered for self-reflection and entertainment. They do not predict the future and are not a substitute for professional medical, psychological, legal, financial or other advice. Any decision you make remains your own.

## 3. Your information

You confirm that the details you enter are accurate and that you are entitled to share them, including when you enter someone else's details. The accuracy of a report depends on the birth time and place you provide. We follow documented calculation conventions, such as the tropical zodiac and the solar-term calendar (Lichun) for the Chinese year, which other sources may not use.

## 4. How reports are written

The personal text of each full report is generated with the help of artificial intelligence (Google Gemini) from your calculated chart, then assembled into a designed PDF. We craft our instructions with care, but generated text may occasionally contain imperfections. If something in your report looks wrong, please contact us.

## 5. Prices and payment

Prices are shown before you pay, in US dollars unless stated otherwise. _[Legal review: taxes and VAT.]_ Payment is processed securely by our payment processor, and we never store your card details. Your order is confirmed only once the payment has been verified.

Discount codes are limited to one per order, apply only within their stated dates and conditions, have no cash value and may be withdrawn at any time.

## 6. Delivery and access

Once your payment is confirmed, your report is usually ready within a few minutes. You can download it from your order page, and we also email you a private link. **The link stays active for 24 hours from the moment the report is ready; after that the file is permanently deleted.** Please download and keep your own copy.

Keep your links private: anyone who has them can download your report until they expire. If your report cannot be generated, we will retry automatically and contact you if the problem persists.

## 7. Refunds

_[Placeholder: refund policy to be confirmed by {COMPANY_NAME} and legal counsel.]_ Each report is personalised digital content delivered immediately. If your report is not delivered because of a technical problem on our side and we cannot fix it promptly, we will refund you in full. Please contact us within 14 days of your order. Nothing in these terms limits any rights you have under consumer protection law.

## 8. Acceptable use

You agree not to misuse the site, for example by scraping it automatically, trying to access other people's orders or reports, interfering with its security or operation, or paying with a payment method you are not authorised to use.

## 9. Intellectual property

The site's content, design, brand and the Galaxy Library belong to {COMPANY_NAME} or its licensors. Your report is for your personal, non-commercial use; you are welcome to share it with friends and family, but not to resell it.

## 10. Liability

The service is provided "as is". To the extent permitted by law, our total liability for any order is limited to the amount you paid for it, and we are not liable for indirect or consequential losses. Nothing in these terms excludes liability that cannot be excluded by law.

## 11. Changes to these terms

We may update these terms as the service evolves. The version published when you place an order applies to that order.

## 12. Governing law

These terms are governed by the laws of the State of Wyoming, USA. _[Legal review: consumer protections for customers in other countries.]_

## 13. Contact

{COMPANY_NAME}, {COMPANY_ADDRESS}\\
Email: {COMPANY_EMAIL}, phone: {COMPANY_PHONE}
"""

_CONTACT_EN = f"""\
We would love to hear from you, whether you have a question about your reading, need help with an order or simply want to share how your report resonated.

- **Email:** [{COMPANY_EMAIL}](mailto:{COMPANY_EMAIL})
- **Phone:** {COMPANY_PHONE}
- **Address:** {COMPANY_NAME}, {COMPANY_ADDRESS}

For questions about an order, please write from the email address you used and include your order number. **Never send us your download link**: we will never ask for it.
"""

_PRIVACY_AR = f"""\
> **مسودة بانتظار المراجعة القانونية.** سياسة الخصوصية هذه مسودة بلغة مبسطة أُعدّت لصالح شركة {COMPANY_NAME}، ويجب أن يراجعها مستشار قانوني مختص قبل الاعتماد عليها.

_آخر تحديث: أكتوبر 2026_

تدير شركة {COMPANY_NAME} (ويُشار إليها بـ«Zodiac Blend» أو «نحن») موقع zodiacblend.com. توضح هذه السياسة البيانات التي نجمعها عندما تطلب قراءة مجانية أو تقريرًا كاملًا، وسبب جمعها، ومن يساعدنا في معالجتها، ومدة احتفاظنا بها. لا حاجة إلى إنشاء حساب.

## 1. البيانات التي نجمعها

- **البريد الإلكتروني**: لإرسال قراءتك أو رابط تقريرك، وللرد عليك عند تواصلك معنا.
- **تاريخ الميلاد**: للقراءة المجانية، لتحديد برجك الشمسي الغربي وحيوانك في الأبراج الصينية.
- **وقت الميلاد ومكانه (الدولة والمدينة)**: للتقرير الكامل، لحساب موقع القمر والطالع والأعمدة الصينية.
- **اللغة واسم عرض اختياري**: لكتابة تقريرك بلغتك ومخاطبتك بالاسم الذي تختاره.
- **تفاصيل الطلب**: السعر وأي رمز خصم وحالة الدفع. لا نطّلع على بيانات بطاقتك كاملة ولا نخزنها أبدًا.
- **بيانات تقنية**: سجلات خادم أساسية (مثل عنوان IP ونوع المتصفح) نستخدمها لحماية الخدمة ومنع إساءة استخدامها. وفي القراءات المجانية نخزن صيغة مُعمّاة (مُجزّأة) من عنوان IP بدلًا من العنوان نفسه.

## 2. أغراض الاستخدام

- حساب خريطتك وتقديم قراءتك المجانية أو تقريرك الكامل.
- إرسال رابط تقريرك ورسائل تتعلق بطلبك إلى بريدك الإلكتروني.
- معالجة المدفوعات ومنع الاحتيال وإساءة الاستخدام والاحتفاظ بالسجلات المحاسبية.
- الإجابة عن أسئلتك وطلباتك.
- إرسال الأخبار والعروض، **فقط إذا اخترت ذلك بوضع علامة في خانة التسويق**. ويمكنك سحب موافقتك في أي وقت بمراسلتنا أو باستخدام رابط إلغاء الاشتراك في رسائلنا.

## 3. كيف يُكتب تقريرك (المعالجة بالذكاء الاصطناعي)

يُكتب نص التقرير الكامل بمساعدة **Google Gemini**، وهي خدمة ذكاء اصطناعي تقدمها Google. ولكتابته نرسل إلى Google خريطتك المحسوبة (الأبراج والدرجات والأعمدة الصينية) ولغة التقرير واسم العرض إن أدخلته. **لا نرسل بريدك الإلكتروني أبدًا**، ولا نرسل تاريخ ميلادك أو وقته أو مكانه. وتعالج Google هذه المعلومات نيابةً عنا بصفتها مزوّد خدمة.

_[للمراجعة القانونية: التأكد من أن خطة Gemini المستخدمة لا تسمح لـ Google باستخدام هذه البيانات لتحسين منتجاتها.]_

أما القراءات المجانية فهي مكتوبة مسبقًا، فلا تجري أي معالجة بالذكاء الاصطناعي عند طلبها.

## 4. المدفوعات

يتولى معالج الدفع لدينا (حاليًا Stripe) عمليات الدفع ويتلقى بيانات الدفع منك مباشرة. لا تتلقى Zodiac Blend رقم بطاقتك ولا تخزنه أبدًا، ونحتفظ فقط بمرجع الدفعة ومبلغها وحالتها.

## 5. مع من نشارك البيانات

لا نشارك البيانات الشخصية إلا مع مزوّدي الخدمات الذين يساعدوننا في تشغيل Zodiac Blend (الاستضافة، وإرسال البريد الإلكتروني، ومعالجة المدفوعات، وتوليد النصوص بالذكاء الاصطناعي)، وفي حدود ما يحتاجه كل منهم فقط. لا نبيع بياناتك الشخصية، وقد نفصح عن معلومات حين يُلزمنا القانون بذلك.

## 6. مدة الاحتفاظ بالبيانات

- **تاريخ الميلاد ووقته ومكانه**: تُحذف بعد 30 يومًا من طلبك.
- **تقريرك**: تنتهي صلاحية رابط التنزيل بعد 24 ساعة من جاهزية التقرير، ثم يُحذف ملف PDF نهائيًا.
- **البريد الإلكتروني وسجلات الطلبات**: نحتفظ بها المدة اللازمة لخدمة العملاء والمحاسبة والضرائب والالتزامات القانونية. _[للمراجعة القانونية: تحديد مدة الاحتفاظ.]_
- **القائمة التسويقية**: إلى أن تلغي اشتراكك.
- **سجلات الخادم**: نحتفظ بها مدة قصيرة لأغراض أمنية.

## 7. الأمان

يستخدم الموقع اتصالات مشفرة (HTTPS). وتُخزَّن التقارير بشكل خاص بأسماء ملفات عشوائية، وروابط التنزيل سرية ومحدودة المدة، ولا نخزن مفاتيح الوصول إلا بصيغة مُجزّأة. ويقتصر الوصول إلى أنظمتنا على الموظفين المخوَّلين. يُرجى الحفاظ على سرية رابط تقريرك، فكل من يملكه يستطيع تنزيل التقرير إلى أن تنتهي صلاحيته.

## 8. ملفات تعريف الارتباط والتخزين المحلي

نستخدم فقط ملفات تعريف الارتباط ووسائل تخزين المتصفح الضرورية لتشغيل الموقع، مثل تذكّر لغتك وحفظ المفتاح الخاص الذي يتيح لك العودة إلى صفحة طلبك. لا نستخدم ملفات تعريف الارتباط الإعلانية أو ملفات التتبع، وإذا تغيّر ذلك يومًا فسنحدّث هذه السياسة ونطلب موافقتك حيث يلزم.

## 9. حقوقك

بحسب مكان إقامتك (مثل الاتحاد الأوروبي أو المملكة المتحدة أو ولاية كاليفورنيا)، قد يحق لك الوصول إلى بياناتك الشخصية أو تصحيحها أو حذفها، وتقييد معالجتها أو الاعتراض عليها، والحصول على نسخة منها، وسحب موافقتك في أي وقت. لتقديم طلب راسلنا على **{COMPANY_EMAIL}**. قد نحتاج إلى التحقق من أنك صاحب البريد الإلكتروني المعني، ونسعى للرد خلال 30 يومًا. كما يحق لك تقديم شكوى إلى سلطة حماية البيانات المحلية.

## 10. بيانات الآخرين والأطفال

إذا أدخلت بيانات ميلاد شخص آخر، كأن تطلب تقريرًا هديةً له، فيُرجى التأكد من موافقته على ذلك. Zodiac Blend غير موجّه إلى الأطفال دون 16 عامًا، ولا نجمع عن علم عناوين بريدهم الإلكتروني.

## 11. نقل البيانات دوليًا

مقرّنا في الولايات المتحدة، وقد يعالج مزوّدو خدماتنا البيانات في الولايات المتحدة ودول أخرى. _[للمراجعة القانونية: بيان الضمانات المعتمدة لزوار الاتحاد الأوروبي والمملكة المتحدة.]_

## 12. التغييرات على هذه السياسة

قد نحدّث هذه السياسة مع تطور الخدمة. ويوضح التاريخ في أعلاها موعد آخر تعديل، وسننبّه إلى التغييرات الجوهرية على الموقع.

## 13. التواصل

{COMPANY_NAME}\\
{COMPANY_ADDRESS}\\
البريد الإلكتروني: {COMPANY_EMAIL}\\
الهاتف: {COMPANY_PHONE}
"""

_TERMS_AR = f"""\
> **مسودة بانتظار المراجعة القانونية.** هذه الشروط مسودة بلغة مبسطة أُعدّت لصالح شركة {COMPANY_NAME}، ويجب أن يراجعها مستشار قانوني مختص قبل الاعتماد عليها.

_آخر تحديث: أكتوبر 2026_

تنظّم هذه الشروط استخدامك لموقع zodiacblend.com والقراءات والتقارير التي تقدمها شركة {COMPANY_NAME} (ويُشار إليها بـ«Zodiac Blend» أو «نحن»). وباستخدامك الموقع أو تقديمك طلبًا فإنك توافق عليها.

## 1. ما نقدمه

- **القراءة المجانية**: من تاريخ ميلادك نعرض برجك الشمسي الغربي وحيوانك في الأبراج الصينية، مع قراءة مكتوبة مسبقًا لكلٍّ منهما.
- **التقرير الكامل**: من تاريخ ميلادك ووقته الدقيق ومكانه نحسب موقع الشمس والقمر والطالع وأعمدة السنة والشهر واليوم والساعة الصينية، ثم نُعدّ تقريرًا شخصيًا بصيغة PDF من ستة أقسام.

لا حاجة إلى إنشاء حساب.

## 2. للتأمل والترفيه

التنجيم الغربي والأبراج الصينية منظومتان رمزيتان تقليديتان، وليستا علمًا. وتُقدَّم قراءاتنا وتقاريرنا للتأمل الذاتي والترفيه، فهي لا تتنبأ بالمستقبل ولا تغني عن الاستشارة المتخصصة الطبية أو النفسية أو القانونية أو المالية أو غيرها. وتبقى قراراتك مسؤوليتك وحدك.

## 3. بياناتك

تؤكد أن البيانات التي تدخلها صحيحة وأنه يحق لك مشاركتها، بما في ذلك عند إدخال بيانات شخص آخر. وتعتمد دقة التقرير على وقت الميلاد ومكانه كما تقدّمهما. ونتبع معايير حساب موثقة، مثل دائرة البروج المدارية للتنجيم الغربي وتقويم الفصول الشمسية («ليتشون») لبداية السنة الصينية، وقد لا تعتمدها مصادر أخرى.

## 4. كيف تُكتب التقارير

يُولَّد النص الشخصي لكل تقرير كامل بمساعدة الذكاء الاصطناعي (Google Gemini) انطلاقًا من خريطتك المحسوبة، ثم يُجمع في ملف PDF مصمم. ونصوغ تعليماتنا بعناية، لكن النص المولَّد قد يتضمن أحيانًا بعض الهفوات، فإن لاحظت في تقريرك ما يبدو خاطئًا فتواصل معنا.

## 5. الأسعار والدفع

تُعرض الأسعار قبل الدفع بالدولار الأمريكي ما لم يُذكر غير ذلك. _[للمراجعة القانونية: الضرائب وضريبة القيمة المضافة.]_ ويتولى معالج الدفع لدينا معالجة الدفعات بأمان، ولا نخزن بيانات بطاقتك أبدًا. ولا يُؤكَّد طلبك إلا بعد التحقق من الدفع.

يُقبل رمز خصم واحد فقط لكل طلب، ويسري ضمن تواريخه وشروطه المعلنة، وليست له قيمة نقدية، ويجوز سحبه في أي وقت.

## 6. التسليم والوصول

بعد تأكيد الدفع يكون تقريرك جاهزًا عادةً خلال دقائق، ويمكنك تنزيله من صفحة طلبك، كما نرسل إليك رابطًا خاصًا عبر البريد الإلكتروني. **يبقى الرابط فعّالًا لمدة 24 ساعة من لحظة جاهزية التقرير، ثم يُحذف الملف نهائيًا**، لذا يُرجى تنزيل نسختك والاحتفاظ بها.

حافظ على سرية روابطك، فكل من يملكها يستطيع تنزيل تقريرك إلى أن تنتهي صلاحيتها. وإذا تعذّر إنشاء تقريرك فسنعيد المحاولة تلقائيًا ونتواصل معك إن استمرت المشكلة.

## 7. الاسترداد

_[نص مؤقت: تُحدّد سياسة الاسترداد من قِبل {COMPANY_NAME} ومستشارها القانوني.]_ كل تقرير محتوى رقمي مخصص لك يُسلَّم فورًا. وإذا لم يصلك تقريرك بسبب مشكلة تقنية من جهتنا ولم نتمكن من حلها سريعًا، فسنرد إليك المبلغ كاملًا. يُرجى التواصل معنا خلال 14 يومًا من تاريخ طلبك. ولا يحدّ أي شيء في هذه الشروط من حقوقك بموجب قوانين حماية المستهلك.

## 8. الاستخدام المقبول

توافق على عدم إساءة استخدام الموقع، ومن ذلك جمع محتواه آليًا، أو محاولة الوصول إلى طلبات الآخرين أو تقاريرهم، أو التدخل في أمانه أو تشغيله، أو الدفع بوسيلة دفع لا يحق لك استخدامها.

## 9. الملكية الفكرية

محتوى الموقع وتصميمه وعلامته التجارية ومكتبة المجرّة (Galaxy Library) ملك لشركة {COMPANY_NAME} أو للجهات المرخِّصة لها. وتقريرك مخصص لاستخدامك الشخصي غير التجاري، ويمكنك مشاركته مع أصدقائك وعائلتك، لكن لا يجوز لك إعادة بيعه.

## 10. حدود المسؤولية

تُقدَّم الخدمة «كما هي». وفي الحدود التي يسمح بها القانون، تقتصر مسؤوليتنا الإجمالية عن أي طلب على المبلغ الذي دفعته مقابله، ولا نتحمل المسؤولية عن الخسائر غير المباشرة أو التبعية. ولا يستثني أي شيء في هذه الشروط مسؤوليةً لا يجوز استثناؤها قانونًا.

## 11. التغييرات على هذه الشروط

قد نحدّث هذه الشروط مع تطور الخدمة، وتسري على كل طلب النسخة المنشورة وقت تقديمه.

## 12. القانون الحاكم

تخضع هذه الشروط لقوانين ولاية وايومنغ في الولايات المتحدة الأمريكية. _[للمراجعة القانونية: حماية المستهلكين في الدول الأخرى.]_

## 13. التواصل

{COMPANY_NAME}، {COMPANY_ADDRESS}\\
البريد الإلكتروني: {COMPANY_EMAIL}، الهاتف: {COMPANY_PHONE}
"""

_CONTACT_AR = f"""\
يسعدنا أن نسمع منك، سواء كان لديك سؤال عن قراءتك، أو تحتاج إلى مساعدة في طلب، أو تودّ أن تشاركنا أثر تقريرك فيك.

- **البريد الإلكتروني:** [{COMPANY_EMAIL}](mailto:{COMPANY_EMAIL})
- **الهاتف:** {COMPANY_PHONE}
- **العنوان:** {COMPANY_NAME}، {COMPANY_ADDRESS}

للاستفسار عن طلب، يُرجى مراسلتنا من البريد الإلكتروني الذي استخدمته مع ذكر رقم طلبك. **لا ترسل إلينا رابط التنزيل أبدًا**، فنحن لن نطلبه منك.
"""

EN: Final[dict[str, str]] = {
    # Home — hero
    "home.hero.eyebrow": "Western astrology × Chinese zodiac",
    "home.hero.title": "Two Traditions. One Truth.",
    "home.hero.subtitle": "Your sun sign and your Chinese animal have been describing the same person all along. Zodiac Blend reads them together and shows you the whole picture.",
    "home.hero.cta_free": "Get my free reading",
    "home.hero.cta_paid": "Get my full report",
    # Home — the two traditions
    "home.traditions.title": "Two ancient ways of reading one life",
    "home.traditions.western.title": "Western astrology",
    "home.traditions.western.body": "Born in Babylon and refined by Greek and Arab astronomers, Western astrology reads the sky at the moment you were born: your Sun shows your core drive, your Moon your inner life and your Ascendant the way you meet the world.",
    "home.traditions.chinese.title": "The Chinese zodiac & BaZi",
    "home.traditions.chinese.body": "Rooted in more than two thousand years of Chinese calendar wisdom, the Chinese zodiac links each year to one of twelve animals and five elements. BaZi, the Four Pillars, goes further and reads your year, month, day and hour of birth as a portrait of your nature.",
    "home.traditions.blend.title": "The Zodiac Blend",
    "home.traditions.blend.body": "We calculate both charts precisely and read them side by side. Where they agree, the message is strong; where they differ, you discover nuances that neither tradition reveals alone.",
    # Home — how it works
    "home.how.title": "How it works",
    "home.how.step1.title": "Share your birth details",
    "home.how.step1.body": "Your birth date is all the free reading needs. For the full report, add the exact time and place of your birth. No account required.",
    "home.how.step2.title": "We calculate both charts",
    "home.how.step2.body": "Our engine computes your Sun, Moon and Ascendant with astronomical precision, alongside your Chinese year, month, day and hour pillars.",
    "home.how.step3.title": "Receive your reading",
    "home.how.step3.body": "See your free reading instantly, or download your personal six-part PDF report within minutes. We email you the link too.",
    # Home — plans
    "home.plans.title": "Choose your reading",
    "home.plans.free.title": "Free Reading",
    "home.plans.free.body": "Your Western sun sign and Chinese year animal, with a reading for each. Instant, and all it takes is your birth date.",
    "home.plans.free.features": "\n".join(
        (
            "Your Western sun sign",
            "Your Chinese zodiac animal and its element",
            "A ready-written reading for each",
            "Instant results: no account, no payment",
        )
    ),
    "home.plans.paid.title": "Full Blended Report",
    "home.plans.paid.body": "A personal six-part report built from your exact birth time and place, blending your Western chart with your four Chinese pillars.",
    "home.plans.paid.features": "\n".join(
        (
            "Sun, Moon and Ascendant from your exact birth moment",
            "Your BaZi year, month, day and hour pillars",
            "Six in-depth sections written for your chart alone",
            "A beautifully designed PDF, ready to download in minutes",
            "A private link emailed to you, active for 24 hours",
            "Available in English and Arabic",
        )
    ),
    # Home — library, blog, FAQ, final CTA
    "home.library.title": "The Galaxy Library",
    "home.library.body": "Our book series, where Western signs and Chinese animals meet in stories, guides and illustrated journeys. Begin with Volume One.",
    "home.blog.title": "From the journal",
    "home.blog.body": "Clear, thoughtful articles on both traditions: how charts are calculated, what the symbols mean and how to use them for reflection.",
    "home.faq.title": "Questions, answered",
    "home.faq.q1": "How exact does my birth time need to be?",
    "home.faq.a1": "As exact as you can make it. Your Ascendant changes sign roughly every two hours, the Moon moves about half a degree an hour, and the Chinese hour pillar changes every two hours. Your birth certificate or hospital record is the best source. If you only know an approximate time, enter your best estimate: your sun sign and your year, month and day pillars will usually stay the same, but your Ascendant and hour pillar may differ.",
    "home.faq.q2": "Why do you need my city of birth?",
    "home.faq.a2": "Your Ascendant depends on where on Earth you were born, so we use your city's latitude and longitude. Your city also tells us its time zone and its historical daylight-saving rules, which we need to convert your local birth time into the exact astronomical moment.",
    "home.faq.q3": "Why might my Chinese animal differ from other websites?",
    "home.faq.a3": "The Chinese year does not begin on 1 January. Popular calendars change the animal at Chinese New Year, between late January and mid-February, while BaZi uses Lichun, the 'Start of Spring', around 4 February. We follow the Lichun convention, so if you were born in January or early February your animal may belong to the previous year. We let you know when your birthday falls right on the boundary.",
    "home.faq.q4": "What happens to my personal data?",
    "home.faq.a4": "We use your birth details only to calculate your chart and write your reading. Your report is written with the help of Google's Gemini AI, which receives your calculated chart but never your email address. Birth details are deleted after 30 days, there is no account to create, and we send marketing emails only if you opt in.",
    "home.faq.q5": "How long can I download my report?",
    "home.faq.a5": "Your report is usually ready within a few minutes of payment. You can download it straight away from your order page, and we email you a private link as well. The link stays active for 24 hours, after which the file is permanently deleted, so save the PDF to your device.",
    "home.faq.q6": "Which languages are available?",
    "home.faq.a6": "Zodiac Blend is available in English and Arabic. Your full report is written entirely in the language you choose, from the section titles to the very last line.",
    "home.cta.title": "Meet the whole of you",
    "home.cta.body": "Start with a free reading in seconds, or go deeper with a full report crafted from the exact moment and place you were born.",
    # Free & paid forms
    "free.intro.title": "Your free reading",
    "free.intro.body": "Enter your birth date, email and preferred language to discover your Western sun sign and Chinese zodiac animal, with a reading for each, right away.",
    "reading.intro.title": "Your full blended report",
    "reading.intro.body": "A reading that is truly yours starts with the exact moment and place of your birth. From them we calculate your Sun, Moon and Ascendant and your four Chinese pillars, then craft a personal six-part report you can download as soon as it is ready.",
    "reading.includes": "\n".join(
        (
            "Your Core Nature: your Sun sign meets your year animal",
            "Your Inner World: your Moon sign and month pillar",
            "How You Meet the World: your Ascendant and hour pillar",
            "Love & Relationships: how you connect and what you seek",
            "Work, Purpose & Day Master: your strengths and calling",
            "Your Blended Path: the one truth both traditions share",
        )
    ),
    "reading.privacy_note": "Your birth details are used only to calculate your chart and are deleted after 30 days. Your email address is never shared with the AI that helps write your report.",
    # Offers, library and blog pages
    "offers.intro.title": "Current offers",
    "offers.intro.body": "Special offers on Zodiac Blend reports. Enter the code when you order your full report; each offer shows its own dates and conditions.",
    "library.intro.title": "Galaxy Library",
    "library.intro.body": "The Galaxy Library is the Zodiac Blend book series: stories and guides in which the signs of the Western sky meet the animals of the Chinese calendar. Explore the collection as it grows.",
    "blog.intro.title": "The Zodiac Blend Journal",
    "blog.intro.body": "Articles on Western astrology, the Chinese zodiac and BaZi, written to help you understand your chart and use it for reflection.",
    # Legal & contact
    "legal.disclaimer": "Zodiac Blend readings are offered for self-reflection and entertainment. They are not a substitute for professional medical, psychological, legal or financial advice.",
    "legal.privacy.body": _PRIVACY_EN,
    "legal.terms.body": _TERMS_EN,
    "contact.body": _CONTACT_EN,
    # Company & footer
    "company.name": COMPANY_NAME,
    "company.address": COMPANY_ADDRESS,
    "company.phone": COMPANY_PHONE,
    "company.email": COMPANY_EMAIL,
    "footer.tagline": "Two Traditions. One Truth.",
    # SEO
    "seo.home.title": "Zodiac Blend | Western & Chinese Astrology Readings",
    "seo.home.description": "Discover your sun sign and Chinese zodiac animal for free, or get a personal PDF report blending your Sun, Moon, Ascendant and BaZi pillars.",
}

AR: Final[dict[str, str]] = {
    # Home — hero
    "home.hero.eyebrow": "التنجيم الغربي × الأبراج الصينية",
    "home.hero.title": "تقليدان. حقيقة واحدة.",
    "home.hero.subtitle": "برجك الغربي وحيوانك الصيني يصفان الشخص نفسه منذ البداية. في Zodiac Blend نقرؤهما معًا لنريك الصورة كاملة.",
    "home.hero.cta_free": "احصل على قراءتي المجانية",
    "home.hero.cta_paid": "احصل على تقريري الكامل",
    # Home — the two traditions
    "home.traditions.title": "طريقتان عريقتان لقراءة حياة واحدة",
    "home.traditions.western.title": "التنجيم الغربي",
    "home.traditions.western.body": "نشأ في بابل وتطوّر على أيدي الفلكيين اليونانيين والعرب، ويقرأ السماء لحظة ولادتك: الشمس تكشف دافعك الجوهري، والقمر عالمك الداخلي، والطالع طريقتك في ملاقاة العالم.",
    "home.traditions.chinese.title": "الأبراج الصينية وبا تسي",
    "home.traditions.chinese.body": "تستند الأبراج الصينية إلى أكثر من ألفي عام من حكمة التقويم الصيني، فتربط كل سنة بواحد من اثني عشر حيوانًا وخمسة عناصر. أما «با تسي» أو الأعمدة الأربعة فتذهب أبعد، فتقرأ سنة ولادتك وشهرها ويومها وساعتها صورةً متكاملة لطبيعتك.",
    "home.traditions.blend.title": "مزيج Zodiac Blend",
    "home.traditions.blend.body": "نحسب الخريطتين بدقة ونقرؤهما جنبًا إلى جنب: حيث تتفقان تكون الرسالة أوضح، وحيث تختلفان تكتشف فروقًا دقيقة لا يكشفها أيٌّ من التقليدين وحده.",
    # Home — how it works
    "home.how.title": "كيف يعمل",
    "home.how.step1.title": "شاركنا بيانات ميلادك",
    "home.how.step1.body": "تاريخ ميلادك يكفي للقراءة المجانية، أما التقرير الكامل فيحتاج أيضًا إلى وقت ولادتك الدقيق ومكانها. لا حاجة إلى إنشاء حساب.",
    "home.how.step2.title": "نحسب الخريطتين",
    "home.how.step2.body": "يحسب نظامنا موقع الشمس والقمر والطالع بدقة فلكية، إلى جانب أعمدة السنة والشهر واليوم والساعة في التقويم الصيني.",
    "home.how.step3.title": "استلم قراءتك",
    "home.how.step3.body": "اطّلع على قراءتك المجانية فورًا، أو نزّل تقريرك الشخصي المكوّن من ستة أقسام بصيغة PDF خلال دقائق، وسنرسل إليك الرابط عبر البريد الإلكتروني أيضًا.",
    # Home — plans
    "home.plans.title": "اختر قراءتك",
    "home.plans.free.title": "القراءة المجانية",
    "home.plans.free.body": "برجك الشمسي الغربي وحيوان سنتك الصيني، مع قراءة لكلٍّ منهما. فورية، ولا تحتاج إلا إلى تاريخ ميلادك.",
    "home.plans.free.features": "\n".join(
        (
            "برجك الشمسي الغربي",
            "حيوانك في الأبراج الصينية وعنصره",
            "قراءة جاهزة لكلٍّ منهما",
            "نتيجة فورية: بلا حساب وبلا دفع",
        )
    ),
    "home.plans.paid.title": "التقرير المدمج الكامل",
    "home.plans.paid.body": "تقرير شخصي من ستة أقسام مبني على وقت ولادتك ومكانها بدقة، يمزج خريطتك الغربية بأعمدتك الصينية الأربعة.",
    "home.plans.paid.features": "\n".join(
        (
            "الشمس والقمر والطالع من لحظة ولادتك الدقيقة",
            "أعمدة با تسي الأربعة: السنة والشهر واليوم والساعة",
            "ستة أقسام معمّقة مكتوبة لخريطتك وحدها",
            "ملف PDF بتصميم أنيق، جاهز للتنزيل خلال دقائق",
            "رابط خاص يصل إلى بريدك، صالح لمدة 24 ساعة",
            "متوفر بالعربية والإنجليزية",
        )
    ),
    # Home — library, blog, FAQ, final CTA
    "home.library.title": "مكتبة المجرّة",
    "home.library.body": "سلسلة كتبنا التي تلتقي فيها الأبراج الغربية بالحيوانات الصينية في حكايات وأدلة ورحلات مصوّرة. ابدأ بالمجلد الأول.",
    "home.blog.title": "من المدوّنة",
    "home.blog.body": "مقالات واضحة ومتأنية عن التقليدين: كيف تُحسب الخرائط، وماذا تعني رموزها، وكيف تستخدمها للتأمل في ذاتك.",
    "home.faq.title": "أسئلة وأجوبة",
    "home.faq.q1": "ما مدى الدقة المطلوبة في وقت ميلادي؟",
    "home.faq.a1": "كلما كان أدق كان أفضل. فالطالع ينتقل من برج إلى آخر كل ساعتين تقريبًا، والقمر يقطع نحو نصف درجة كل ساعة، وعمود الساعة الصيني يتغير كل ساعتين. أفضل مصدر هو شهادة الميلاد أو سجل المستشفى. وإن كنت تعرف الوقت تقريبيًا فأدخل أقرب تقدير لديك؛ فبرجك الشمسي وأعمدة السنة والشهر واليوم تبقى في الغالب كما هي، لكن الطالع وعمود الساعة قد يختلفان.",
    "home.faq.q2": "لماذا تطلبون مدينة الولادة؟",
    "home.faq.a2": "يعتمد الطالع على المكان الذي وُلدت فيه على سطح الأرض، لذلك نستخدم خطَّي العرض والطول لمدينتك. كما تحدد المدينة منطقتك الزمنية وقواعد التوقيت الصيفي التاريخية فيها، وهي ضرورية لتحويل وقت ولادتك المحلي إلى اللحظة الفلكية الدقيقة.",
    "home.faq.q3": "لماذا قد يختلف حيواني الصيني عمّا تذكره مواقع أخرى؟",
    "home.faq.a3": "لا تبدأ السنة الصينية في الأول من يناير. فالتقاويم الشائعة تغيّر الحيوان مع رأس السنة الصينية، بين أواخر يناير ومنتصف فبراير، بينما يعتمد نظام با تسي على «ليتشون» أي «بداية الربيع» نحو الرابع من فبراير، ونحن نتبع هذا المعيار. فإن وُلدت في يناير أو أوائل فبراير فقد ينتمي حيوانك إلى السنة السابقة، وننبّهك إذا وقع يوم ميلادك على الحد الفاصل تمامًا.",
    "home.faq.q4": "ماذا يحدث لبياناتي الشخصية؟",
    "home.faq.a4": "نستخدم بيانات ميلادك فقط لحساب خريطتك وكتابة قراءتك. يُكتب تقريرك بمساعدة نموذج Gemini للذكاء الاصطناعي من Google، الذي يتلقى خريطتك المحسوبة ولا يتلقى بريدك الإلكتروني أبدًا. تُحذف بيانات الميلاد بعد 30 يومًا، ولا حاجة إلى إنشاء حساب، ولا نرسل رسائل تسويقية إلا بموافقتك.",
    "home.faq.q5": "إلى متى يمكنني تنزيل تقريري؟",
    "home.faq.a5": "يكون تقريرك جاهزًا عادةً خلال دقائق من إتمام الدفع، ويمكنك تنزيله فورًا من صفحة طلبك، كما نرسل إليك رابطًا خاصًا عبر البريد الإلكتروني. يبقى الرابط فعّالًا لمدة 24 ساعة ثم يُحذف الملف نهائيًا، لذا احفظ نسخة PDF على جهازك.",
    "home.faq.q6": "ما اللغات المتاحة؟",
    "home.faq.a6": "يتوفر Zodiac Blend بالعربية والإنجليزية، ويُكتب تقريرك الكامل كله باللغة التي تختارها، من عناوين الأقسام حتى آخر سطر.",
    "home.cta.title": "تعرّف إلى ذاتك كاملة",
    "home.cta.body": "ابدأ بقراءة مجانية في ثوانٍ، أو تعمّق أكثر مع تقرير كامل مصوغ من اللحظة والمكان اللذين وُلدت فيهما.",
    # Free & paid forms
    "free.intro.title": "قراءتك المجانية",
    "free.intro.body": "أدخل تاريخ ميلادك وبريدك الإلكتروني ولغتك المفضلة لتكتشف برجك الشمسي الغربي وحيوانك في الأبراج الصينية، مع قراءة لكلٍّ منهما على الفور.",
    "reading.intro.title": "تقريرك المدمج الكامل",
    "reading.intro.body": "القراءة التي تخصك وحدك تبدأ من اللحظة والمكان الدقيقين لولادتك. ومنهما نحسب موقع الشمس والقمر والطالع وأعمدتك الصينية الأربعة، ثم نصوغ تقريرًا شخصيًا من ستة أقسام يمكنك تنزيله فور جاهزيته.",
    "reading.includes": "\n".join(
        (
            "طبيعتك الجوهرية: برجك الشمسي يلتقي حيوان سنتك",
            "عالمك الداخلي: برج القمر وعمود الشهر",
            "كيف تلاقي العالم: الطالع وعمود الساعة",
            "الحب والعلاقات: كيف تتواصل وما الذي تبحث عنه",
            "العمل والغاية وسيّد اليوم: نقاط قوتك ورسالتك",
            "مسارك المدمج: الحقيقة الواحدة التي يتفق عليها التقليدان",
        )
    ),
    "reading.privacy_note": "نستخدم بيانات ميلادك لحساب خريطتك فقط، وتُحذف بعد 30 يومًا. ولا نشارك بريدك الإلكتروني أبدًا مع الذكاء الاصطناعي الذي يساعد في كتابة تقريرك.",
    # Offers, library and blog pages
    "offers.intro.title": "العروض الحالية",
    "offers.intro.body": "عروض خاصة على تقارير Zodiac Blend. أدخل الرمز عند طلب تقريرك الكامل، ولكل عرض تواريخه وشروطه الخاصة.",
    "library.intro.title": "مكتبة المجرّة",
    "library.intro.body": "مكتبة المجرّة (Galaxy Library) هي سلسلة كتب Zodiac Blend: حكايات وأدلة تلتقي فيها أبراج السماء الغربية بحيوانات التقويم الصيني. استكشف المجموعة وهي تنمو.",
    "blog.intro.title": "مدوّنة Zodiac Blend",
    "blog.intro.body": "مقالات عن التنجيم الغربي والأبراج الصينية وبا تسي، كُتبت لتساعدك على فهم خريطتك واستخدامها للتأمل في ذاتك.",
    # Legal & contact
    "legal.disclaimer": "تُقدَّم قراءات Zodiac Blend للتأمل الذاتي والترفيه، ولا تغني عن الاستشارة المتخصصة الطبية أو النفسية أو القانونية أو المالية.",
    "legal.privacy.body": _PRIVACY_AR,
    "legal.terms.body": _TERMS_AR,
    "contact.body": _CONTACT_AR,
    # Company & footer (legal name, postal address and contacts stay in Latin script)
    "company.name": COMPANY_NAME,
    "company.address": COMPANY_ADDRESS,
    "company.phone": COMPANY_PHONE,
    "company.email": COMPANY_EMAIL,
    "footer.tagline": "تقليدان. حقيقة واحدة.",
    # SEO
    "seo.home.title": "Zodiac Blend | قراءات التنجيم الغربي والأبراج الصينية",
    "seo.home.description": "اكتشف برجك الشمسي وحيوانك في الأبراج الصينية مجانًا، أو احصل على تقرير PDF شخصي يمزج الشمس والقمر والطالع بأعمدة با تسي الأربعة.",
}

SITE_CONTENT: Final[dict[str, dict[str, str]]] = {"en": EN, "ar": AR}
