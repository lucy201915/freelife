-- Contracts and test-mode payments for Freeli chat.
-- Additive only: new tables, nullable columns, RLS, and RPCs.
-- No card numbers, tokens, or gateway secrets are stored here.
-- Real ECPay / TapPay charges must be confirmed by a server-side function
-- after verifying the provider callback. confirm_test_payment refuses
-- anything whose provider is not 'test'.

-- ---------------------------------------------------------------------------
-- Optional listing fields used by the project detail page
-- ---------------------------------------------------------------------------

ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS timeline text NOT NULL DEFAULT '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'requests_timeline_len'
  ) THEN
    ALTER TABLE public.requests
      ADD CONSTRAINT requests_timeline_len CHECK (char_length(timeline) <= 200);
  END IF;
END $$;

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS request_id uuid REFERENCES public.requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS conversations_request_id_idx ON public.conversations (request_id);

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  request_id uuid REFERENCES public.requests(id) ON DELETE SET NULL,
  business_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  talent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  scope text NOT NULL DEFAULT '',
  deliverables jsonb NOT NULL DEFAULT '[]'::jsonb,
  price integer NOT NULL,
  currency text NOT NULL DEFAULT 'TWD',
  start_on date,
  end_on date,
  milestones jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  source text NOT NULL DEFAULT 'template',
  business_agreed_at timestamptz,
  talent_agreed_at timestamptz,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contracts_not_self CHECK (business_id <> talent_id),
  CONSTRAINT contracts_title_len CHECK (char_length(title) >= 2 AND char_length(title) <= 120),
  CONSTRAINT contracts_scope_len CHECK (char_length(scope) <= 8000),
  CONSTRAINT contracts_price_check CHECK (price >= 0),
  CONSTRAINT contracts_currency_check CHECK (currency = 'TWD'),
  CONSTRAINT contracts_status_check CHECK (status = ANY (ARRAY['draft'::text, 'proposed'::text, 'agreed'::text, 'cancelled'::text])),
  CONSTRAINT contracts_source_check CHECK (source = ANY (ARRAY['template'::text, 'ai'::text])),
  CONSTRAINT contracts_deliverables_array CHECK (jsonb_typeof(deliverables) = 'array'),
  CONSTRAINT contracts_milestones_array CHECK (jsonb_typeof(milestones) = 'array'),
  CONSTRAINT contracts_dates_check CHECK (start_on IS NULL OR end_on IS NULL OR end_on >= start_on)
);

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  milestone_index integer,
  payer_id uuid NOT NULL REFERENCES public.profiles(id),
  payee_id uuid NOT NULL REFERENCES public.profiles(id),
  amount integer NOT NULL,
  currency text NOT NULL DEFAULT 'TWD',
  status text NOT NULL DEFAULT 'test_pending',
  provider text NOT NULL DEFAULT 'test',
  provider_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payments_amount_check CHECK (amount >= 0),
  CONSTRAINT payments_currency_check CHECK (currency = 'TWD'),
  CONSTRAINT payments_status_check CHECK (status = ANY (ARRAY['test_pending'::text, 'test_paid'::text, 'cancelled'::text])),
  CONSTRAINT payments_provider_check CHECK (provider = ANY (ARRAY['test'::text, 'ecpay'::text, 'tappay'::text])),
  CONSTRAINT payments_milestone_check CHECK (milestone_index IS NULL OR milestone_index >= 0),
  CONSTRAINT payments_not_self CHECK (payer_id <> payee_id)
);

COMMENT ON TABLE public.payments IS
  'Checkout records only. No card data. provider=test is a simulated payment. ecpay/tappay rows must be confirmed server-side after the hosted payment page callback is verified.';

CREATE INDEX IF NOT EXISTS contracts_conversation_id_idx ON public.contracts (conversation_id);
CREATE INDEX IF NOT EXISTS contracts_business_id_idx ON public.contracts (business_id);
CREATE INDEX IF NOT EXISTS contracts_talent_id_idx ON public.contracts (talent_id);
CREATE INDEX IF NOT EXISTS contracts_request_id_idx ON public.contracts (request_id);
CREATE INDEX IF NOT EXISTS payments_contract_id_idx ON public.payments (contract_id);
CREATE INDEX IF NOT EXISTS payments_payer_id_idx ON public.payments (payer_id);
CREATE INDEX IF NOT EXISTS payments_payee_id_idx ON public.payments (payee_id);

DROP TRIGGER IF EXISTS contracts_set_updated_at ON public.contracts;
CREATE TRIGGER contracts_set_updated_at
  BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS payments_set_updated_at ON public.payments;
CREATE TRIGGER payments_set_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Parties may only set their own agreement timestamp.
-- Once both sides have agreed, commercial fields stay as written.
CREATE OR REPLACE FUNCTION public.guard_contract_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.business_id IS DISTINCT FROM OLD.business_id
     OR NEW.talent_id IS DISTINCT FROM OLD.talent_id
     OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'contract_parties_locked' USING ERRCODE = '42501';
  END IF;

  IF (SELECT auth.uid()) = OLD.business_id THEN
    NEW.talent_agreed_at := OLD.talent_agreed_at;
  ELSIF (SELECT auth.uid()) = OLD.talent_id THEN
    NEW.business_agreed_at := OLD.business_agreed_at;
  ELSE
    RAISE EXCEPTION 'not_a_party' USING ERRCODE = '42501';
  END IF;

  IF OLD.business_agreed_at IS NOT NULL AND OLD.talent_agreed_at IS NOT NULL THEN
    NEW.title := OLD.title;
    NEW.scope := OLD.scope;
    NEW.deliverables := OLD.deliverables;
    NEW.price := OLD.price;
    NEW.currency := OLD.currency;
    NEW.start_on := OLD.start_on;
    NEW.end_on := OLD.end_on;
    NEW.milestones := OLD.milestones;
    NEW.request_id := OLD.request_id;
    NEW.source := OLD.source;
    NEW.status := 'agreed';
    NEW.business_agreed_at := OLD.business_agreed_at;
    NEW.talent_agreed_at := OLD.talent_agreed_at;
  ELSIF NEW.business_agreed_at IS NOT NULL AND NEW.talent_agreed_at IS NOT NULL THEN
    NEW.status := 'agreed';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_contract_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_contract_update() FROM anon, authenticated;

DROP TRIGGER IF EXISTS contracts_guard_update ON public.contracts;
CREATE TRIGGER contracts_guard_update
  BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.guard_contract_update();

-- ---------------------------------------------------------------------------
-- RLS: a person only sees contracts and payments they are a party to.
-- Payment status is not client-writable. There is no INSERT policy on payments.
-- ---------------------------------------------------------------------------

ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contracts_select_party ON public.contracts;
CREATE POLICY contracts_select_party ON public.contracts
  FOR SELECT TO authenticated
  USING (business_id = (SELECT auth.uid()) OR talent_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS contracts_insert_party ON public.contracts;
CREATE POLICY contracts_insert_party ON public.contracts
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND (business_id = (SELECT auth.uid()) OR talent_id = (SELECT auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.conversations AS c
      WHERE c.id = conversation_id
        AND c.business_id = contracts.business_id
        AND c.talent_id = contracts.talent_id
        AND (c.business_id = (SELECT auth.uid()) OR c.talent_id = (SELECT auth.uid()))
    )
  );

DROP POLICY IF EXISTS contracts_update_party ON public.contracts;
CREATE POLICY contracts_update_party ON public.contracts
  FOR UPDATE TO authenticated
  USING (business_id = (SELECT auth.uid()) OR talent_id = (SELECT auth.uid()))
  WITH CHECK (business_id = (SELECT auth.uid()) OR talent_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS payments_select_party ON public.payments;
CREATE POLICY payments_select_party ON public.payments
  FOR SELECT TO authenticated
  USING (payer_id = (SELECT auth.uid()) OR payee_id = (SELECT auth.uid()));

GRANT SELECT, INSERT, UPDATE ON public.contracts TO authenticated;
GRANT SELECT ON public.payments TO authenticated;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ensure_conversation(
  p_business_id uuid,
  p_talent_id uuid,
  p_subject text,
  p_request_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  uid uuid := auth.uid();
  conv_id uuid;
  subject text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_business_id IS NULL OR p_talent_id IS NULL OR p_business_id = p_talent_id THEN
    RAISE EXCEPTION 'cannot_contact_self' USING ERRCODE = '42501';
  END IF;
  IF uid <> p_business_id AND uid <> p_talent_id THEN
    RAISE EXCEPTION 'not_a_party' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_role(p_business_id, 'business') OR NOT public.is_role(p_talent_id, 'talent') THEN
    RAISE EXCEPTION 'conversation_roles_invalid' USING ERRCODE = '42501';
  END IF;

  IF p_request_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.requests AS r
    WHERE r.id = p_request_id AND r.business_id = p_business_id
  ) THEN
    p_request_id := NULL;
  END IF;

  subject := left(btrim(coalesce(p_subject, '')), 120);
  IF char_length(subject) < 1 THEN
    subject := '合作洽詢';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_business_id::text || ':' || p_talent_id::text)::bigint);

  SELECT c.id INTO conv_id
  FROM public.conversations AS c
  WHERE c.business_id = p_business_id AND c.talent_id = p_talent_id
  ORDER BY c.updated_at DESC
  LIMIT 1;

  IF conv_id IS NULL THEN
    INSERT INTO public.conversations (business_id, talent_id, subject, request_id)
    VALUES (p_business_id, p_talent_id, subject, p_request_id)
    RETURNING id INTO conv_id;
  ELSIF p_request_id IS NOT NULL THEN
    UPDATE public.conversations
    SET request_id = coalesce(request_id, p_request_id)
    WHERE id = conv_id;
  END IF;

  RETURN conv_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_test_payment(
  p_contract_id uuid,
  p_milestone_index integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  uid uuid := auth.uid();
  c public.contracts%ROWTYPE;
  elem jsonb;
  amount integer;
  existing public.payments%ROWTYPE;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO c FROM public.contracts WHERE id = p_contract_id;
  IF NOT FOUND OR c.business_id <> uid THEN
    RAISE EXCEPTION 'contract_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF c.status <> 'agreed' OR c.business_agreed_at IS NULL OR c.talent_agreed_at IS NULL THEN
    RAISE EXCEPTION 'contract_not_agreed' USING ERRCODE = '42501';
  END IF;

  IF p_milestone_index IS NULL THEN
    amount := c.price;
  ELSE
    IF p_milestone_index < 0 OR p_milestone_index >= jsonb_array_length(c.milestones) THEN
      RAISE EXCEPTION 'invalid_milestone' USING ERRCODE = '22023';
    END IF;
    elem := c.milestones -> p_milestone_index;
    amount := NULLIF(elem ->> 'amount', '')::integer;
    IF amount IS NULL OR amount < 0 THEN
      RAISE EXCEPTION 'invalid_milestone' USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT * INTO existing
  FROM public.payments
  WHERE contract_id = p_contract_id
    AND provider = 'test'
    AND status IN ('test_pending', 'test_paid')
    AND milestone_index IS NOT DISTINCT FROM p_milestone_index
  ORDER BY created_at DESC
  LIMIT 1;

  IF existing.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'id', existing.id,
      'status', existing.status,
      'amount', existing.amount,
      'currency', existing.currency,
      'provider', existing.provider,
      'milestone_index', existing.milestone_index
    );
  END IF;

  INSERT INTO public.payments (
    contract_id, milestone_index, payer_id, payee_id, amount, currency, status, provider
  ) VALUES (
    c.id, p_milestone_index, c.business_id, c.talent_id, amount, 'TWD', 'test_pending', 'test'
  )
  RETURNING * INTO existing;

  RETURN jsonb_build_object(
    'id', existing.id,
    'status', existing.status,
    'amount', existing.amount,
    'currency', existing.currency,
    'provider', existing.provider,
    'milestone_index', existing.milestone_index
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.confirm_test_payment(p_payment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  uid uuid := auth.uid();
  row public.payments%ROWTYPE;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO row FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF row.payer_id <> uid THEN
    RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'P0002';
  END IF;
  -- Hosted providers must be confirmed by a future server callback, never here.
  IF row.provider <> 'test' THEN
    RAISE EXCEPTION 'payment_confirmation_requires_provider' USING ERRCODE = '42501';
  END IF;

  IF row.status = 'test_pending' THEN
    UPDATE public.payments
    SET status = 'test_paid', provider_ref = coalesce(provider_ref, 'test-mode')
    WHERE id = row.id
    RETURNING * INTO row;
  ELSIF row.status <> 'test_paid' THEN
    RAISE EXCEPTION 'payment_not_confirmable' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'id', row.id,
    'status', row.status,
    'amount', row.amount,
    'currency', row.currency,
    'provider', row.provider,
    'milestone_index', row.milestone_index
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.ensure_conversation(uuid, uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_test_payment(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_test_payment(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.ensure_conversation(uuid, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_test_payment(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_test_payment(uuid) TO authenticated;
