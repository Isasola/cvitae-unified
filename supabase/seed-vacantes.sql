-- ============================================================
-- CVitae — Seed de vacantes de ejemplo
-- Ejecutar en: Supabase Studio → SQL Editor
-- Tabla requerida: recruiter_vacancies (ver create-tables.sql)
-- ============================================================

INSERT INTO recruiter_vacancies (
  title, description, requirements, location, modality,
  salary_range, company, slug, recruiter_token_id, is_active
) VALUES
(
  'Desarrollador Frontend React',
  'Buscamos un desarrollador frontend apasionado por crear experiencias de usuario excepcionales. Trabajarás en un producto SaaS en crecimiento, colaborando con diseñadores y desarrolladores backend en un equipo ágil y dinámico.',
  '2+ años de experiencia con React y hooks. TypeScript. Tailwind CSS o CSS-in-JS. Git y metodologías ágiles. Se valorará experiencia con Vite, Supabase o AWS.',
  'Asunción, Paraguay',
  'Remoto',
  'Gs. 4.000.000 – 6.000.000 / mes',
  'CVitae',
  'desarrollador-frontend-react-demo01',
  NULL,
  true
),
(
  'Analista Contable',
  'Empresa comercial en expansión busca Analista Contable para gestionar la contabilidad general, liquidación de impuestos y reportes financieros mensuales. Ambiente de trabajo profesional con posibilidad de crecimiento.',
  'Contador Público titulado o estudiante avanzado. Manejo de NIIF. Excel avanzado (tablas dinámicas, fórmulas complejas). Conocimiento de RUPE y SICA. Mínimo 1 año de experiencia en posición similar.',
  'Asunción, Paraguay',
  'Presencial',
  'A convenir según experiencia',
  'CVitae',
  'analista-contable-demo02',
  NULL,
  true
),
(
  'Jefe de Producción Industrial',
  'Empresa del sector alimenticio busca Jefe de Producción para liderar el equipo de planta y asegurar el cumplimiento de los estándares de calidad e inocuidad. Reporte directo a Gerencia de Operaciones.',
  'Ingeniería Industrial, de Alimentos o afín. Certificación o experiencia comprobable en HACCP y BPM. Liderazgo de equipos de 15+ personas. Conocimiento de indicadores OEE, eficiencia y merma. Disponibilidad para trabajo en turnos.',
  'Departamento Central, Paraguay',
  'Híbrido',
  'Gs. 6.500.000 – 9.000.000 / mes',
  'CVitae',
  'jefe-produccion-industrial-demo03',
  NULL,
  true
);
