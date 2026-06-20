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
short_description: منصة ذكية للتقييم الرياضي والمتابعة وتحليل الالتزام
---

# VibeFit AI Platform

Arabic-first (RTL) fitness platform: assessment, AI recommendations, weekly check-ins, analytics, RAG assistant, and email automation.

## Project Overview

VibeFit guides users through a structured fitness journey — evaluate fitness level, receive an AI weekly plan, log weekly progress, view KPIs/charts, and ask an intelligent assistant. Email workflows (incoming + proactive lifecycle) are implemented via n8n and Edge Functions.

**Medical disclaimer:** All recommendations are general guidance, not medical diagnosis.

## Features

| Area | Capability |
|------|------------|
| Auth | Supabase signup/login with RLS |
| Assessment | Multi-step fitness questionnaire |
| Recommendation | AI-generated plan + **labeled mock fallback** |
| Check-in | Weekly adherence, energy, difficulty |
| Dashboard | KPIs + Recharts from real data |
| Assistant | Intent router + user context + RAG + structured answers |
| Email (incoming) | Gmail → n8n → `vibefit-agent` → reply |
| Email (proactive) | DB events → n8n → `vibefit-proactive-agent` → lifecycle emails |
| Colab demo | Python agent + tools + RAG preview (no Gmail send) |

## Architecture

```
React App → Supabase Auth → PostgreSQL + RLS → Edge Functions → OpenAI
```

- **Assistant:** User Question → Intent Router → Tool Selection → User Context → RAG → Structured Response
- **Email (incoming):** Gmail → n8n → vibefit-agent → Gmail Reply
- **Proactive:** DB Event / Schedule → n8n → vibefit-proactive-agent → Gmail

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, TypeScript, Vite 7, Tailwind CSS 4, Recharts |
| Backend | Supabase (Auth, PostgreSQL, RLS, Edge Functions) |
| AI | OpenAI via Edge Function Secrets |
| Automation | n8n workflows |
| Demo | Python Colab notebook |

## AI Components

| Component | Function |
|-----------|----------|
| `generate-recommendation` | Weekly plan from assessment |
| `vibefit-agent` | Web chat + incoming email replies |
| `vibefit-proactive-agent` | Proactive lifecycle emails |

## RAG Method

- **PostgreSQL full-text search** (`tsvector` + `search_knowledge_documents` RPC)
- 27 Arabic knowledge chunks in `knowledge_documents`
- **Not** vector embeddings / pgvector / vector database

## Agent Tools

- Intent classification (rules-first)
- User context (profile, assessment, recommendation, check-ins)
- Progress analytics (adherence trends, energy, difficulty)
- RAG retrieval by intent/category
- Safety guard for medical/injection patterns
- Structured JSON output with fallback

## Analytics

- Adherence %, completed vs planned sessions
- Average energy & difficulty
- Trend charts from `weekly_checkins` (real data, not mock)

## n8n Automation

Workflows implemented in `n8n/`:

- `vibefit-email-agent.workflow.json` — incoming Gmail replies
- `vibefit-email-agent-test.workflow.json` — webhook test
- `vibefit-proactive-email-agent.workflow.json` — proactive send pipeline
- `vibefit-weekly-summary.workflow.json` — weekly detection

**n8n workflows are implemented and ready for Gmail OAuth configuration.**

## Python Colab Demo

`notebooks/VibeFit_AI_Agent_RAG_Colab.ipynb` — educational agent orchestrator with tools, RAG, and email JSON preview. Does **not** send Gmail.

See [docs/COLAB_AGENT_DEMO.md](docs/COLAB_AGENT_DEMO.md)

## Security

- No Service Role or OpenAI key in React
- `.env` in `.gitignore`; `.env.example` has placeholders only
- Edge Function Secrets for server keys
- RLS on all user tables
- n8n holds Service Role in Variables only (never in repo)

## Local Run

```bash
npm install
cp .env.example .env
# Set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY only
npm run dev
```

Open `http://localhost:5173`

### Test suite

```bash
npm run build && npm run lint
npm run validate:agent && npm run test:agent
npm run validate:n8n && npm run test:n8n-email
npm run validate:proactive && npm run test:proactive
```

## Hugging Face Deploy

- `sdk: static`, `base: './'`, `VITE_ROUTER_MODE=hash`
- `window.huggingface.variables` supported
- `ConfigSetupPage` shown when Supabase vars missing

See [docs/HUGGINGFACE_DEPLOY.md](docs/HUGGINGFACE_DEPLOY.md)

### Space Variables

| Variable | Example |
|----------|---------|
| `VITE_SUPABASE_URL` | `https://xxxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | publishable anon key |
| `VITE_ROUTER_MODE` | `hash` |

## Demo Credentials (placeholder)

| Field | Value |
|-------|-------|
| Email | `demo@vibefit.example` |
| Password | `DemoPass123!` |

Create this account before the demo presentation.

## Known Limitations

- Mock recommendation fallback when AI fails (explicitly labeled in UI)
- RAG uses full-text search, not semantic vectors
- Gmail live requires manual OAuth in n8n
- Proactive emails require migration 008 + function deploy
- WhatsApp integration not implemented

## Future Improvements

- pgvector / embedding-based RAG
- Predictive adherence ML
- WhatsApp channel (reuse agent webhook)
- Wellness Age composite metric

## Manual Setup (Supabase)

1. Migrations 005–008 + `supabase/seed/knowledge-base.sql`
2. Deploy: `generate-recommendation`, `vibefit-agent`, `vibefit-proactive-agent`
3. Secrets: `OPENAI_API_KEY`, `AGENT_WEBHOOK_SECRET`, `PROACTIVE_AGENT_SECRET`, `VIBEFIT_APP_URL`, `ALLOWED_ORIGINS`

## Documentation

| Doc | Purpose |
|-----|---------|
| [DEMO_GUIDE.md](docs/DEMO_GUIDE.md) | 5-minute presentation script |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System diagrams |
| [SUBMISSION_SUMMARY.md](docs/SUBMISSION_SUMMARY.md) | One-page submission |
| [HUGGINGFACE_DEPLOY.md](docs/HUGGINGFACE_DEPLOY.md) | Static Space deploy |
| [SCREENSHOTS_CHECKLIST.md](docs/SCREENSHOTS_CHECKLIST.md) | Capture list |
| [PROACTIVE_EMAIL_AGENT.md](docs/PROACTIVE_EMAIL_AGENT.md) | Lifecycle emails |
| [N8N_SETUP_CHECKLIST.md](docs/N8N_SETUP_CHECKLIST.md) | n8n manual steps |
