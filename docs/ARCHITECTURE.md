# VibeFit — Architecture

## Platform Stack

```mermaid
flowchart LR
  React[React App RTL]
  Auth[Supabase Auth JWT]
  DB[(PostgreSQL + RLS)]
  EF[Edge Functions]
  OpenAI[OpenAI API]

  React --> Auth
  React --> DB
  React --> EF
  EF --> DB
  EF --> OpenAI
```

**Path:** React App → Supabase Auth → PostgreSQL + RLS → Edge Functions → OpenAI

---

## Assistant (Web Chat)

```mermaid
flowchart TD
  Q[User Question /assistant] --> Agent[vibefit-agent]
  Agent --> Intent[Intent Router]
  Intent --> Tools[Tool Selection]
  Tools --> Ctx[User Context]
  Tools --> RAG[RAG Full-text Search]
  Ctx --> LLM[OpenAI Structured Response]
  RAG --> LLM
  LLM --> UI[Assistant UI]
```

| Step | Description |
|------|-------------|
| Intent Router | Classifies: open, plan, progress, motivation, safety… |
| Tool Selection | Personal data, analytics, RAG, recommendation context |
| User Context | Profile, assessment, recommendation, last 8 check-ins |
| RAG | `search_knowledge_documents` — **PostgreSQL full-text**, not vector DB |
| Structured Response | JSON: answer, actions, insights, sources |

---

## Incoming Email Agent

```mermaid
flowchart LR
  Gmail[Gmail Inbox] --> n8n[n8n Workflow]
  n8n --> Agent[vibefit-agent]
  Agent --> RAG[RAG]
  Agent --> Ctx[Email User Lookup]
  Agent --> LLM[OpenAI]
  LLM --> n8n
  n8n --> Reply[Gmail Reply]
```

**Path:** Gmail → n8n → vibefit-agent → Gmail Reply

- n8n = **Automation** (normalize, dedupe, rate limit, send)
- Agent = **Intelligence** (intent, RAG, personal data, reply)

---

## Proactive Lifecycle Email

```mermaid
flowchart LR
  Trigger[DB Trigger / Schedule] --> Events[(proactive_email_events)]
  Events --> n8n[n8n Hourly Workflow]
  n8n --> PAgent[vibefit-proactive-agent]
  PAgent --> RAG[RAG optional]
  PAgent --> Ctx[User Context]
  PAgent --> LLM[OpenAI]
  LLM --> n8n
  n8n --> Gmail[Gmail Send]
```

**Path:** Database Event / Schedule → n8n → vibefit-proactive-agent → Gmail

Event types: welcome, assessment, recommendation ready, check-in reminder, adherence, energy, inactivity, weekly summary.

---

## Colab Python Demo

```mermaid
flowchart TD
  NB[Colab Notebook] --> Orch[Agent Orchestrator]
  Orch --> Tools[Python Tools]
  Tools --> RAG[retrieve_knowledge RPC]
  Tools --> Data[get_assessment / checkins]
  Orch --> Email[Personalized Email Preview]
```

**Path:** Python Agent Demo → Tools → RAG → Personalized Email Preview (no Gmail send)

---

## RAG Method (Explicit)

| Aspect | VibeFit Implementation |
|--------|------------------------|
| Storage | `knowledge_documents` table |
| Index | PostgreSQL `tsvector` + GIN |
| Search | `search_knowledge_documents` RPC |
| **Not used** | pgvector, embeddings, vector database |

---

## Edge Functions

| Function | Role |
|----------|------|
| `generate-recommendation` | AI weekly plan from assessment |
| `vibefit-agent` | Web chat + incoming email replies |
| `vibefit-proactive-agent` | Proactive lifecycle emails |

---

## Security Boundaries

| Secret | Location |
|--------|----------|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Frontend / HF Variables |
| `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase Edge Secrets only |
| `AGENT_WEBHOOK_SECRET`, `PROACTIVE_AGENT_SECRET` | Supabase + n8n Variables |

---

## Database Tables (Core)

| Table | Purpose |
|-------|---------|
| `profiles`, `assessments`, `recommendations`, `weekly_checkins` | User journey |
| `knowledge_documents` | RAG knowledge base |
| `agent_conversations`, `agent_messages`, `agent_runs` | Chat agent |
| `email_agent_events` | Incoming email idempotency |
| `proactive_email_events`, `email_preferences` | Proactive lifecycle |

---

## Deployment

| Environment | Router | Config |
|-------------|--------|--------|
| Local | BrowserRouter | `.env` |
| Hugging Face | HashRouter (`VITE_ROUTER_MODE=hash`) | Space Variables + `window.huggingface.variables` |

See: [HUGGINGFACE_DEPLOY.md](HUGGINGFACE_DEPLOY.md), [DEMO_GUIDE.md](DEMO_GUIDE.md)
