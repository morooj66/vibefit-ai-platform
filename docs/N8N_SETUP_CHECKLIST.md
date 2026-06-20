# n8n Setup Checklist

- [ ] Supabase → Edge Functions → Secrets: add `AGENT_WEBHOOK_SECRET`
- [ ] n8n Variables: set `VIBEFIT_AGENT_SECRET` to the **same** value
- [ ] n8n Variables: set `SUPABASE_SERVICE_ROLE_KEY` (never in repo or frontend)
- [ ] n8n Variables: set `VIBEFIT_AGENT_URL`, `SUPABASE_URL`, `VIBEFIT_GMAIL_ACCOUNT`
- [ ] n8n Credentials: connect **Gmail OAuth**
- [ ] Import `n8n/vibefit-email-agent-test.workflow.json` and `n8n/vibefit-email-agent.workflow.json`
- [ ] Activate **VibeFit Email Agent** (Gmail workflow)
- [ ] Run migration `008_create_proactive_email_events.sql`
- [ ] Supabase Secret: `PROACTIVE_AGENT_SECRET` + `VIBEFIT_APP_URL`
- [ ] n8n Variables: `VIBEFIT_PROACTIVE_AGENT_URL`, `VIBEFIT_PROACTIVE_AGENT_SECRET`, `VIBEFIT_APP_URL`
- [ ] Import `n8n/vibefit-proactive-email-agent.workflow.json` and `n8n/vibefit-weekly-summary.workflow.json`
- [ ] Activate proactive workflows after Gmail OAuth

See also: `docs/N8N_EMAIL_AGENT.md`
