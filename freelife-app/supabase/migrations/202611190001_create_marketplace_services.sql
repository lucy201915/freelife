-- Additive marketplace schema for FREELIFE services.
-- Does not drop, rename, or alter existing tables, columns, data, or policies.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  category text NOT NULL,
  description text NOT NULL DEFAULT '',
  images jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  availability boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT services_title_len CHECK (char_length(title) >= 4 AND char_length(title) <= 120),
  CONSTRAINT services_slug_fmt CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' AND char_length(slug) >= 3 AND char_length(slug) <= 80),
  CONSTRAINT services_status_check CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'paused'::text])),
  CONSTRAINT services_images_array CHECK (jsonb_typeof(images) = 'array')
);

CREATE TABLE public.service_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  tier text NOT NULL,
  price integer NOT NULL,
  delivery_days integer NOT NULL,
  revisions integer NOT NULL DEFAULT 0,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT service_packages_tier_check CHECK (tier = ANY (ARRAY['basic'::text, 'standard'::text, 'premium'::text])),
  CONSTRAINT service_packages_price_check CHECK (price >= 0),
  CONSTRAINT service_packages_days_check CHECK (delivery_days >= 1),
  CONSTRAINT service_packages_revisions_check CHECK (revisions >= 0),
  CONSTRAINT service_packages_features_array CHECK (jsonb_typeof(features) = 'array'),
  CONSTRAINT service_packages_unique_tier UNIQUE (service_id, tier)
);

CREATE TABLE public.service_faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  question text NOT NULL,
  answer text NOT NULL,
  sort integer NOT NULL DEFAULT 0,
  CONSTRAINT service_faqs_question_len CHECK (char_length(question) >= 2 AND char_length(question) <= 200),
  CONSTRAINT service_faqs_answer_len CHECK (char_length(answer) >= 2 AND char_length(answer) <= 2000)
);

CREATE TABLE public.service_portfolios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  image_path text,
  sort integer NOT NULL DEFAULT 0,
  CONSTRAINT service_portfolios_title_len CHECK (char_length(title) >= 2 AND char_length(title) <= 120)
);

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  talent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
  package_id uuid NOT NULL REFERENCES public.service_packages(id) ON DELETE RESTRICT,
  package_tier text NOT NULL,
  price integer NOT NULL,
  delivery_days integer NOT NULL,
  revisions integer NOT NULL DEFAULT 0,
  brief text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orders_not_self CHECK (business_id <> talent_id),
  CONSTRAINT orders_tier_check CHECK (package_tier = ANY (ARRAY['basic'::text, 'standard'::text, 'premium'::text])),
  CONSTRAINT orders_price_check CHECK (price >= 0),
  CONSTRAINT orders_days_check CHECK (delivery_days >= 1),
  CONSTRAINT orders_status_check CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'in_progress'::text, 'delivered'::text, 'completed'::text, 'cancelled'::text, 'declined'::text]))
);

CREATE TABLE public.order_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  message text NOT NULL DEFAULT '',
  file_paths jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_deliveries_files_array CHECK (jsonb_typeof(file_paths) = 'array')
);

CREATE TABLE public.service_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.profiles(id),
  reviewer_name text NOT NULL DEFAULT '',
  rating integer NOT NULL,
  comment text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_reviews_rating_check CHECK (rating >= 1 AND rating <= 5),
  CONSTRAINT service_reviews_comment_len CHECK (char_length(comment) <= 2000)
);

CREATE TABLE public.service_favorites (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, service_id)
);

-- Additive nullable column on existing invites so 聯絡人才 can reference a service.
ALTER TABLE public.invites
  ADD COLUMN IF NOT EXISTS service_id uuid REFERENCES public.services(id) ON DELETE SET NULL;

CREATE INDEX services_talent_id_idx ON public.services (talent_id);
CREATE INDEX services_status_idx ON public.services (status);
CREATE INDEX services_category_idx ON public.services (category);
CREATE INDEX service_packages_service_id_idx ON public.service_packages (service_id);
CREATE INDEX service_faqs_service_id_idx ON public.service_faqs (service_id);
CREATE INDEX service_portfolios_service_id_idx ON public.service_portfolios (service_id);
CREATE INDEX orders_business_id_idx ON public.orders (business_id);
CREATE INDEX orders_talent_id_idx ON public.orders (talent_id);
CREATE INDEX orders_service_id_idx ON public.orders (service_id);
CREATE INDEX orders_status_idx ON public.orders (status);
CREATE INDEX service_reviews_service_id_idx ON public.service_reviews (service_id);
CREATE INDEX invites_service_id_idx ON public.invites (service_id);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

CREATE TRIGGER services_set_updated_at
  BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER orders_set_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- Direct client writes to orders.price / orders.status are denied (no INSERT/UPDATE policies).
-- Mutations go through SECURITY DEFINER RPCs below.
-- ---------------------------------------------------------------------------

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_faqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY services_select_active_or_owner ON public.services
  FOR SELECT TO anon, authenticated
  USING (status = 'active' OR talent_id = (SELECT auth.uid()));

CREATE POLICY services_insert_own ON public.services
  FOR INSERT TO authenticated
  WITH CHECK (talent_id = (SELECT auth.uid()) AND public.is_role((SELECT auth.uid()), 'talent'));

CREATE POLICY services_update_own ON public.services
  FOR UPDATE TO authenticated
  USING (talent_id = (SELECT auth.uid()))
  WITH CHECK (talent_id = (SELECT auth.uid()));

CREATE POLICY services_delete_own ON public.services
  FOR DELETE TO authenticated
  USING (talent_id = (SELECT auth.uid()));

CREATE POLICY service_packages_select ON public.service_packages
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.services s
    WHERE s.id = service_packages.service_id
      AND (s.status = 'active' OR s.talent_id = (SELECT auth.uid()))
  ));

CREATE POLICY service_packages_write ON public.service_packages
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.services s WHERE s.id = service_packages.service_id AND s.talent_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.services s WHERE s.id = service_packages.service_id AND s.talent_id = (SELECT auth.uid())));

CREATE POLICY service_faqs_select ON public.service_faqs
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.services s
    WHERE s.id = service_faqs.service_id
      AND (s.status = 'active' OR s.talent_id = (SELECT auth.uid()))
  ));

CREATE POLICY service_faqs_write ON public.service_faqs
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.services s WHERE s.id = service_faqs.service_id AND s.talent_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.services s WHERE s.id = service_faqs.service_id AND s.talent_id = (SELECT auth.uid())));

CREATE POLICY service_portfolios_select ON public.service_portfolios
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.services s
    WHERE s.id = service_portfolios.service_id
      AND (s.status = 'active' OR s.talent_id = (SELECT auth.uid()))
  ));

CREATE POLICY service_portfolios_write ON public.service_portfolios
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.services s WHERE s.id = service_portfolios.service_id AND s.talent_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.services s WHERE s.id = service_portfolios.service_id AND s.talent_id = (SELECT auth.uid())));

CREATE POLICY orders_select_party ON public.orders
  FOR SELECT TO authenticated
  USING (business_id = (SELECT auth.uid()) OR talent_id = (SELECT auth.uid()));

CREATE POLICY order_deliveries_select_party ON public.order_deliveries
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_deliveries.order_id
      AND (o.business_id = (SELECT auth.uid()) OR o.talent_id = (SELECT auth.uid()))
  ));

CREATE POLICY service_reviews_select ON public.service_reviews
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.services s
    WHERE s.id = service_reviews.service_id AND s.status = 'active'
  ) OR business_id = (SELECT auth.uid()) OR EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = service_reviews.order_id AND o.talent_id = (SELECT auth.uid())
  ));

CREATE POLICY service_favorites_select ON public.service_favorites
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY service_favorites_insert ON public.service_favorites
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY service_favorites_delete ON public.service_favorites
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

GRANT SELECT ON public.services TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.services TO authenticated;
GRANT SELECT ON public.service_packages TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.service_packages TO authenticated;
GRANT SELECT ON public.service_faqs TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.service_faqs TO authenticated;
GRANT SELECT ON public.service_portfolios TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.service_portfolios TO authenticated;
GRANT SELECT ON public.orders TO authenticated;
GRANT SELECT ON public.order_deliveries TO authenticated;
GRANT SELECT ON public.service_reviews TO anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.service_favorites TO authenticated;

-- ---------------------------------------------------------------------------
-- Public catalog RPCs (SECURITY DEFINER): join profiles safely without
-- granting anon SELECT on projects/invites (existing profiles RLS policy
-- expressions would otherwise 42501 for anonymous readers).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_public_talents()
RETURNS TABLE (
  id uuid,
  name text,
  username text,
  headline text,
  location text,
  languages text,
  bio text,
  skills jsonb,
  project_min integer,
  project_max integer,
  hourly_min integer,
  hourly_max integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.id, p.name, p.username, t.headline, t.location, t.languages, t.bio, t.skills,
         t.project_min, t.project_max, t.hourly_min, t.hourly_max
  FROM public.profiles AS p
  JOIN public.talent_profiles AS t ON t.user_id = p.id
  WHERE p.role = 'talent' AND t.onboarded
  ORDER BY p.name;
$function$;

CREATE OR REPLACE FUNCTION public.list_public_services(p_query text DEFAULT '', p_category text DEFAULT '')
RETURNS TABLE (
  id uuid,
  slug text,
  title text,
  category text,
  description text,
  images jsonb,
  availability boolean,
  talent_id uuid,
  talent_name text,
  talent_headline text,
  talent_location text,
  basic_price integer,
  avg_rating numeric,
  review_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT s.id, s.slug, s.title, s.category, s.description, s.images, s.availability,
         s.talent_id, p.name, t.headline, t.location,
         (SELECT sp.price FROM public.service_packages AS sp WHERE sp.service_id = s.id AND sp.tier = 'basic' LIMIT 1),
         (SELECT COALESCE(avg(r.rating), 0) FROM public.service_reviews AS r WHERE r.service_id = s.id),
         (SELECT count(*)::integer FROM public.service_reviews AS r WHERE r.service_id = s.id)
  FROM public.services AS s
  JOIN public.profiles AS p ON p.id = s.talent_id
  JOIN public.talent_profiles AS t ON t.user_id = s.talent_id
  WHERE s.status = 'active'
    AND (p_category IS NULL OR p_category = '' OR s.category = p_category)
    AND (
      p_query IS NULL OR p_query = ''
      OR s.title ILIKE '%' || p_query || '%'
      OR s.category ILIKE '%' || p_query || '%'
      OR p.name ILIKE '%' || p_query || '%'
      OR coalesce(s.description, '') ILIKE '%' || p_query || '%'
    )
  ORDER BY s.created_at DESC;
$function$;

CREATE OR REPLACE FUNCTION public.get_public_service_page(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'service', jsonb_build_object(
      'id', s.id,
      'slug', s.slug,
      'title', s.title,
      'category', s.category,
      'description', s.description,
      'images', s.images,
      'availability', s.availability,
      'status', s.status
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
    'packages', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', sp.id,
        'tier', sp.tier,
        'price', sp.price,
        'delivery_days', sp.delivery_days,
        'revisions', sp.revisions,
        'features', sp.features
      ) ORDER BY CASE sp.tier WHEN 'basic' THEN 1 WHEN 'standard' THEN 2 ELSE 3 END)
      FROM public.service_packages AS sp WHERE sp.service_id = s.id
    ), '[]'::jsonb),
    'faqs', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', f.id, 'question', f.question, 'answer', f.answer, 'sort', f.sort
      ) ORDER BY f.sort)
      FROM public.service_faqs AS f WHERE f.service_id = s.id
    ), '[]'::jsonb),
    'portfolios', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', pf.id, 'title', pf.title, 'summary', pf.summary, 'image_path', pf.image_path, 'sort', pf.sort
      ) ORDER BY pf.sort)
      FROM public.service_portfolios AS pf WHERE pf.service_id = s.id
    ), '[]'::jsonb),
    'reviews', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id, 'rating', r.rating, 'comment', r.comment,
        'reviewer_name', r.reviewer_name, 'created_at', r.created_at
      ) ORDER BY r.created_at DESC)
      FROM public.service_reviews AS r WHERE r.service_id = s.id
    ), '[]'::jsonb),
    'stats', jsonb_build_object(
      'avg_rating', COALESCE((SELECT avg(r.rating) FROM public.service_reviews AS r WHERE r.service_id = s.id), 0),
      'review_count', COALESCE((SELECT count(*) FROM public.service_reviews AS r WHERE r.service_id = s.id), 0)
    ),
    'related', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'slug', rel.slug,
        'title', rel.title,
        'category', rel.category,
        'talent_name', rp.name,
        'basic_price', (SELECT spp.price FROM public.service_packages AS spp WHERE spp.service_id = rel.id AND spp.tier = 'basic' LIMIT 1)
      ))
      FROM (
        SELECT rs.id, rs.slug, rs.title, rs.category, rs.talent_id
        FROM public.services AS rs
        WHERE rs.status = 'active' AND rs.slug <> p_slug
          AND (rs.category = s.category OR rs.talent_id = s.talent_id)
        ORDER BY rs.created_at DESC
        LIMIT 4
      ) AS rel
      JOIN public.profiles AS rp ON rp.id = rel.talent_id
    ), '[]'::jsonb)
  )
  INTO result
  FROM public.services AS s
  JOIN public.profiles AS p ON p.id = s.talent_id
  JOIN public.talent_profiles AS t ON t.user_id = s.talent_id
  WHERE s.slug = p_slug AND s.status = 'active';

  RETURN result;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Order / review / contact RPCs. Prices and status are snapshotted or
-- transitioned only here; clients cannot write those columns directly.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_order(p_service_id uuid, p_tier text, p_brief text DEFAULT '')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  svc public.services%ROWTYPE;
  pkg public.service_packages%ROWTYPE;
  new_id uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_role(uid, 'business') THEN
    RAISE EXCEPTION 'only_business_can_order' USING ERRCODE = '42501';
  END IF;
  IF p_tier IS NULL OR p_tier NOT IN ('basic', 'standard', 'premium') THEN
    RAISE EXCEPTION 'invalid_tier' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO svc FROM public.services WHERE id = p_service_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'service_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF svc.status <> 'active' OR svc.availability IS NOT TRUE THEN
    RAISE EXCEPTION 'service_unavailable' USING ERRCODE = 'P0001';
  END IF;
  IF svc.talent_id = uid THEN
    RAISE EXCEPTION 'cannot_order_own_service' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO pkg
  FROM public.service_packages
  WHERE service_id = p_service_id AND tier = p_tier;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'package_not_found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.orders (
    business_id, talent_id, service_id, package_id, package_tier,
    price, delivery_days, revisions, brief, status
  ) VALUES (
    uid, svc.talent_id, svc.id, pkg.id, pkg.tier,
    pkg.price, pkg.delivery_days, pkg.revisions, coalesce(p_brief, ''), 'pending'
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_order_status(p_order_id uuid, p_status text)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  o public.orders%ROWTYPE;
  allowed boolean := false;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF p_status = 'cancelled' AND o.status = 'pending' AND o.business_id = uid THEN
    allowed := true;
  ELSIF p_status IN ('accepted', 'declined') AND o.status = 'pending' AND o.talent_id = uid THEN
    allowed := true;
  ELSIF p_status = 'in_progress' AND o.status = 'accepted' AND o.talent_id = uid THEN
    allowed := true;
  ELSIF p_status = 'delivered' AND o.status IN ('accepted', 'in_progress') AND o.talent_id = uid THEN
    allowed := true;
  ELSIF p_status = 'completed' AND o.status = 'delivered' AND o.business_id = uid THEN
    allowed := true;
  END IF;

  IF NOT allowed THEN
    RAISE EXCEPTION 'invalid_status_transition' USING ERRCODE = '42501';
  END IF;

  UPDATE public.orders SET status = p_status WHERE id = p_order_id RETURNING * INTO o;
  RETURN o;
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_order_delivery(p_order_id uuid, p_message text DEFAULT '', p_file_paths jsonb DEFAULT '[]'::jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  o public.orders%ROWTYPE;
  new_id uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_file_paths IS NULL OR jsonb_typeof(p_file_paths) <> 'array' THEN
    RAISE EXCEPTION 'invalid_file_paths' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF o.talent_id <> uid THEN
    RAISE EXCEPTION 'only_talent_can_deliver' USING ERRCODE = '42501';
  END IF;
  IF o.status NOT IN ('accepted', 'in_progress') THEN
    RAISE EXCEPTION 'invalid_status_transition' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.order_deliveries (order_id, message, file_paths, created_by)
  VALUES (p_order_id, coalesce(p_message, ''), p_file_paths, uid)
  RETURNING id INTO new_id;

  UPDATE public.orders SET status = 'delivered' WHERE id = p_order_id;
  RETURN new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_service_review(p_order_id uuid, p_rating integer, p_comment text DEFAULT '')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  o public.orders%ROWTYPE;
  reviewer text;
  new_id uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'invalid_rating' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF o.business_id <> uid THEN
    RAISE EXCEPTION 'only_buyer_can_review' USING ERRCODE = '42501';
  END IF;
  IF o.status <> 'completed' THEN
    RAISE EXCEPTION 'order_not_completed' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.service_reviews WHERE order_id = p_order_id) THEN
    RAISE EXCEPTION 'review_already_exists' USING ERRCODE = '23505';
  END IF;

  SELECT name INTO reviewer FROM public.profiles WHERE id = uid;

  INSERT INTO public.service_reviews (service_id, order_id, business_id, reviewer_name, rating, comment)
  VALUES (o.service_id, o.id, uid, coalesce(reviewer, ''), p_rating, coalesce(p_comment, ''))
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.start_service_contact(p_service_id uuid, p_kind text DEFAULT 'quote', p_note text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  svc public.services%ROWTYPE;
  kind text := coalesce(p_kind, 'quote');
  conv_id uuid;
  invite_id uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_role(uid, 'business') THEN
    RAISE EXCEPTION 'only_business_can_contact' USING ERRCODE = '42501';
  END IF;
  IF kind NOT IN ('quote', 'meeting') THEN
    RAISE EXCEPTION 'invalid_invite_kind' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO svc FROM public.services WHERE id = p_service_id AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'service_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF svc.talent_id = uid THEN
    RAISE EXCEPTION 'cannot_contact_self' USING ERRCODE = '42501';
  END IF;

  SELECT c.id INTO conv_id
  FROM public.conversations AS c
  WHERE c.business_id = uid AND c.talent_id = svc.talent_id
  ORDER BY c.updated_at DESC
  LIMIT 1;

  IF conv_id IS NULL THEN
    INSERT INTO public.conversations (business_id, talent_id, subject)
    VALUES (uid, svc.talent_id, svc.title)
    RETURNING id INTO conv_id;
  END IF;

  INSERT INTO public.invites (business_id, talent_id, kind, status, note, conversation_id, service_id)
  VALUES (uid, svc.talent_id, kind, 'pending', coalesce(p_note, ''), conv_id, svc.id)
  RETURNING id INTO invite_id;

  RETURN jsonb_build_object('invite_id', invite_id, 'conversation_id', conv_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.list_public_talents() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_public_services(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_service_page(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_order(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_order_status(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_order_delivery(uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_service_review(uuid, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_service_contact(uuid, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.list_public_talents() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_services(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_service_page(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_order_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_order_delivery(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_service_review(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_service_contact(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Storage: public bucket service-media, writes only under {uid}/
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'service-media',
  'service-media',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY service_media_public_read
  ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'service-media');

CREATE POLICY service_media_insert_own
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'service-media'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

CREATE POLICY service_media_update_own
  ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'service-media'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'service-media'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

CREATE POLICY service_media_delete_own
  ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'service-media'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );
