-- lovable-cron-fallback-reviewed: reminders are user-set future times across many rows; no delay-until provider is available, so a 15-minute sweep that only calls the app when reminders are due is the fallback.
CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS app_private.config (key text PRIMARY KEY, value text NOT NULL);
REVOKE ALL ON app_private.config FROM PUBLIC, anon, authenticated;
INSERT INTO app_private.config (key, value) VALUES ('reminder_cron_token', encode(extensions.gen_random_bytes(32), 'hex')) ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.verify_reminder_cron_token(_token text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app_private, public AS $$
  SELECT EXISTS (SELECT 1 FROM app_private.config WHERE key = 'reminder_cron_token' AND value = _token)
$$;
REVOKE EXECUTE ON FUNCTION public.verify_reminder_cron_token(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_reminder_cron_token(text) TO service_role;

CREATE OR REPLACE FUNCTION app_private.fire_reminder_cron()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = app_private, public AS $$
DECLARE tok text; u text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.care_reminders WHERE enabled AND next_due_at <= now() AND (last_notified_at IS NULL OR last_notified_at < next_due_at)) THEN RETURN; END IF;
  SELECT value INTO tok FROM app_private.config WHERE key = 'reminder_cron_token';
  FOREACH u IN ARRAY ARRAY['https://project--fbfd8d9f-e7ff-4089-b2d9-1632f488ca91.lovable.app','https://project--fbfd8d9f-e7ff-4089-b2d9-1632f488ca91-dev.lovable.app'] LOOP
    PERFORM net.http_post(url := u || '/api/public/cron/reminders', headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || tok), body := '{}'::jsonb);
  END LOOP;
END $$;

SELECT cron.schedule('care-reminders-sweep', '*/15 * * * *', 'SELECT app_private.fire_reminder_cron()');