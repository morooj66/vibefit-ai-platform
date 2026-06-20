# دليل عرض Demo — VibeFit (5 دقائق)

## قبل العرض

- Supabase Variables أو `.env` مضبوطة.
- Migrations 005–008 + seed المعرفة منفّذة.
- Edge Functions منشورة: `generate-recommendation`, `vibefit-agent`, `vibefit-proactive-agent`.
- n8n workflows جاهزة للاستيراد (Gmail OAuth اختياري للعرض الحي).

---

## 1. الصفحة الرئيسية (~20 ث)

**المسار:** `/` أو `/#/`

**قل:** «VibeFit منصة عربية للتقييم الرياضي، التوصيات الذكية، والمتابعة الأسبوعية.»

---

## 2. إنشاء حساب / دخول Demo (~30 ث)

**المسار:** `/signup` أو `/login`

**قل:** «المستخدم يسجّل عبر Supabase Auth، والبيانات محمية بـ RLS.»

> **Demo credentials (placeholder):** `demo@vibefit.example` / `DemoPass123!` — أنشئ الحساب مسبقًا.

---

## 3. Assessment (~60 ث)

**المسار:** `/assessment`

**قل:** «نأخذ الهدف والمستوى وأيام التدريب، ثم نحفظ التقييم في PostgreSQL.»

---

## 4. AI Recommendation (~45 ث)

**المسار:** `/dashboard`

**قل:** «Edge Function تستدعي OpenAI وتُرجع خطة أسبوعية؛ إن فشل AI نعرض توصية تجريبية مُعلَمة بوضوح.»

---

## 5. Weekly Check-in (~45 ث)

**المسار:** `/check-in`

**قل:** «المستخدم يسجّل الجلسات والطاقة والصعوبة — هذه بيانات حقيقية وليست Mock.»

---

## 6. Dashboard Analytics (~45 ث)

**المسار:** `/dashboard`

**قل:** «KPIs وRecharts تُحسب من المتابعات الفعلية: الالتزام، الطاقة، والاتجاه.»

---

## 7. Assistant — RAG + Agent (~60 ث)

**المسار:** `/assistant`

**سؤال RAG عام:** «ما أهمية الإحماء؟»

**قل:** «الـAgent يجلب مقاطع من قاعدة المعرفة عبر PostgreSQL Full-text Search — ليس Vector DB.»

**سؤال شخصي:** «كيف كان التزامي هذا الشهر؟»

**قل:** «هنا يدمج Intent Router بيانات المستخدم مع RAG ويُرجع إجابة منظمة.»

---

## 8. Colab Notebook (~45 ث)

**الملف:** `notebooks/VibeFit_AI_Agent_RAG_Colab.ipynb`

**قل:** «Python Agent Demo يوضح selected tools وRAG وpersonalized email — بدون إرسال Gmail.»

---

## 9. n8n (~45 ث)

**Incoming email:** `n8n/vibefit-email-agent.workflow.json`

**قل:** «Gmail → n8n → vibefit-agent → Gmail Reply؛ n8n هو Automation والAgent هو الذكاء.»

**Proactive lifecycle:** `n8n/vibefit-proactive-email-agent.workflow.json`

**قل:** «أحداث قاعدة البيانات → n8n → vibefit-proactive-agent → رسائل ترحيب وتذكير وملخص أسبوعي.»

> n8n workflows are implemented and ready for Gmail OAuth configuration.

---

## 10. Architecture Summary (~30 ث)

**قل:** «React → Supabase Auth → PostgreSQL + RLS → Edge Functions → OpenAI؛ RAG عبر full-text؛ n8n للبريد.»

**راجع:** [ARCHITECTURE.md](ARCHITECTURE.md)

---

## FAQ سريع

| سؤال | جواب |
|------|------|
| أين OpenAI Key؟ | Supabase Edge Function Secrets فقط |
| هل RAG = Vector Search؟ | لا — PostgreSQL full-text (`tsvector`) |
| Mock data؟ | توصية تجريبية fallback فقط، مُعلَمة في UI |
| Gmail live؟ | يحتاج Gmail OAuth في n8n |
