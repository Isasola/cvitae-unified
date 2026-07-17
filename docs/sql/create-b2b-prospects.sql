-- Tabla b2b_prospects
-- Ejecutar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS b2b_prospects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name text NOT NULL,
  email text NOT NULL,
  contact_name text,
  status text NOT NULL DEFAULT 'pending',  -- pending | invited | activated
  token text,
  notes text,
  invited_at timestamptz,
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: solo service role puede leer/escribir
ALTER TABLE b2b_prospects ENABLE ROW LEVEL SECURITY;

-- Agregar columna a recruiter_tokens si falta
ALTER TABLE recruiter_tokens ADD COLUMN IF NOT EXISTS plan_type text DEFAULT 'starter';

-- Insertar los 5 prospects de la encuesta (reemplazar con datos reales)
-- INSERT INTO b2b_prospects (company_name, email, contact_name, notes)
-- VALUES
--   ('Empresa 1', 'empresa1@example.com', 'Nombre Contacto', 'Encuesta Google Form'),
--   ('Empresa 2', 'empresa2@example.com', 'Nombre Contacto', 'Encuesta Google Form'),
--   ('Empresa 3', 'empresa3@example.com', 'Nombre Contacto', 'Encuesta Google Form'),
--   ('Empresa 4', 'empresa4@example.com', 'Nombre Contacto', 'Encuesta Google Form'),
--   ('Empresa 5', 'empresa5@example.com', 'Nombre Contacto', 'Encuesta Google Form');
