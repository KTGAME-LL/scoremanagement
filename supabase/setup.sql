-- Chạy MỘT LẦN trong Supabase: SQL Editor, dán toàn bộ, bấm Run.
-- Bảng chỉ chứa dữ liệu đã mã hóa từ trình duyệt. Không ai đọc trực tiếp được bảng (RLS bật, không có policy,
-- thu hồi quyền); chỉ truy cập qua 3 hàm bên dưới, mỗi hàm đòi "token" sinh từ mật khẩu.

create table if not exists public.vaults (
  id           text primary key check (id ~ '^[0-9a-f]{64}$'),
  token_hash   text not null,
  version      bigint not null default 1,
  blob         text not null check (length(blob) <= 4000000),
  fails        int not null default 0,
  locked_until timestamptz,
  updated_at   timestamptz not null default now()
);
alter table public.vaults enable row level security;
revoke all on public.vaults from anon, authenticated;

-- Kiểm tra token, đếm lần sai, khóa tạm khi sai nhiều. Trả về 'ok' | 'denied' | 'locked'.
create or replace function public._vault_auth(p_id text, p_token text) returns text
language plpgsql security definer set search_path = public as $$
declare r public.vaults; h text; f int;
begin
  select * into r from public.vaults where id = p_id for update;
  if not found then return 'denied'; end if;
  if r.locked_until is not null and r.locked_until > now() then return 'locked'; end if;
  h := encode(sha256(convert_to(p_token, 'utf8')), 'hex');
  if r.token_hash <> h then
    f := r.fails + 1;
    update public.vaults set fails = f,
      locked_until = case when f >= 5 then now() + make_interval(secs => least(900, 30 * power(2, f - 5))) else null end
      where id = p_id;
    return 'denied';
  end if;
  if r.fails <> 0 then update public.vaults set fails = 0, locked_until = null where id = p_id; end if;
  return 'ok';
end $$;
revoke all on function public._vault_auth(text, text) from public, anon, authenticated;

create or replace function public.vault_get(p_id text, p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s text; r public.vaults;
begin
  if p_id !~ '^[0-9a-f]{64}$' or p_token !~ '^[0-9a-f]{64}$' then return jsonb_build_object('status', 'denied'); end if;
  s := public._vault_auth(p_id, p_token);
  if s <> 'ok' then return jsonb_build_object('status', s); end if;
  select * into r from public.vaults where id = p_id;
  return jsonb_build_object('status', 'ok', 'version', r.version, 'blob', r.blob);
end $$;

-- p_expected = 0: tạo mới (từ chối nếu đã có). p_expected > 0: chỉ ghi nếu đúng phiên bản hiện tại.
create or replace function public.vault_put(p_id text, p_token text, p_expected bigint, p_blob text, p_new_token text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s text; r public.vaults; h text;
begin
  if p_id !~ '^[0-9a-f]{64}$' or p_token !~ '^[0-9a-f]{64}$' or (p_new_token is not null and p_new_token !~ '^[0-9a-f]{64}$')
     or p_blob is null or length(p_blob) > 4000000 then
    return jsonb_build_object('status', 'denied');
  end if;
  h := encode(sha256(convert_to(p_token, 'utf8')), 'hex');
  if p_expected = 0 then
    begin
      insert into public.vaults(id, token_hash, blob) values (p_id, h, p_blob);
      return jsonb_build_object('status', 'ok', 'version', 1);
    exception when unique_violation then
      return jsonb_build_object('status', 'denied');
    end;
  end if;
  s := public._vault_auth(p_id, p_token);
  if s <> 'ok' then return jsonb_build_object('status', s); end if;
  select * into r from public.vaults where id = p_id for update;
  if r.version <> p_expected then return jsonb_build_object('status', 'conflict', 'version', r.version); end if;
  update public.vaults
     set blob = p_blob, version = version + 1, updated_at = now(),
         token_hash = case when p_new_token is null then token_hash else encode(sha256(convert_to(p_new_token, 'utf8')), 'hex') end
   where id = p_id;
  return jsonb_build_object('status', 'ok', 'version', r.version + 1);
end $$;

create or replace function public.vault_delete(p_id text, p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s text;
begin
  if p_id !~ '^[0-9a-f]{64}$' or p_token !~ '^[0-9a-f]{64}$' then return jsonb_build_object('status', 'denied'); end if;
  s := public._vault_auth(p_id, p_token);
  if s <> 'ok' then return jsonb_build_object('status', s); end if;
  delete from public.vaults where id = p_id;
  return jsonb_build_object('status', 'ok');
end $$;

revoke all on function public.vault_get(text, text), public.vault_put(text, text, bigint, text, text), public.vault_delete(text, text) from public;
grant execute on function public.vault_get(text, text), public.vault_put(text, text, bigint, text, text), public.vault_delete(text, text) to anon, authenticated;
