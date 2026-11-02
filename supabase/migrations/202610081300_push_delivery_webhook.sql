create extension if not exists pg_net with schema extensions;
create extension if not exists vault with schema vault;

create or replace function public.enqueue_push_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  webhook_secret text;
begin
  select decrypted_secret
    into webhook_secret
    from vault.decrypted_secrets
    where name = 'boopa_push_webhook_secret';

  if webhook_secret is null then
    raise warning 'Push webhook secret is missing; notification % was not queued for push delivery.', new.id;
    return new;
  end if;

  begin
    perform net.http_post(
      url := 'https://uhjezsadlbtrapiyzqrt.supabase.co/functions/v1/push-notification',
      body := pg_catalog.jsonb_build_object(
        'type', 'INSERT',
        'table', 'notifications',
        'schema', 'public',
        'record', pg_catalog.to_jsonb(new)
      ),
      headers := pg_catalog.jsonb_build_object(
        'Content-Type', 'application/json',
        'x-push-webhook-secret', webhook_secret
      ),
      timeout_milliseconds := 5000
    );
  exception when others then
    raise warning 'Unable to queue push for notification %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists notifications_push_webhook on public.notifications;
create trigger notifications_push_webhook
after insert on public.notifications
for each row execute function public.enqueue_push_notification();
