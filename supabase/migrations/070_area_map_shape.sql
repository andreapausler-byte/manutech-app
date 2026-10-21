-- ╔══════════════════════════════════════════════════════════════╗
-- ║  070 — Mappa impianto: il contorno di ogni area               ║
-- ║                                                                ║
-- ║  Con la 069 il punto è diventato un dato della macchina; qui  ║
-- ║  il contorno diventa un dato dell'area. Prima stava nel       ║
-- ║  codice (lib/plantMap/amarcord.js) e si agganciava all'area   ║
-- ║  per nome: rinominarla la staccava dalla mappa, e correggerlo ║
-- ║  voleva dire chiamare uno sviluppatore. Ora lo correggono gli ║
-- ║  admin dalla mappa (modalità «Aree»), e ne creano di nuove.   ║
-- ║                                                                ║
-- ║    areas.map_shape = {                                        ║
-- ║      polys: [[[x, y], ...], ...],  -- uno o più pezzi, mm DWG ║
-- ║      label: [x, y],                -- dove sta il chip        ║
-- ║      basis, updated_at, updated_by, updated_by_name           ║
-- ║    }                                                          ║
-- ║                                                                ║
-- ║  Si scrive con l'update diretto di Macchinari: areas_update   ║
-- ║  è già admin-only (023), nessuna funzione nuova.              ║
-- ║                                                                ║
-- ║  Contorni iniziali di Birra Amarcord, con Sala Cottura e      ║
-- ║  Cantina riviste il 21/10/2026 (la parte nord dell'edificio   ║
-- ║  cottura e i due BBT esterni sono cantina; i serbatoi acqua e ║
-- ║  acqua calda sono sala cottura). `areas.color` prende il      ║
-- ║  colore della mappa: Macchinari e mappa usano lo stesso.      ║
-- ║                                                                ║
-- ║  Rieseguibile: la colonna e il vincolo si aggiungono se       ║
-- ║  mancano, i contorni iniziali non toccano un'area che ne ha   ║
-- ║  già uno.                                                     ║
-- ╚══════════════════════════════════════════════════════════════╝

ALTER TABLE public.areas
  ADD COLUMN IF NOT EXISTS map_shape JSONB DEFAULT NULL;

COMMENT ON COLUMN public.areas.map_shape IS
  'Contorno sulla mappa impianto: {polys: [[[x, y], ...], ...] (mm, coordinate DWG), label: [x, y], basis, updated_at, updated_by, updated_by_name}. v5.36';

-- Un freno, non una validazione: un contorno senza `polys` è un errore
-- del client, e la mappa lo leggerebbe come "da disegnare". COALESCE
-- perché senza la chiave jsonb_typeof è NULL, e un CHECK NULL passa.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'areas_map_shape_polys') THEN
    ALTER TABLE public.areas ADD CONSTRAINT areas_map_shape_polys
      CHECK (map_shape IS NULL OR COALESCE(jsonb_typeof(map_shape->'polys'), '') = 'array');
  END IF;
END $$;


-- ─── Contorni iniziali (Birra Amarcord, Apecchio) ──────────────
-- Gli stessi di AREAS in lib/plantMap/amarcord.js, che resta il ripiego
-- per il demo. Su un database che non ha queste aree non cambia nulla.

UPDATE public.areas a
   SET map_shape = v.shape::jsonb || jsonb_build_object('basis', v.basis),
       color = v.color,
       updated_at = now()
  FROM (VALUES
  ('Sala Cottura', '#e0904a', 'Dalla planimetria, rivista il 21/10/2026', '{"polys":[[[52300,72600],[69300,72600],[69300,98000],[58000,98000],[58000,107600],[52300,107600]],[[58000,107700],[66600,107700],[66600,115500],[58000,115500]]],"label":[61000,95500]}'),
  ('Cantina', '#9a8cff', 'Dalla planimetria, rivista il 21/10/2026', '{"polys":[[[58000,98000],[69300,98000],[69300,107700],[98800,107700],[98800,117000],[66600,117000],[66600,107700],[58000,107700]],[[101500,107700],[117800,107700],[117800,112300],[101500,112300]],[[65800,68600],[72600,68600],[72600,72100],[77900,72100],[77900,77500],[69300,77500],[69300,72600],[65800,72600]]],"label":[82000,115500]}'),
  ('Confezionamento', '#ef6a62', 'Dalla planimetria', '{"polys":[[[69300,77500],[98000,77500],[98000,72100],[118800,72100],[118800,100000],[100500,100000],[100500,107600],[69300,107600]]],"label":[93000,92500]}'),
  ('Ausiliari', '#d9be4a', 'Dalla planimetria', '{"polys":[[[90700,119600],[121300,119600],[121300,127900],[90700,127900]],[[103000,112300],[118800,112300],[118800,115000],[103000,115000]],[[77900,72500],[88100,72500],[88100,77400],[77900,77400]],[[54700,56100],[88000,56100],[88000,64000],[54700,64000]],[[122200,126300],[125700,126300],[125700,129700],[122200,129700]]],"label":[106000,129700]}'),
  ('Depurazione', '#33c1d6', 'Dalla planimetria', '{"polys":[[[129300,120500],[143200,120500],[143200,128900],[129300,128900]]],"label":[136250,130700]}')
  ) AS v(name, color, basis, shape)
 WHERE a.org_id = 'default' AND a.name = v.name AND a.map_shape IS NULL;
