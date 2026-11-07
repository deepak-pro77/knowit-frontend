# KnowIt AI – frontend

React + Vite + TypeScript client for the KnowIt Spring Boot backend.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
```

The backend's CORS allow-list defaults to `http://localhost:5173`, so the dev
server is pinned to that port. Start the backend on port 8080 first
(`./mvnw spring-boot:run` with `GEMINI_API_KEY` set).

To point at a different backend, edit `.env`:

```
VITE_API_BASE_URL=https://your-backend.example.com
```

(and add the frontend's origin to `CORS_ALLOWED_ORIGINS` on the backend).

## Build

```bash
npm run build      # output in dist/
npm run preview
```

## What it does

- `POST /api/v1/objects/analyze` – take a photo (mobile camera) or choose/drop
  a JPEG/PNG/WebP up to 5 MB; shows the structured report with the risk stamp,
  confidence, "seen vs inferred" evidence, hazards, precautions, usage and
  limitations.
- `POST /api/v1/objects/ask` – follow-up questions, with the context built from
  the report and clipped to the backend's size limits.
- Every backend error code (`RATE_LIMITED` with Retry-After, `FILE_TOO_LARGE`,
  `UNSUPPORTED_TYPE`, `BLOCKED`, `TIMEOUT`, …) is shown as a plain message.

## Layout

```
src/
  lib/types.ts       mirrors the backend DTOs
  lib/api.ts         fetch client, limits, error type
  components/        Capture (hero/upload), Report, AskPanel
  App.tsx            state machine: idle → analyzing → done | failed
  styles.css         tokens, light/dark, responsive
```
