-- 0050_members_with_invitation_status.sql
-- Extend get_contest_members_with_avatar() to return invitation status
-- so the UI can show pending/accepted/rejected badges and offer resend/cancel.

DROP FUNCTION IF EXISTS public.get_contest_members_with_avatar(uuid);

CREATE OR REPLACE FUNCTION public.get_contest_members_with_avatar(p_contest_id uuid)
RETURNS TABLE(
  id uuid,
  contest_id uuid,
  user_id uuid,
  full_name text,
  email text,
  role text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  avatar_url text,
  invitation_status text,
  invitation_token text,
  invited_at timestamp with time zone,
  responded_at timestamp with time zone
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    cm.id,
    cm.contest_id,
    cm.user_id,
    cm.full_name,
    cm.email,
    cm.role::text,
    cm.created_at,
    cm.updated_at,
    p.avatar_url,
    cm.invitation_status::text,
    cm.invitation_token,
    cm.invited_at,
    cm.responded_at
  FROM contest_members cm
  LEFT JOIN auth.users u ON lower(u.email) = lower(cm.email)
  LEFT JOIN profiles p ON p.id = u.id
  WHERE cm.contest_id = p_contest_id
  ORDER BY cm.role, cm.created_at;
$function$;
