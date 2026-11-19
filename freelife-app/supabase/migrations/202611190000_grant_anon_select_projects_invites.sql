-- Already applied on the live project under the migration name
-- `grant_anon_select_projects_invites`. Kept here for the repository record only.
-- Do NOT re-apply this file.
--
-- Purpose: existing profiles RLS (`profiles_select_marketplace`) subqueries
-- `projects` and `invites`. Anon lacked table GRANT SELECT, so public
-- `profiles` reads (including embeds from talent_profiles) returned 42501.
-- These grants let anonymous readers use the existing policy; RLS still
-- hides non-marketplace rows.

GRANT SELECT ON TABLE public.projects TO anon;
GRANT SELECT ON TABLE public.invites TO anon;
