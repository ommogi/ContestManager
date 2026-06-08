-- 0047_email_logs.sql
-- Audit trail for all transactional emails.

CREATE TABLE IF NOT EXISTS public.email_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    to_address TEXT NOT NULL,
    template TEXT NOT NULL,
    subject TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'pending',
    provider_message_id TEXT,
    error TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_logs_to_address_idx ON public.email_logs(to_address);
CREATE INDEX IF NOT EXISTS email_logs_template_idx ON public.email_logs(template);
CREATE INDEX IF NOT EXISTS email_logs_status_idx ON public.email_logs(status);
CREATE INDEX IF NOT EXISTS email_logs_created_at_idx ON public.email_logs(created_at);

ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Service role can manage email_logs"
  ON public.email_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
