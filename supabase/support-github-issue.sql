-- Link support tickets to the GitHub issue auto-created on submission.
-- Best-effort: stays null when GitHub is disabled or the API call fails.
alter table support_tickets
  add column if not exists github_issue_number int,
  add column if not exists github_issue_url    text;
