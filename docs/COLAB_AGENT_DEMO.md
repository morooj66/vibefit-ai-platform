# Colab Agent Demo Guide

Notebook: `notebooks/VibeFit_AI_Agent_RAG_Colab.ipynb`

## Purpose

Educational Python replica of the VibeFit proactive email agent for course demos. **Does not send Gmail.**

## Setup in Colab

1. Upload or open the notebook.
2. Add secrets in Colab → Secrets:
   - `OPENAI_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_KEY` (service role for read-only demo queries)
3. Run cells top to bottom.

## What the Notebook Demonstrates

| Concept | Implementation |
|---------|----------------|
| Agent | Orchestrator reads `event_type` and selects tools |
| Tools | `retrieve_knowledge`, `get_user_assessment`, `get_weekly_checkins`, etc. |
| RAG | Supabase `search_knowledge_documents` RPC |
| Structured output | Pydantic model for email JSON |
| Automation vs Agent | n8n schedules/delivers; agent decides content |

## Example Runs

- Welcome email (`user_signed_up`)
- Assessment confirmation (`assessment_completed`)
- Adherence drop motivation (`adherence_dropped`)
- Low energy recovery (`low_energy_detected`)
- Weekly summary (`weekly_summary_due`)

Each example prints: `selected_tools`, `used_rag`, `used_personal_data`, `subject`, `body`, `recommended_actions`.

## Link to Production

Production path:

```
DB Event → n8n → vibefit-proactive-agent → Gmail
```

Colab path:

```
event_type → Python orchestrator → print JSON preview
```
