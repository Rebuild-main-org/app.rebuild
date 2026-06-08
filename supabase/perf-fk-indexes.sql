-- Performance migration (run in the Supabase SQL editor or via psql).
-- Source: Supabase performance advisor (database linter) on project `rebuild`.
--   psql "$DATABASE_URL" -f supabase/perf-fk-indexes.sql
--
-- P1 — covering indexes for foreign keys (lint 0001_unindexed_foreign_keys).
-- 43 FKs had no covering index → sequential scans on joins/filters by the FK
-- column and on cascading deletes of the parent row. All idempotent & additive.
-- P2 — profiles RLS initplan fix (lint 0003_auth_rls_initplan) at the bottom.

-- activities
create index if not exists idx_activities_actor_id              on public.activities(actor_id);
-- agents
create index if not exists idx_agents_created_by                on public.agents(created_by);
-- audit_logs
create index if not exists idx_audit_logs_user_id               on public.audit_logs(user_id);
-- branches
create index if not exists idx_branches_last_author_id          on public.branches(last_author_id);
-- comments
create index if not exists idx_comments_author_id               on public.comments(author_id);
-- deployments
create index if not exists idx_deployments_author_id            on public.deployments(author_id);
create index if not exists idx_deployments_workspace_id         on public.deployments(workspace_id);
-- dm_messages
create index if not exists idx_dm_messages_sender_id            on public.dm_messages(sender_id);
-- dm_reactions
create index if not exists idx_dm_reactions_user_id             on public.dm_reactions(user_id);
-- dm_reads
create index if not exists idx_dm_reads_user_id                 on public.dm_reads(user_id);
-- dm_threads
create index if not exists idx_dm_threads_created_by            on public.dm_threads(created_by);
-- documents
create index if not exists idx_documents_project_id             on public.documents(project_id);
create index if not exists idx_documents_uploaded_by_id         on public.documents(uploaded_by_id);
-- finance_docs
create index if not exists idx_finance_docs_workspace_id        on public.finance_docs(workspace_id);
-- git_commits
create index if not exists idx_git_commits_author_id            on public.git_commits(author_id);
create index if not exists idx_git_commits_ticket_id            on public.git_commits(ticket_id);
-- leads
create index if not exists idx_leads_workspace_id               on public.leads(workspace_id);
-- meetings
create index if not exists idx_meetings_created_by_id           on public.meetings(created_by_id);
create index if not exists idx_meetings_workspace_id            on public.meetings(workspace_id);
-- member_notes
create index if not exists idx_member_notes_subject_id          on public.member_notes(subject_id);
-- messages
create index if not exists idx_messages_author_id               on public.messages(author_id);
create index if not exists idx_messages_workspace_id            on public.messages(workspace_id);
-- milestones
create index if not exists idx_milestones_project_id            on public.milestones(project_id);
-- pr_comments
create index if not exists idx_pr_comments_author_id            on public.pr_comments(author_id);
-- pr_reviews
create index if not exists idx_pr_reviews_reviewer_id           on public.pr_reviews(reviewer_id);
-- pull_requests
create index if not exists idx_pull_requests_author_id          on public.pull_requests(author_id);
create index if not exists idx_pull_requests_ticket_id          on public.pull_requests(ticket_id);
-- sprints
create index if not exists idx_sprints_project_id               on public.sprints(project_id);
-- support_comments
create index if not exists idx_support_comments_author_id       on public.support_comments(author_id);
-- support_tickets
create index if not exists idx_support_tickets_assignee_id      on public.support_tickets(assignee_id);
create index if not exists idx_support_tickets_resolved_by_id   on public.support_tickets(resolved_by_id);
-- test_cases
create index if not exists idx_test_cases_created_by_id         on public.test_cases(created_by_id);
-- test_runs
create index if not exists idx_test_runs_run_by_id              on public.test_runs(run_by_id);
create index if not exists idx_test_runs_ticket_id              on public.test_runs(ticket_id);
-- ticket_attachments
create index if not exists idx_ticket_attachments_uploaded_by_id on public.ticket_attachments(uploaded_by_id);
-- ticket_watchers
create index if not exists idx_ticket_watchers_user_id          on public.ticket_watchers(user_id);
-- tickets
create index if not exists idx_tickets_epic_id                  on public.tickets(epic_id);
create index if not exists idx_tickets_milestone_id             on public.tickets(milestone_id);
create index if not exists idx_tickets_reporter_id              on public.tickets(reporter_id);
create index if not exists idx_tickets_sprint_id                on public.tickets(sprint_id);
-- transactions
create index if not exists idx_transactions_workspace_id        on public.transactions(workspace_id);
-- user_blocks
create index if not exists idx_user_blocks_target_id            on public.user_blocks(target_id);
-- workspace_agents
create index if not exists idx_workspace_agents_agent_id        on public.workspace_agents(agent_id);

-- P2 — profiles RLS: evaluate auth.uid() once per query, not once per row.
-- Mirrors supabase/auth.sql (kept in sync). Idempotent.
drop policy if exists profiles_self_read on profiles;
create policy profiles_self_read on profiles
  for select using ((select auth.uid()) = id);
drop policy if exists profiles_self_update on profiles;
create policy profiles_self_update on profiles
  for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
