-- Human feedback on AI outputs (Ticket 2). One row per thumbs up/down on a
-- traced AI action (trace_id comes from withAi/currentTraceId, lib/ai-usage.ts).
-- Idempotent; accessed via the service-role server client only. Run in the
-- Supabase SQL editor.
create table if not exists ai_feedback (
  id           text primary key,
  trace_id     text not null,
  user_id      text references users(id) on delete set null,
  workspace_id text,
  feature      text not null default 'chat',
  score        smallint not null default 0 check (score in (-1, 0, 1)),
  note         text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_ai_feedback_trace on ai_feedback(trace_id);
create index if not exists idx_ai_feedback_feature on ai_feedback(feature, created_at);
create index if not exists idx_ai_feedback_created on ai_feedback(created_at);
alter table ai_feedback enable row level security;
