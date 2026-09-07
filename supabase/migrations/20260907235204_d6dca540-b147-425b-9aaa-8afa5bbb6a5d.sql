CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  display_name text NOT NULL DEFAULT '',
  avatar_url text,
  reminders_enabled boolean NOT NULL DEFAULT true,
  reminder_time time NOT NULL DEFAULT '08:00',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_delete_own" ON public.profiles FOR DELETE TO authenticated USING (auth.uid() = id);
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.plants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  variety text,
  location text,
  image_url text,
  health_status text NOT NULL DEFAULT 'healthy' CHECK (health_status IN ('healthy', 'watch', 'attention')),
  sunlight text,
  soil text,
  humidity text,
  watering_advice text,
  care_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plants TO authenticated;
GRANT ALL ON public.plants TO service_role;
ALTER TABLE public.plants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plants_select_own" ON public.plants FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "plants_insert_own" ON public.plants FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "plants_update_own" ON public.plants FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "plants_delete_own" ON public.plants FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX plants_user_id_idx ON public.plants(user_id);
CREATE TRIGGER plants_set_updated_at BEFORE UPDATE ON public.plants FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.watering_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  plant_id uuid NOT NULL REFERENCES public.plants(id) ON DELETE CASCADE,
  next_watering_at timestamptz NOT NULL,
  frequency_days integer NOT NULL DEFAULT 7 CHECK (frequency_days > 0),
  amount_ml integer CHECK (amount_ml IS NULL OR amount_ml > 0),
  reminders_enabled boolean NOT NULL DEFAULT true,
  last_completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plant_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.watering_schedules TO authenticated;
GRANT ALL ON public.watering_schedules TO service_role;
ALTER TABLE public.watering_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "watering_select_own" ON public.watering_schedules FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "watering_insert_own" ON public.watering_schedules FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "watering_update_own" ON public.watering_schedules FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "watering_delete_own" ON public.watering_schedules FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX watering_user_due_idx ON public.watering_schedules(user_id, next_watering_at);
CREATE TRIGGER watering_set_updated_at BEFORE UPDATE ON public.watering_schedules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.diagnoses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  plant_id uuid REFERENCES public.plants(id) ON DELETE SET NULL,
  image_url text,
  disease_name text NOT NULL,
  certainty integer NOT NULL CHECK (certainty BETWEEN 0 AND 100),
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('analyzing', 'completed', 'failed')),
  recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.diagnoses TO authenticated;
GRANT ALL ON public.diagnoses TO service_role;
ALTER TABLE public.diagnoses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "diagnoses_select_own" ON public.diagnoses FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "diagnoses_insert_own" ON public.diagnoses FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "diagnoses_update_own" ON public.diagnoses FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "diagnoses_delete_own" ON public.diagnoses FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX diagnoses_user_created_idx ON public.diagnoses(user_id, created_at DESC);
CREATE TRIGGER diagnoses_set_updated_at BEFORE UPDATE ON public.diagnoses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'display_name', split_part(COALESCE(NEW.email, ''), '@', 1)), NEW.raw_user_meta_data ->> 'avatar_url')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();