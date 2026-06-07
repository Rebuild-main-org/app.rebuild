-- REBUILD Engineering OS — sample seed data.
-- Run after schema.sql:  psql "$DATABASE_URL" -f supabase/seed.sql
-- Dates are relative to now() so the data always looks current.

insert into users (id, email, name, role, github_id) values
  ('u_admin','azizghed10@gmail.com','Aziz Ghedamsi','ADMIN','azizg'),
  ('u_lead','sami@rebuild.tn','Sami Karoui','LEAD','samik'),
  ('u_eng1','nour@rebuild.tn','Nour Belhadj','ENGINEER','nourb'),
  ('u_eng2','yassine@rebuild.tn','Yassine Trabelsi','ENGINEER','yassinet'),
  ('u_client','contact@acme.com','Acme Corp','CLIENT',null)
on conflict (id) do nothing;

insert into workspaces (id, name, slug, github_repo, status, client_name, client_email, start_date, technologies) values
  ('ws_acme','Acme Platform','client-acme','rebuild-tn/client-acme','ACTIVE','Acme Corp','contact@acme.com', now() - interval '90 days', array['React','Node.js','PostgreSQL']),
  ('ws_nova','Nova Mobile','client-nova','rebuild-tn/client-nova','ACTIVE','Nova SARL','hello@nova.tn', now() - interval '40 days', array['React Native','Go','Redis'])
on conflict (id) do nothing;

insert into workspace_members (id, user_id, workspace_id, role, joined_at) values
  ('m1','u_lead','ws_acme','LEAD', now() - interval '90 days'),
  ('m2','u_eng1','ws_acme','ENGINEER', now() - interval '80 days'),
  ('m3','u_eng2','ws_acme','ENGINEER', now() - interval '30 days'),
  ('m4','u_admin','ws_acme','ADMIN', now() - interval '90 days'),
  ('m5','u_lead','ws_nova','LEAD', now() - interval '40 days'),
  ('m6','u_eng1','ws_nova','ENGINEER', now() - interval '40 days'),
  ('m7','u_admin','ws_nova','ADMIN', now() - interval '40 days')
on conflict (id) do nothing;

insert into projects (id, name, short_code, status, workspace_id, description, start_date) values
  ('p_acme_web','Customer Portal','ACME','ACTIVE','ws_acme','Self-service customer portal with billing and support.', now() - interval '80 days'),
  ('p_acme_api','Billing API','BILL','REVIEW','ws_acme','Subscription and invoicing service.', now() - interval '60 days'),
  ('p_nova_app','Nova App','NOVA','PLANNING','ws_nova','Cross-platform mobile application.', now() - interval '20 days')
on conflict (id) do nothing;

insert into sprints (id, name, goal, start_date, end_date, project_id, status) values
  ('s_acme_3','Sprint 3','Ship billing dashboard MVP', now() - interval '7 days', now() + interval '7 days','p_acme_web','ACTIVE'),
  ('s_acme_2','Sprint 2','Auth + onboarding', now() - interval '21 days', now() - interval '7 days','p_acme_web','COMPLETED')
on conflict (id) do nothing;

insert into milestones (id, title, description, due_date, project_id, done, validated_by_client) values
  ('ms_acme_1','Beta launch','First client-facing beta with auth and dashboard.', now() + interval '14 days','p_acme_web', false, false),
  ('ms_acme_2','Billing live','Invoicing and subscriptions in production.', now() + interval '45 days','p_acme_web', false, false),
  ('ms_acme_0','Project kickoff','Repo, CI, environments ready.', now() - interval '70 days','p_acme_web', true, true)
on conflict (id) do nothing;

insert into tickets (id, short_id, title, type, priority, status, project_id, assignee_id, reporter_id, labels, milestone_id, sprint_id, points, due_date, "order", created_at, updated_at) values
  ('t101','ACME-101','Set up GitHub OAuth login','FEATURE','HIGH','DONE','p_acme_web','u_eng1','u_lead',array['auth'],'ms_acme_1','s_acme_2',5,null,1, now() - interval '10 days', now() - interval '1 days'),
  ('t112','ACME-112','Dashboard layout & sidebar','TASK','MEDIUM','DONE','p_acme_web','u_eng2','u_lead',array['frontend'],null,'s_acme_2',3,null,2, now() - interval '10 days', now() - interval '1 days'),
  ('t128','ACME-128','Billing summary cards','FEATURE','HIGH','IN_REVIEW','p_acme_web','u_eng1','u_lead',array['frontend','billing'],'ms_acme_2','s_acme_3',5,null,3, now() - interval '10 days', now() - interval '1 days'),
  ('t131','ACME-131','Invoice PDF export crashes on empty line items','BUG','CRITICAL','IN_PROGRESS','p_acme_web','u_eng2','u_lead',array['billing','bug'],null,'s_acme_3',3, now() + interval '1 days',4, now() - interval '10 days', now() - interval '1 days'),
  ('t142','ACME-142','Login times out after 15 minutes unexpectedly','BUG','HIGH','TODO','p_acme_web','u_eng1','u_lead',array['auth','bug'],null,'s_acme_3',2, now() + interval '2 days',5, now() - interval '10 days', now() - interval '1 days'),
  ('t150','ACME-150','Dark mode polish across portal','TASK','LOW','BACKLOG','p_acme_web',null,'u_lead',array['frontend','polish'],null,null,2,null,6, now() - interval '10 days', now() - interval '1 days'),
  ('t151','ACME-151','Audit log for sensitive actions','FEATURE','MEDIUM','BACKLOG','p_acme_web',null,'u_lead',array['security'],null,null,5,null,7, now() - interval '10 days', now() - interval '1 days')
on conflict (id) do nothing;

insert into comments (id, content, ticket_id, author_id, created_at, updated_at) values
  ('c1','Reproduced on staging — happens when lineItems is empty.','t131','u_eng2', now() - interval '1 days', now() - interval '1 days'),
  ('c2','@Nour can you confirm the token refresh logic in the middleware?','t142','u_lead', now() - interval '1 days', now() - interval '1 days')
on conflict (id) do nothing;

insert into activities (id, ticket_id, kind, actor_id, message, created_at) values
  ('a1','t131','created','u_lead','created this ticket', now() - interval '3 days'),
  ('a2','t131','assigned','u_lead','assigned to Yassine Trabelsi', now() - interval '3 days'),
  ('a3','t131','status_changed','u_eng2','moved from To Do to In Progress', now() - interval '1 days')
on conflict (id) do nothing;

insert into branches (id, workspace_id, name, ahead, behind, protected, last_commit_hash, last_commit_date, last_author_id) values
  ('br_acme_main','ws_acme','main',0,0,true,'a1b2c3d', now(), 'u_eng1'),
  ('br_acme_128','ws_acme','feature/ACME-128-billing-cards',3,1,false,'e4f5g6h', now(), 'u_eng1'),
  ('br_acme_131','ws_acme','bugfix/ACME-131-invoice-pdf',1,2,false,'i7j8k9l', now(), 'u_eng2')
on conflict (id) do nothing;

insert into git_commits (id, hash, message, author_id, date, workspace_id, ticket_id, branch) values
  ('g1','a1b2c3d','fix: oauth callback [ACME-101]','u_eng1', now() - interval '2 days','ws_acme','t101','main'),
  ('g2','e4f5g6h','feat: billing summary cards [ACME-128]','u_eng1', now(),'ws_acme','t128','feature/ACME-128-billing-cards'),
  ('g3','i7j8k9l','wip: invoice pdf empty items [ACME-131]','u_eng2', now(),'ws_acme','t131','bugfix/ACME-131-invoice-pdf')
on conflict (id) do nothing;

insert into pull_requests (id, number, title, status, ci, branch_from, branch_to, workspace_id, ticket_id, author_id, created_at) values
  ('pr1',84,'Billing summary cards [ACME-128]','OPEN','PASSING','feature/ACME-128-billing-cards','main','ws_acme','t128','u_eng1', now()),
  ('pr2',81,'GitHub OAuth login [ACME-101]','MERGED','PASSING','feature/ACME-101-oauth','main','ws_acme','t101','u_eng1', now() - interval '2 days'),
  ('pr3',79,'Support list pagination [ACME-134]','OPEN','FAILING','feature/ACME-134-pagination','main','ws_acme',null,'u_eng1', now() - interval '1 days')
on conflict (id) do nothing;

insert into deployments (id, env, commit_hash, status, deployed_at, workspace_id, branch, author_id) values
  ('d1','PRODUCTION','a1b2c3d','SUCCESS', now() - interval '2 days','ws_acme','main','u_lead'),
  ('d2','STAGING','e4f5g6h','SUCCESS', now(),'ws_acme','main','u_eng1')
on conflict (id) do nothing;

insert into messages (id, content, author_id, workspace_id, is_from_client, created_at) values
  ('msg1','Hi team! When can we expect the billing dashboard preview?','u_client','ws_acme',true, now() - interval '1 days'),
  ('msg2','Hello! The billing dashboard is in review now — preview link this week.','u_lead','ws_acme',false, now() - interval '1 days')
on conflict (id) do nothing;

insert into finance_docs (id, kind, number, workspace_id, client_name, issue_date, due_date, status, items, tax_rate, currency) values
  ('fd_1','QUOTE','DEV-2026-001','ws_acme','Acme Corp', now() - interval '30 days', now(),'ACCEPTED',
    '[{"description":"Customer portal — design & build","quantity":1,"unitPrice":18000},{"description":"Billing integration","quantity":1,"unitPrice":9000}]', 19,'TND'),
  ('fd_2','INVOICE','FAC-2026-014','ws_acme','Acme Corp', now() - interval '10 days', now() + interval '20 days','SENT',
    '[{"description":"Sprint 3 delivery","quantity":1,"unitPrice":7500}]', 19,'TND')
on conflict (id) do nothing;

insert into transactions (id, kind, label, category, amount, date, workspace_id) values
  ('tx_1','REVENUE','Acme — milestone 1','Client payment',18000, now() - interval '25 days','ws_acme'),
  ('tx_2','EXPENSE','Cloud hosting','Infrastructure',420, now() - interval '20 days',null),
  ('tx_3','EXPENSE','Team salaries','Payroll',12000, now() - interval '15 days',null),
  ('tx_4','REVENUE','Nova — deposit','Client payment',6000, now() - interval '12 days','ws_nova')
on conflict (id) do nothing;

insert into meetings (id, title, start_at, end_at, workspace_id, meet_link, attendee_ids, created_by_id) values
  ('mtg_1','Acme — Sprint 3 review', now() + interval '2 days', now() + interval '2 days' + interval '1 hour','ws_acme','https://meet.google.com/abc-defg-hij', array['u_lead','u_eng1','u_eng2'],'u_lead')
on conflict (id) do nothing;
