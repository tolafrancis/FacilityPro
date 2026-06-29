-- 0037_workflow_polish.sql
-- Three polish items:
--   1) Real AI sentiment: fp_messages gets sentiment columns. The score-sentiment
--      Edge Function (Claude) classifies inbound messages and writes sentiment;
--      the DB emits low_sentiment when a message is marked 'low' (replaces the
--      lexical keyword heuristic from 0036).
--   2) Sensor run-volume: fp_workflows.cooldown_minutes throttles event-driven
--      firing (e.g. chatty sensors) — enforced in fp_run_workflows.
--   3) (Per-trigger config is a frontend change.)

-- ---------------------------------------------------------------------------
-- 1) Sentiment columns + AI-driven low_sentiment emit.
-- ---------------------------------------------------------------------------
alter table fp_messages add column if not exists sentiment text;
alter table fp_messages add column if not exists sentiment_score numeric;

create or replace function fp_wf_on_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('fp.in_workflow', true) = 'on' then return new; end if;
  -- Fire when an inbound message is (or becomes) low sentiment. The score is set
  -- by the score-sentiment Edge Function; integrations may also set it directly.
  if new.direction = 'in' and new.sentiment = 'low'
     and (tg_op = 'INSERT' or new.sentiment is distinct from old.sentiment) then
    perform fp_run_workflows(new.org_id, 'low_sentiment', new.id::text, jsonb_build_object(
      'sentiment', 'low', 'sentiment_score', new.sentiment_score,
      'conversation', new.conversation_id, 'message', new.body));
  end if;
  return new;
end; $$;

drop trigger if exists trg_fp_wf_on_message on fp_messages;
create trigger trg_fp_wf_on_message
  after insert or update on fp_messages
  for each row execute function fp_wf_on_message();

-- ---------------------------------------------------------------------------
-- 2) Per-workflow cooldown for event-driven firing.
-- ---------------------------------------------------------------------------
alter table fp_workflows add column if not exists cooldown_minutes int not null default 0;

create or replace function fp_run_workflows(
  p_org          uuid,
  p_trigger_type text,
  p_trigger_ref  text default null,
  p_context      jsonb default '{}'::jsonb
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  wf record;
  n  int := 0;
begin
  perform set_config('fp.in_workflow', 'on', true);
  for wf in
    select * from fp_workflows
    where is_active = true and org_id = p_org and trigger_type = p_trigger_type
    order by run_order, created_at
  loop
    -- Throttle: skip (no run row) when still within the workflow's cooldown.
    if coalesce(wf.cooldown_minutes, 0) > 0
       and wf.last_run_at is not null
       and now() - wf.last_run_at < make_interval(mins => wf.cooldown_minutes) then
      continue;
    end if;

    if fp_exec_workflow(wf, p_trigger_ref, p_context) then
      n := n + 1;
    end if;
  end loop;
  perform set_config('fp.in_workflow', 'off', true);
  return n;
end;
$$;

grant execute on function fp_run_workflows(uuid, text, text, jsonb) to authenticated, service_role;
