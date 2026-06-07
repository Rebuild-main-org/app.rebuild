-- P0 epic 4: PR reviews + comments. Run AFTER schema.sql.

do $$ begin
  create type review_state as enum ('APPROVED','CHANGES_REQUESTED','COMMENTED');
exception when duplicate_object then null; end $$;

create table if not exists pr_reviews (
  id           text primary key,
  pr_id        text not null references pull_requests(id) on delete cascade,
  reviewer_id  text not null references users(id),
  state        review_state not null,
  body         text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_pr_reviews_pr on pr_reviews(pr_id);

create table if not exists pr_comments (
  id          text primary key,
  pr_id       text not null references pull_requests(id) on delete cascade,
  author_id   text not null references users(id),
  path        text,          -- file path for line comments (null = general)
  line        int,
  body        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_pr_comments_pr on pr_comments(pr_id);

alter table pr_reviews enable row level security;
alter table pr_comments enable row level security;

-- Optional: require an approving review before merge (enforced in the app).
alter table pull_requests add column if not exists requires_approval boolean not null default true;
