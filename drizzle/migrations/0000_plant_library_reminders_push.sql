CREATE TABLE public.care_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  plant_id uuid REFERENCES public.plants(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'water',
  title text NOT NULL DEFAULT '',
  next_due_at timestamptz NOT NULL,
  frequency_days integer NOT NULL DEFAULT 7,
  amount_ml integer,
  enabled boolean NOT NULL DEFAULT true,
  last_completed_at timestamptz,
  last_notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.care_reminders TO authenticated;
GRANT ALL ON public.care_reminders TO service_role;
ALTER TABLE public.care_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY care_reminders_all_own ON public.care_reminders FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX care_reminders_due_idx ON public.care_reminders (next_due_at) WHERE enabled;
CREATE INDEX care_reminders_user_idx ON public.care_reminders (user_id);
CREATE TRIGGER care_reminders_set_updated_at BEFORE UPDATE ON public.care_reminders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY push_subs_all_own ON public.push_subscriptions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.watering_schedules IS 'DEPRECATED: replaced by care_reminders';

CREATE POLICY plant_photos_select_own ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'plant-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY plant_photos_insert_own ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'plant-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY plant_photos_update_own ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'plant-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY plant_photos_delete_own ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'plant-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;