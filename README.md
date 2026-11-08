# KnowIt AI – frontend (+ Vercel API & Works Fine)

React + Vite + TypeScript. The `api/` folder holds a TypeScript port of the Spring Boot
backend (same endpoints, prompts, schema, safety rules and error codes) that runs as
Vercel functions, so the deployed site works on its own.

## Which backend is used

| Situation | Backend |
|---|---|
| Deployed on Vercel (no `VITE_API_BASE_URL`) | Vercel functions in `api/` |
| `npm run dev` on your PC | Java backend at `http://localhost:8080` |
| Open the site with `?api=https://xyz.trycloudflare.com` | That URL (remembered in this browser) |
| Open the site with `?api=default` | Back to the default |

The footer shows "Connected to: …" so you can always see which one is live.

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173, talks to the Java backend on :8080
```

## Deploy on Vercel

1. Import the repo (framework: Vite, auto-detected).
2. Environment variables: `GEMINI_API_KEY` (required), `GEMINI_MODEL` (optional).
   Do **not** set `VITE_API_BASE_URL`.
3. Check `https://<site>.vercel.app/api/health` → `{"status":"UP", ...}`.

## Show the Java backend (laptop + Cloudflare tunnel)

```powershell
$env:CORS_ALLOWED_ORIGINS = "https://<site>.vercel.app,http://localhost:5173"
.\mvnw.cmd spring-boot:run                      # terminal 1
cloudflared tunnel --url http://localhost:8080  # terminal 2 → prints https://xyz.trycloudflare.com
```

Then open `https://<site>.vercel.app/?api=https://xyz.trycloudflare.com`.

## Notes

- Photos over 3.5 MB are resized in the browser before upload (Vercel accepts ~4.5 MB bodies).
- The rate limit in the Vercel functions is per instance (best-effort); the Java one is per server.
- `api/_lib/prompts.ts`, `schema.ts` and `safety.ts` are copies of the Java code — keep them in sync.
