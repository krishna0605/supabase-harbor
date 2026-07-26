/**
 * One-time SQL a project owner runs in their own Supabase SQL editor.
 *
 * Shape matters here. RLS is enabled with *no policies*, so the table stays
 * invisible to `anon` through the normal REST path. The only reachable surface
 * is a definer function that takes no arguments and returns one timestamp — a
 * leaked anon key buys an attacker the ability to bump a counter.
 *
 * Harbor never executes this. It shows it; the owner runs it.
 */
export const ENROLLMENT_SQL = `-- Supabase Harbor · keepalive enrollment
-- Run once per project. Harbor never executes SQL against your database.

create table if not exists public.harbor_heartbeat (
  id          smallint primary key default 1,
  pinged_at   timestamptz not null default now(),
  ping_count  bigint      not null default 0,
  constraint harbor_heartbeat_singleton check (id = 1)
);

insert into public.harbor_heartbeat (id) values (1)
  on conflict (id) do nothing;

alter table public.harbor_heartbeat enable row level security;
-- No policies by design: the table is unreachable to anon. Only the
-- definer function below may touch it.

create or replace function public.harbor_ping()
returns timestamptz
language sql
security definer
set search_path = public
as $$
  update public.harbor_heartbeat
     set pinged_at  = now(),
         ping_count = ping_count + 1
   where id = 1
  returning pinged_at;
$$;

revoke all on function public.harbor_ping() from public;
grant execute on function public.harbor_ping() to anon;`;

/** Deep link to a specific project's SQL editor. */
export function sqlEditorUrl(projectRef: string) {
  return `https://supabase.com/dashboard/project/${encodeURIComponent(projectRef)}/sql/new`;
}
