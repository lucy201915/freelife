-- public_service_functions_service_type
-- Adds service_type + package name/billing_period to the 2 public read RPCs.
-- Still returns ONLY status = 'active' services. Same SECURITY DEFINER, STABLE,
-- search_path, owner, and EXECUTE grants as before (anon + authenticated).
-- No RLS policy changes.

-- list_public_services: return type changes, so it must be dropped and recreated
-- in this same transaction; grants are restored to exactly the previous ACL
-- {postgres=X, anon=X, authenticated=X}.
drop function if exists public.list_public_services(text, text);

create function public.list_public_services(p_query text default ''::text, p_category text default ''::text)
returns table(
  id uuid, slug text, title text, category text, description text, images jsonb,
  availability boolean, talent_id uuid, talent_name text, talent_headline text,
  talent_location text, basic_price integer, avg_rating numeric, review_count integer,
  service_type text, price_period text
)
language sql
stable security definer
set search_path to 'public'
as $function$
  select s.id, s.slug, s.title, s.category, s.description, s.images, s.availability,
         s.talent_id, p.name, t.headline, t.location,
         (select sp.price from public.service_packages as sp where sp.service_id = s.id and sp.tier = 'basic' limit 1),
         (select coalesce(avg(r.rating), 0) from public.service_reviews as r where r.service_id = s.id),
         (select count(*)::integer from public.service_reviews as r where r.service_id = s.id),
         s.service_type,
         coalesce((select sp.billing_period from public.service_packages as sp where sp.service_id = s.id and sp.tier = 'basic' limit 1), 'one_time')
  from public.services as s
  join public.profiles as p on p.id = s.talent_id
  join public.talent_profiles as t on t.user_id = s.talent_id
  where s.status = 'active'
    and (p_category is null or p_category = '' or s.category = p_category)
    and (
      p_query is null or p_query = ''
      or s.title ilike '%' || p_query || '%'
      or s.category ilike '%' || p_query || '%'
      or p.name ilike '%' || p_query || '%'
      or coalesce(s.description, '') ilike '%' || p_query || '%'
    )
  order by s.created_at desc;
$function$;

revoke all on function public.list_public_services(text, text) from public;
grant execute on function public.list_public_services(text, text) to anon, authenticated;

-- get_public_service_page: returns jsonb, so CREATE OR REPLACE keeps the existing grants.
create or replace function public.get_public_service_page(p_slug text)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'service', jsonb_build_object(
      'id', s.id,
      'slug', s.slug,
      'title', s.title,
      'category', s.category,
      'description', s.description,
      'images', s.images,
      'availability', s.availability,
      'status', s.status,
      'service_type', s.service_type
    ),
    'talent', jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'username', p.username,
      'headline', t.headline,
      'location', t.location,
      'languages', t.languages,
      'bio', t.bio,
      'skills', t.skills,
      'linkedin_url', t.linkedin_url
    ),
    'packages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sp.id,
        'tier', sp.tier,
        'name', sp.name,
        'billing_period', sp.billing_period,
        'price', sp.price,
        'delivery_days', sp.delivery_days,
        'revisions', sp.revisions,
        'features', sp.features
      ) order by case sp.tier when 'basic' then 1 when 'standard' then 2 else 3 end)
      from public.service_packages as sp where sp.service_id = s.id
    ), '[]'::jsonb),
    'faqs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'question', f.question, 'answer', f.answer, 'sort', f.sort
      ) order by f.sort)
      from public.service_faqs as f where f.service_id = s.id
    ), '[]'::jsonb),
    'portfolios', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pf.id, 'title', pf.title, 'summary', pf.summary, 'image_path', pf.image_path, 'sort', pf.sort
      ) order by pf.sort)
      from public.service_portfolios as pf where pf.service_id = s.id
    ), '[]'::jsonb),
    'reviews', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'rating', r.rating, 'comment', r.comment,
        'reviewer_name', r.reviewer_name, 'created_at', r.created_at
      ) order by r.created_at desc)
      from public.service_reviews as r where r.service_id = s.id
    ), '[]'::jsonb),
    'stats', jsonb_build_object(
      'avg_rating', coalesce((select avg(r.rating) from public.service_reviews as r where r.service_id = s.id), 0),
      'review_count', coalesce((select count(*) from public.service_reviews as r where r.service_id = s.id), 0)
    ),
    'related', coalesce((
      select jsonb_agg(jsonb_build_object(
        'slug', rel.slug,
        'title', rel.title,
        'category', rel.category,
        'service_type', rel.service_type,
        'talent_name', rp.name,
        'basic_price', (select spp.price from public.service_packages as spp where spp.service_id = rel.id and spp.tier = 'basic' limit 1),
        'price_period', coalesce((select spp.billing_period from public.service_packages as spp where spp.service_id = rel.id and spp.tier = 'basic' limit 1), 'one_time')
      ))
      from (
        select rs.id, rs.slug, rs.title, rs.category, rs.talent_id, rs.service_type
        from public.services as rs
        where rs.status = 'active' and rs.slug <> p_slug
          and (rs.category = s.category or rs.talent_id = s.talent_id)
        order by rs.created_at desc
        limit 4
      ) as rel
      join public.profiles as rp on rp.id = rel.talent_id
    ), '[]'::jsonb)
  )
  into result
  from public.services as s
  join public.profiles as p on p.id = s.talent_id
  join public.talent_profiles as t on t.user_id = s.talent_id
  where s.slug = p_slug and s.status = 'active';

  return result;
end;
$function$;
