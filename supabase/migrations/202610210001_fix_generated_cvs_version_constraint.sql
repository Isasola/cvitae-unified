-- BUG-003: drop UNIQUE(user_id, vacancy_id) constraint on generated_cvs
-- This constraint blocks saving a second CV version per vacancy (CVRewrite "Versiones" tab shows empty).
-- Multiple versions per vacancy are the intended behavior for CVRewrite.
ALTER TABLE generated_cvs DROP CONSTRAINT IF EXISTS generated_cvs_user_vacancy;
