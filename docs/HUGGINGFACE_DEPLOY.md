# Hugging Face Static Space Deploy

## 1. Create Static Space

1. [huggingface.co/new-space](https://huggingface.co/new-space)
2. **SDK:** Static
3. Upload this repository (or connect Git).

## 2. Build Settings (README YAML)

Already in `README.md` frontmatter:

- `sdk: static`
- `app_build_command: npm run build`
- `app_file: dist/index.html`

## 3. Space Variables

| Variable | Value |
|----------|-------|
| `VITE_SUPABASE_URL` | `https://YOUR-PROJECT.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | your publishable anon key |
| `VITE_ROUTER_MODE` | `hash` |

**Do not add:** `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, or any server secrets.

## 4. CORS

In Supabase → Edge Functions → Secrets, set:

```
ALLOWED_ORIGINS=https://YOUR-USERNAME-vibefit.hf.space
```

Redeploy Edge Functions: `generate-recommendation`, `vibefit-agent`.

## 5. Smoke Test

After Space builds:

- [ ] Login / Signup
- [ ] Complete Assessment → AI recommendation (or labeled mock fallback)
- [ ] Dashboard KPIs + charts
- [ ] Assistant: general RAG question + personal question

Routes on HF use hash: `/#/dashboard`, `/#/assistant`, etc.
