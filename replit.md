# Aura — AI Chatbot

A personal AI chatbot powered by OpenAI GPT. Clean, warm chat interface with conversation history, real-time streaming responses, and markdown rendering.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/chatbot run dev` — run the frontend (port auto-assigned)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `OPENAI_API_KEY` — OpenAI API key (server-side only)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind CSS + shadcn/ui
- API: Express 5 with streaming SSE for chat
- DB: PostgreSQL + Drizzle ORM (conversations + messages tables)
- AI: OpenAI GPT-4o-mini via streaming completions
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)

## Where things live

- `artifacts/chatbot/src/` — React frontend
  - `components/chat-content.tsx` — main chat area with SSE streaming
  - `components/sidebar.tsx` — conversation list sidebar
  - `pages/chat.tsx` — page layout
- `artifacts/api-server/src/routes/conversations.ts` — all chat API routes + OpenAI streaming
- `lib/db/src/schema/conversations.ts` — conversations table
- `lib/db/src/schema/messages.ts` — messages table
- `lib/api-spec/openapi.yaml` — API contract (source of truth)

## Architecture decisions

- Messages sent via raw SSE fetch (not generated hooks) — Orval can't codegen streaming endpoints
- OpenAI API key used server-side only — never exposed to frontend
- Conversations auto-titled from first message content
- `gpt-4o-mini` model for cost-efficiency on streaming completions
- Messages stored in DB for persistent history across sessions

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- After OpenAPI spec changes, run `pnpm --filter @workspace/api-spec run codegen` then `pnpm run typecheck:libs`
- SSE streaming uses `text/event-stream` — Express body size limit doesn't apply but audio payloads need adjustment
