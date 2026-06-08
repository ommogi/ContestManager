-- judge_pool_invitations: invitation flow for adding judges to an organization's pool
CREATE TABLE judge_pool_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  specialty TEXT,
  invitation_token TEXT UNIQUE NOT NULL DEFAULT encode(extensions.gen_random_bytes(16), 'hex'),
  invitation_status TEXT NOT NULL DEFAULT 'pending' CHECK (invitation_status IN ('pending', 'accepted', 'rejected')),
  invited_by UUID REFERENCES auth.users(id),
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_judge_pool_invitations_org ON judge_pool_invitations(organization_id);
CREATE INDEX idx_judge_pool_invitations_token ON judge_pool_invitations(invitation_token);
CREATE INDEX idx_judge_pool_invitations_email ON judge_pool_invitations(email);

-- RLS: disable direct client access; only service_role or explicit API
ALTER TABLE judge_pool_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "judge_pool_invitations_select_own"
  ON judge_pool_invitations
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    )
  );

-- Trigger: auto-updates responded_at on status change
CREATE OR REPLACE FUNCTION update_judge_pool_invitation_responded_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invitation_status <> OLD.invitation_status AND NEW.invitation_status IN ('accepted', 'rejected') THEN
    NEW.responded_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER judge_pool_invitation_responded_at_trigger
  BEFORE UPDATE ON judge_pool_invitations
  FOR EACH ROW
  EXECUTE FUNCTION update_judge_pool_invitation_responded_at();

-- Trigger: notify invited user when a pool invitation is created
CREATE OR REPLACE FUNCTION notify_judge_pool_invited()
RETURNS TRIGGER AS $$
DECLARE
  target_user_id UUID;
BEGIN
  -- Try to resolve user by email
  SELECT id INTO target_user_id
  FROM auth.users
  WHERE email = NEW.email
  LIMIT 1;

  IF target_user_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, title, body, payload)
    VALUES (
      target_user_id,
      'judge_pool_invitation',
      'Invitación al pool de jurados',
      format('Has sido invitado al pool de jurados de una organización. Revisa tu correo para aceptar o rechazar.'),
      jsonb_build_object(
        'organization_id', NEW.organization_id,
        'invitation_token', NEW.invitation_token,
        'email', NEW.email
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER notify_judge_pool_invited_trigger
  AFTER INSERT ON judge_pool_invitations
  FOR EACH ROW
  EXECUTE FUNCTION notify_judge_pool_invited();
