-- Rollback della 070: toglie il contorno delle aree.
-- Si perdono i contorni corretti o creati dalla mappa: se servono, prima
-- salva il risultato di
--   SELECT id, name, color, map_shape FROM public.areas WHERE map_shape IS NOT NULL;
-- Senza la colonna la mappa torna ai contorni del codice, agganciati per nome.

-- I colori di prima, solo dove nessuno li ha cambiati dopo la 070.
UPDATE public.areas a
   SET color = v.old_color, updated_at = now()
  FROM (VALUES
  ('Sala Cottura', '#e0904a', '#ef4444'),
  ('Cantina', '#9a8cff', '#7c6aff'),
  ('Confezionamento', '#ef6a62', '#ef4444'),
  ('Ausiliari', '#d9be4a', '#ef4444'),
  ('Depurazione', '#33c1d6', '#06b6d4')
  ) AS v(name, new_color, old_color)
 WHERE a.org_id = 'default' AND a.name = v.name AND a.color = v.new_color;

ALTER TABLE public.areas DROP CONSTRAINT IF EXISTS areas_map_shape_polys;
ALTER TABLE public.areas DROP COLUMN IF EXISTS map_shape;
