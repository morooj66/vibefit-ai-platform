---
title: VibeFit AI Platform
emoji: 🏃
colorFrom: green
colorTo: blue
sdk: static
app_build_command: npm run build
app_file: dist/index.html
fullWidth: true
header: mini
short_description: منصة لياقة ذكية — Generative AI، RAG، Agents، Analytics، n8n
---

# VibeFit AI Platform

**VibeFit** منصة لياقة ذكية تحوّل بيانات التقييم والمتابعة الأسبوعية إلى تجربة شخصية متكاملة. تجمع المنصة بين الذكاء الاصطناعي التوليدي، واسترجاع المعرفة (RAG)، والوكلاء الأذكياء، وتحليل بيانات الالتزام، والأتمتة عبر n8n؛ لتقديم توصيات رياضية عامة، وتحليل التقدم، وإرسال رسائل متابعة وتحفيز مخصصة للمستخدم.

طُوّر المشروع كمشروع تطبيقي ضمن **برنامج تدريبي متخصص في Vibe Coding والبرمجة التوليدية**، بهدف تحويل مفاهيم الوكلاء الأذكياء وRAG والأتمتة من تجارب تعليمية إلى منصة ويب متكاملة قابلة للعرض والتطوير.

> **تنبيه:** توصيات المنصة **عامة** وليست تشخيصًا طبيًا أو بديلًا عن المختصين.

---

## About VibeFit

**VibeFit** is an AI-powered fitness platform that transforms assessment and weekly check-in data into a personalized digital experience. It combines generative AI, Retrieval-Augmented Generation (RAG), intelligent agents, adherence analytics, and n8n automation to deliver general fitness recommendations, progress insights, and proactive email engagement.

The platform was developed as an **applied project for a Vibe Coding and Generative Programming training program**, demonstrating how educational AI concepts can be transformed into an end-to-end product.

> **Disclaimer:** Recommendations are general guidance, not medical diagnosis.

---

## لماذا VibeFit؟

- **توصيات ذكية** مبنية على تقييم المستخدم (Generative AI + Edge Functions).
- **مساعد RAG** يسترجع المعلومات من قاعدة معرفة منظمة (PostgreSQL Full-text Search).
- **AI Agent** يختار الأدوات المناسبة حسب السؤال (Intent → Tools → Context → RAG).
- **تحليل الالتزام** والطاقة والصعوبة عبر المتابعات الأسبوعية وRecharts.
- **Proactive Agent** يجهّز رسائل ترحيب وتحفيز وملخصات أسبوعية.
- **أتمتة البريد** باستخدام n8n (استقبال + رسائل دورية).
- **Notebook بايثون** في Google Colab لتوضيح Agent + Tools + RAG.
- **Supabase** — مصادقة، PostgreSQL، RLS، Edge Functions.
- **واجهة عربية RTL** متجاوبة (React + Tailwind).

---

## مكونات الذكاء الاصطناعي

| المكوّن | دوره |
|---------|------|
| **Generative AI** | إنشاء التوصيات والرسائل الشخصية |
| **RAG** | استرجاع معرفة موثوقة قبل توليد الإجابة |
| **AI Agent** | فهم النية واختيار أدوات البيانات والمعرفة |
| **Proactive Agent** | تحديد الرسائل المناسبة وإرسالها في الوقت المناسب |
| **Analytics** | حساب الالتزام والطاقة والصعوبة والاتجاه |
| **n8n Automation** | تنظيم استقبال وإرسال البريد وتشغيل الأحداث |
| **Python Colab** | توضيح منطق Agent وTools وRAG تعليميًا |

---

## الإنجاز والبورتفوليو

يمثل **VibeFit** انتقالًا من نموذج تعليمي للـ AI Agent داخل Google Colab إلى **منتج متكامل** يحتوي على واجهة استخدام، قاعدة بيانات، RAG، تحليلات، وكلاء ذكيين، أتمتة بريدية، ووظائف سحابية — جاهز للعرض في البورتفوليو والتسليم الأكاديمي.

---

## التقنيات

| Frontend | Backend & Data | AI & Automation | Analytics & Demo |
|----------|----------------|-----------------|------------------|
| React | Supabase Auth | OpenAI API | Recharts |
| TypeScript | PostgreSQL | PostgreSQL Full-text RAG | Python |
| Vite | Row Level Security | Supabase Edge Functions | Google Colab |
| Tailwind CSS | Edge Functions | n8n | Pandas |

**ملاحظة:** البحث المعرفي الحالي **Full-text Search** — لا يُستخدم pgvector أو Vector Database.

---

## Architecture

```
React App → Supabase Auth → PostgreSQL + RLS → Edge Functions → OpenAI
```

| Flow | Path |
|------|------|
| Assistant | User → Intent Router → Tools → Context → RAG → Structured Response |
| Email (incoming) | Gmail → n8n → vibefit-agent → Gmail Reply |
| Proactive | DB Event → n8n → vibefit-proactive-agent → Gmail |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

---

## Features

| Area | Capability |
|------|------------|
| Auth | Supabase signup/login with RLS |
| Assessment | Multi-step fitness questionnaire |
| Recommendation | AI plan + **labeled mock fallback** |
| Check-in | Weekly adherence, energy, difficulty |
| Dashboard | KPIs + charts from real data |
| Assistant | RAG + context-aware agent |
| Email | n8n workflows (OAuth setup required) |
| Colab | Educational agent demo (no Gmail send) |

---

## Security

- No Service Role, OpenAI key, or webhook secrets in frontend
- `.env` in `.gitignore` — `.env.example` placeholders only
- Server secrets in Supabase Edge Functions and n8n Variables only

---

## Local Development

```bash
npm install
cp .env.example .env
# VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY only
npm run dev
```

Open `http://localhost:5173`

### Quality checks

```bash
npm run build && npm run lint
npm run validate:agent && npm run test:agent
npm run validate:n8n && npm run test:n8n-email
npm run validate:proactive && npm run test:proactive
```

---

## Deploy

| Platform | Router | Key variables |
|----------|--------|---------------|
| **Vercel** (recommended) | `VITE_ROUTER_MODE=browser` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| Hugging Face Static | `VITE_ROUTER_MODE=hash` | Same + CORS in `ALLOWED_ORIGINS` |

- Vercel: `vercel.json` SPA rewrites included
- HF: see [docs/HUGGINGFACE_DEPLOY.md](docs/HUGGINGFACE_DEPLOY.md)

**n8n workflows are implemented and ready for Gmail OAuth configuration.**

---

## Known Limitations

- Mock recommendation fallback when AI fails (explicitly labeled)
- RAG: full-text search, not semantic vectors
- Gmail live requires manual OAuth in n8n
- WhatsApp not implemented

---

## Documentation

| Doc | Purpose |
|-----|---------|
| [DEMO_GUIDE.md](docs/DEMO_GUIDE.md) | 5-minute demo script |
| [SUBMISSION_SUMMARY.md](docs/SUBMISSION_SUMMARY.md) | One-page submission |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System diagrams |
| [PROACTIVE_EMAIL_AGENT.md](docs/PROACTIVE_EMAIL_AGENT.md) | Lifecycle emails |
| [COLAB_AGENT_DEMO.md](docs/COLAB_AGENT_DEMO.md) | Python notebook guide |
| [N8N_SETUP_CHECKLIST.md](docs/N8N_SETUP_CHECKLIST.md) | n8n manual steps |

---

## Repository

**Name:** `vibefit-ai-platform`

**Suggested GitHub Topics:** `artificial-intelligence` · `generative-ai` · `ai-agents` · `rag` · `vibe-coding` · `fitness` · `supabase` · `n8n` · `react` · `typescript` · `python` · `data-analytics`

---

## License

Academic / portfolio project — see course requirements for usage terms.
