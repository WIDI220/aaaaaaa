-- Employees table
CREATE TABLE IF NOT EXISTS public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kuerzel text NOT NULL UNIQUE,
  name text NOT NULL,
  gewerk text NOT NULL CHECK (gewerk IN ('Hochbau','Elektro')),
  aktiv boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Tickets table
CREATE TABLE IF NOT EXISTS public.tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  a_nummer text NOT NULL UNIQUE,
  gewerk text NOT NULL CHECK (gewerk IN ('Hochbau','Elektro')),
  status text NOT NULL DEFAULT 'in_bearbeitung'
    CHECK (status IN ('in_bearbeitung','erledigt','zur_unterschrift','abrechenbar','abgerechnet')),
  eingangsdatum date,
  beschreibung text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Time entries table
CREATE TABLE IF NOT EXISTS public.time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid REFERENCES public.tickets(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.employees(id),
  stunden numeric NOT NULL CHECK (stunden > 0),
  beschreibung text,
  created_at timestamptz DEFAULT now()
);

-- Status history table
CREATE TABLE IF NOT EXISTS public.status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid REFERENCES public.tickets(id) ON DELETE CASCADE,
  old_status text,
  new_status text NOT NULL,
  changed_by uuid REFERENCES auth.users(id),
  changed_at timestamptz DEFAULT now()
);

-- Ticket notes table
CREATE TABLE IF NOT EXISTS public.ticket_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid REFERENCES public.tickets(id) ON DELETE CASCADE,
  note text NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Import runs table
CREATE TABLE IF NOT EXISTS public.import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  typ text NOT NULL CHECK (typ IN ('excel','pdf')),
  filename text,
  file_hash text,
  rows_total int DEFAULT 0,
  inserted int DEFAULT 0,
  updated int DEFAULT 0,
  skipped_duplicates int DEFAULT 0,
  failed int DEFAULT 0,
  worklogs_created int DEFAULT 0,
  pages_expected int DEFAULT 0,
  pages_saved int DEFAULT 0,
  pages_review int DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- PDF page results table
CREATE TABLE IF NOT EXISTS public.pdf_page_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_run_id uuid REFERENCES public.import_runs(id) ON DELETE CASCADE,
  page_number int NOT NULL,
  hash_unique text NOT NULL UNIQUE,
  a_nummer_raw text,
  a_nummer_matched text,
  mitarbeiter_raw text,
  mitarbeiter_matched text,
  stunden numeric,
  leistungsdatum date,
  konfidenz numeric,
  raw_ocr_text text,
  status text DEFAULT 'review' CHECK (status IN ('saved','review','failed')),
  review_reason text,
  needs_review boolean DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Ticket worklogs table
CREATE TABLE IF NOT EXISTS public.ticket_worklogs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid REFERENCES public.tickets(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.employees(id),
  stunden numeric,
  leistungsdatum date,
  pdf_page_result_id uuid UNIQUE REFERENCES public.pdf_page_results(id),
  created_at timestamptz DEFAULT now()
);

-- User roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role text NOT NULL CHECK (role IN ('user','admin')),
  UNIQUE(user_id, role)
);

-- Profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  display_name text
);

-- Escalation settings table
CREATE TABLE IF NOT EXISTS public.escalation_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL UNIQUE,
  warntage int NOT NULL DEFAULT 7
);

-- Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(p_user_id uuid, p_role text)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = p_user_id AND role = p_role
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- Enable RLS on all tables
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdf_page_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_worklogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalation_settings ENABLE ROW LEVEL SECURITY;

-- Tickets policies
CREATE POLICY "tickets_read_all" ON public.tickets FOR SELECT TO authenticated USING (true);
CREATE POLICY "tickets_insert_all" ON public.tickets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "tickets_update_all" ON public.tickets FOR UPDATE TO authenticated USING (true);
CREATE POLICY "tickets_delete_admin" ON public.tickets FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Employees policies
CREATE POLICY "employees_read_all" ON public.employees FOR SELECT TO authenticated USING (true);
CREATE POLICY "employees_insert_admin" ON public.employees FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "employees_update_admin" ON public.employees FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Time entries policies
CREATE POLICY "time_entries_read_all" ON public.time_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "time_entries_insert_all" ON public.time_entries FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "time_entries_delete_admin" ON public.time_entries FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Ticket worklogs policies
CREATE POLICY "worklogs_read_all" ON public.ticket_worklogs FOR SELECT TO authenticated USING (true);
CREATE POLICY "worklogs_insert_all" ON public.ticket_worklogs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "worklogs_delete_admin" ON public.ticket_worklogs FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Status history policies
CREATE POLICY "status_history_read_all" ON public.status_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "status_history_insert_all" ON public.status_history FOR INSERT TO authenticated WITH CHECK (true);

-- Ticket notes policies
CREATE POLICY "notes_read_all" ON public.ticket_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "notes_insert_all" ON public.ticket_notes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "notes_delete_admin" ON public.ticket_notes FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Import runs policies
CREATE POLICY "imports_read_all" ON public.import_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "imports_insert_all" ON public.import_runs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "imports_update_own" ON public.import_runs FOR UPDATE TO authenticated USING (created_by = auth.uid());

-- PDF page results policies
CREATE POLICY "pdf_read_all" ON public.pdf_page_results FOR SELECT TO authenticated USING (true);
CREATE POLICY "pdf_insert_all" ON public.pdf_page_results FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "pdf_update_own" ON public.pdf_page_results FOR UPDATE TO authenticated USING (created_by = auth.uid());
CREATE POLICY "pdf_delete_admin" ON public.pdf_page_results FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- User roles policies
CREATE POLICY "roles_read_own" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Profiles policies
CREATE POLICY "profiles_read_all" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

-- Escalation settings policies
CREATE POLICY "escalation_read_all" ON public.escalation_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "escalation_update_admin" ON public.escalation_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "escalation_insert_admin" ON public.escalation_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Trigger for profile creation on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Update trigger for tickets
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_tickets_updated_at
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Insert default escalation settings
INSERT INTO public.escalation_settings (status, warntage) VALUES
  ('in_bearbeitung', 7),
  ('erledigt', 14),
  ('zur_unterschrift', 7),
  ('abrechenbar', 30),
  ('abgerechnet', 999)
ON CONFLICT (status) DO NOTHING;