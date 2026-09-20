create or replace function public.notify_friend_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare sender_name text;
begin
  select coalesce(full_name, 'Someone') into sender_name from public.profiles where id = new.sender_id;
  insert into public.notifications(user_id, actor_id, type, message)
  values (new.receiver_id, new.sender_id, 'friend_request', sender_name || ' sent you a friend request.');
  return new;
end;
$$;

create or replace function public.sync_friend_request_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare sender_name text;
begin
  if new.status = 'accepted' and old.status is distinct from new.status then
    select coalesce(full_name, 'Someone') into sender_name from public.profiles where id = new.receiver_id;
    insert into public.notifications(user_id, actor_id, type, message)
    values (new.sender_id, new.receiver_id, 'friend_request_accepted', sender_name || ' accepted your friend request.');
  end if;
  return new;
end;
$$;
