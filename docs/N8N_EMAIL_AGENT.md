# VibeFit — n8n Email AI Agent

Email Agent حقيقي يربط **Gmail → n8n → vibefit-agent (RAG + بيانات المستخدم) → Gmail Reply**.

**لا تضع Secrets في ملفات المشروع.** استخدم n8n Variables و Supabase Secrets.

---

## Architecture

```text
Gmail Inbound
  → Normalize + Validate
  → Dedupe (email_agent_events + label)
  → Rate limit
  → Lookup user (preview only)
  → POST vibefit-agent (channel=email)
  → Format reply
  → Gmail Reply (same thread)
  → Register event + label processed
```

**الذكاء بالكامل داخل `vibefit-agent`** — n8n لا يحتوي ردودًا محفوظة ولا IF nodes للمحتوى.

---

## Files

| File | Purpose |
|------|---------|
| `n8n/vibefit-email-agent.workflow.json` | Production Gmail workflow |
| `n8n/vibefit-email-agent-test.workflow.json` | Webhook test (`POST /vibefit-email-agent-test`) |
| `n8n/lib/emailAgentCode.js` | Shared Code node snippets |
| `scripts/sync-n8n-email-workflows.mjs` | Regenerate workflow JSON from snippets |
| `supabase/migrations/007_create_email_agent_events.sql` | Idempotency + rate limit |

Regenerate workflows after editing snippets:

```bash
npm run sync:n8n
```

---

## Environment Variables (n8n)

| Variable | Description |
|----------|-------------|
| `VIBEFIT_AGENT_URL` | `https://<project-ref>.supabase.co/functions/v1/vibefit-agent` |
| `VIBEFIT_AGENT_SECRET` | Same as Supabase Secret `AGENT_WEBHOOK_SECRET` |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role (n8n Variables only — never in repo) |
| `VIBEFIT_GMAIL_ACCOUNT` | Inbound mailbox address (loop prevention), e.g. `coach@yourdomain.com` |

---

## Supabase Secrets (Edge Function)

| Secret | Required |
|--------|----------|
| `OPENAI_API_KEY` | Yes |
| `AGENT_WEBHOOK_SECRET` | Yes (must match `VIBEFIT_AGENT_SECRET`) |
| `OPENAI_MODEL` | Optional |

---

## SQL (manual — Supabase SQL Editor)

Run in order if not applied:

1. `006_create_knowledge_and_agent.sql`
2. `007_create_email_agent_events.sql`
3. `supabase/seed/knowledge-base.sql`

Migration 007 adds:

- `email_agent_events` — dedupe + audit (stores `sender_hash`, not raw email)
- RPC: `check_email_message_processed`
- RPC: `check_email_sender_rate_limit`
- RPC: `register_email_agent_event`
- `agent_conversations.external_thread_id` — Gmail thread continuity

---

## User identification

1. n8n sends `external_sender` (email) to `vibefit-agent`.
2. **Backend only** calls `lookup_user_id_by_email` → `auth.users.email`.
3. n8n may preview lookup via RPC — **Agent does not trust `user_id` from n8n**.
4. Response includes `user_found: true|false`.

If user not found:

- Agent runs as General RAG (`used_personal_data = false`)
- Reply footer: «للحصول على إجابة مرتبطة بخطتك… استخدم البريد المرتبط بحسابك في VibeFit.»

---

## Agent tool selection (inside Edge Function)

| Question type | Tools |
|---------------|-------|
| General fitness | RAG |
| Personal / adherence | weekly_checkins + analytics + RAG |
| Plan question | recommendation + RAG |
| Recovery / fatigue | checkins + recommendation + RAG |
| Medical boundary | Safety Guard + RAG safety chunks |

n8n sends only `message`, `channel`, `external_sender`, `conversation_id` (Gmail `thread_id`).

---

## Loop & duplicate prevention

| Layer | Mechanism |
|-------|-----------|
| Gmail filter | `-from:VIBEFIT_GMAIL_ACCOUNT -label:vibefit-agent-processed` |
| Label | `vibefit-agent-processed` after successful reply |
| Database | `email_agent_events.message_id` UNIQUE |
| Rate limit | 10 messages/hour per `sender_hash` |
| Validation | Ignore spam, drafts, self-mail, empty body |

---

## Gmail manual setup

1. Create Gmail OAuth Credential in n8n → attach to Trigger + Reply nodes.
2. Create label `vibefit-agent-processed` in Gmail (or let n8n create on first run).
3. Set `VIBEFIT_GMAIL_ACCOUNT` to your coach inbox address.
4. Import `n8n/vibefit-email-agent.workflow.json`.
5. Activate workflow.

---

## n8n manual setup

1. Set all Variables listed above.
2. Import both workflows.
3. Activate **VibeFit Email Agent** (production).
4. Keep **Test Webhook** active for staging only.

---

## Test webhook (no Gmail send)

```bash
POST https://<your-n8n>/webhook/vibefit-email-agent-test
Content-Type: application/json

{
  "sender_email": "demo@example.com",
  "subject": "سؤال عن الخطة",
  "body_text": "كيف أعود للخطة بعد أسبوع غير منتظم؟",
  "thread_id": "demo-thread-001"
}
```

Returns JSON preview: `preview`, `user_found`, `agent_success`.

---

## Error handling

| Case | Behavior |
|------|----------|
| Empty / invalid message | Register `ignored` — no Agent call |
| Duplicate message_id | Register `ignored` |
| Rate limit | Register `ignored` |
| Agent timeout / 500 | Safe Arabic fallback email + `failed` event |
| Agent 401/403 | Generic fallback — no technical details to user |
| Gmail send failure | Agent answer logged as `processed` but reply may fail — check n8n execution log |
| Unknown user | General RAG + registration footer |

---

## Deploy vibefit-agent

Required after code changes (email thread + `user_found`):

```bash
npx supabase login
npx supabase functions deploy vibefit-agent --project-ref <project-ref> --use-api
```

Set `AGENT_WEBHOOK_SECRET` in Supabase Dashboard → Edge Functions → Secrets.

---

## Local validation

```bash
npm run sync:n8n
npm run validate:n8n
npm run test:n8n-email
npm run build
npm run lint
```

---

## Security checklist

- [ ] No service role key in repo or workflow JSON
- [ ] Gmail OAuth in n8n Credentials only
- [ ] `AGENT_WEBHOOK_SECRET` matches n8n `VIBEFIT_AGENT_SECRET`
- [ ] `email_agent_events` stores hash only — not raw email
- [ ] Reply body excludes intent, model, scores, prompts

---

## WhatsApp

Planned — same `vibefit-agent` with `channel: "whatsapp"`. Not in this phase.
