-- Rollback 068: toglie note e cronologia degli interventi registrati.
-- Le correzioni già salvate (durata, ricambi, data, testo, allegati)
-- restano: stanno nelle colonne di sempre. Si perdono solo le note
-- aggiunte dopo e la cronologia di chi ha cambiato cosa.
ALTER TABLE public.maintenance_logs DROP COLUMN IF EXISTS extra_data;
