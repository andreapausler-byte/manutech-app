-- ╔══════════════════════════════════════════════════════════════╗
-- ║  069 — Mappa impianto: dove sta ogni macchina                 ║
-- ║                                                                ║
-- ║  La mappa (v5.35) disegna la planimetria dello stabilimento   ║
-- ║  e mette un punto per macchina, colorato dai ticket aperti.   ║
-- ║  La posizione è un dato della macchina, come la foto:         ║
-- ║                                                                ║
-- ║    machines.map_position = {                                  ║
-- ║      x, y,            -- mm, nel sistema del disegno DWG      ║
-- ║      conf,            -- da dove viene (vedi sotto)           ║
-- ║      basis,           -- su cosa si basa, in parole           ║
-- ║      updated_at, updated_by, updated_by_name                  ║
-- ║    }                                                          ║
-- ║                                                                ║
-- ║  conf: dwg (dal disegno) · layout (dal layout Beertec) ·      ║
-- ║  media (probabile) · stimata · area (riferimento d'area) ·    ║
-- ║  confermata (messa a mano da qualcuno sulla mappa).           ║
-- ║                                                                ║
-- ║  - set_machine_map_position() — sposta o conferma un punto    ║
-- ║  - le 41 posizioni ricavate dalla planimetria (ott 2026)      ║
-- ║                                                                ║
-- ║  Rieseguibile: la colonna si aggiunge se manca, la funzione   ║
-- ║  si riscrive, le posizioni iniziali non toccano una macchina  ║
-- ║  che ne ha già una.                                           ║
-- ╚══════════════════════════════════════════════════════════════╝

ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS map_position JSONB DEFAULT NULL;

COMMENT ON COLUMN public.machines.map_position IS
  'Posizione sulla mappa impianto: {x, y (mm, coordinate DWG), conf, basis, updated_at, updated_by, updated_by_name}. v5.35';


-- ─── Sposta o conferma un punto ────────────────────────────────
-- SECURITY DEFINER come add_machine_attachment (061): machines_update
-- è admin-only, ma chi sa dove sta davvero una macchina è il tecnico
-- che ci passa davanti ogni giorno. Operatori esclusi: la mappa la
-- leggono, non la correggono.
--
-- Con _x e _y il punto si sposta lì; senza, si conferma dov'è. In
-- entrambi i casi diventa 'confermata': una posizione messa a mano
-- vale più di una stima dal disegno.
--
-- Cosa decide il server: chi, quando, l'org della macchina.
-- Il limite di 1 km sulle coordinate è un freno, non una regola: un
-- punto fuori dal disegno è un errore di trascinamento.

CREATE OR REPLACE FUNCTION public.set_machine_map_position(
  _machine_id UUID,
  _x NUMERIC DEFAULT NULL,
  _y NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org     TEXT;
  v_role    TEXT;
  v_user_id UUID;
  v_name    TEXT;
  v_found   BOOLEAN;
  v_old     JSONB;
  v_new     JSONB;
BEGIN
  SELECT u.id, u.org_id, u.role, u.name INTO v_user_id, v_org, v_role, v_name
    FROM public.users u WHERE u.auth_id = auth.uid() LIMIT 1;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Profilo non trovato'; END IF;
  IF v_role NOT IN ('admin', 'tecnico') THEN
    RAISE EXCEPTION 'Solo admin e tecnici possono spostare le macchine sulla mappa';
  END IF;

  -- La macchina deve essere della mia org: senza questo controllo il
  -- DEFINER scriverebbe anche sulle altre.
  SELECT true, m.map_position INTO v_found, v_old
    FROM public.machines m
   WHERE m.id = _machine_id AND m.org_id = v_org;
  IF v_found IS NULL THEN RAISE EXCEPTION 'Macchinario non trovato'; END IF;

  IF (_x IS NULL) <> (_y IS NULL) THEN
    RAISE EXCEPTION 'Servono entrambe le coordinate';
  END IF;

  IF _x IS NULL THEN
    IF v_old IS NULL OR v_old->>'x' IS NULL THEN
      RAISE EXCEPTION 'La macchina non è ancora sulla mappa';
    END IF;
    v_new := v_old;
  ELSE
    IF abs(_x) > 1000000 OR abs(_y) > 1000000 THEN
      RAISE EXCEPTION 'Posizione fuori dalla planimetria';
    END IF;
    v_new := COALESCE(v_old, '{}'::jsonb) || jsonb_build_object(
      'x', round(_x), 'y', round(_y),
      'basis', 'Posizionata a mano sulla mappa'
    );
  END IF;

  v_new := v_new || jsonb_build_object(
    'conf', 'confermata',
    'updated_at', now(),
    'updated_by', v_user_id,
    'updated_by_name', v_name
  );

  UPDATE public.machines SET map_position = v_new
   WHERE id = _machine_id AND org_id = v_org;

  RETURN v_new;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_machine_map_position(UUID, NUMERIC, NUMERIC) TO authenticated;


-- ─── Posizioni iniziali (Birra Amarcord, Apecchio) ─────────────
-- Ricavate dalla planimetria DWG e dal layout Beertec nella mappa
-- costruita su claude.ai il 16/10/2026. Le stime (stimata, media,
-- area) sono punti tratteggiati sulla mappa: chi passa davanti alla
-- macchina li corregge o li conferma.
-- Su un database che non ha queste macchine non cambia nulla.

UPDATE public.machines m
   SET map_position = jsonb_build_object('x', v.x, 'y', v.y, 'conf', v.conf, 'basis', v.basis)
       || CASE WHEN v.at IS NULL THEN '{}'::jsonb
               ELSE jsonb_build_object('updated_at', v.at) END
  FROM (VALUES
  -- Sala Cottura
  ('bd562716-cd92-48cf-ad9a-3f5718d10c4d', 55520, 88446, 'confermata', 'Posizionata a mano sulla mappa', '2026-10-16T14:37:36.357Z'),  -- Molino a UMIDO GEA
  ('f5396709-63b3-4941-8db9-8cd31f0c653b', 63500, 90500, 'area', 'Punto di riferimento generico della sala cottura', NULL),  -- Sala cottura
  ('22ea06fd-131b-4d29-9ebd-f452533a3dd3', 60860, 86540, 'media', 'Tino con fondo filtrante a griglia', NULL),  -- Tino Filtro (Lauter Tun)
  -- Cantina
  ('98740021-50a0-400e-a94c-0b8920bf058b', 81500, 111500, 'area', 'Punto di riferimento generico del parco serbatoi esterno', NULL),  -- Cantina
  ('b7b7ab76-48f3-4597-8927-f43ede8d41e7', 71600, 76700, 'layout', 'Etichetta "CARBOBLENDER 25-35 hl/h" nel layout Beertec', NULL),  -- CarboBlender
  ('8d596e7c-d905-4cf2-8713-623e78ebb4ee', 75000, 76650, 'layout', 'Etichetta "CENTRIFUGE" nel layout Beertec', NULL),  -- Centrifuga SPX
  ('49bd174e-7ecf-449f-9f5b-e8f63e6a9ed6', 80190, 109850, 'stimata', 'Parco serbatoi esterno: numerazione da verificare', NULL),  -- FV 14
  ('9eabb6fa-0301-4dee-921b-26a4b4b61b05', 105300, 110440, 'media', 'Uno dei tre serbatoi da Ø 4 m accanto al gruppo frigo', NULL),  -- FV 30 - 761hL
  ('cc03372e-3219-4508-8bf3-c9b2eeb140b5', 113850, 110440, 'media', 'Uno dei tre serbatoi da Ø 4 m accanto al gruppo frigo', NULL),  -- FV 32 - 761hL
  ('ae7aa140-a38f-418e-9fe7-f0f63d5cd01a', 63207, 101122, 'confermata', 'Posizionata a mano sulla mappa', '2026-10-16T14:40:05.644Z'),  -- FV1
  -- Confezionamento
  ('ca61af26-2ada-4439-91f4-75a2677bd32c', 94076, 95822, 'stimata', 'Tavola rotante con pallet a valle del nastro pallet (zona 27)', NULL),  -- Avvolgi Pallet
  ('189188f5-bf57-49b6-8180-38e3dd096893', 89400, 98200, 'stimata', 'Fine linea cartoni, tra incartonatrice e pallettizzatore', NULL),  -- Bilancia Cartoni Prisma
  ('b354c116-8212-40c4-9e1f-2a60bd741d6e', 88300, 100900, 'stimata', 'Fine linea cartoni, a monte della bilancia', NULL),  -- Chiudi Cartone Automatico
  ('f16232e3-6765-46b6-a369-a124f565229c', 105700, 82300, 'media', 'Ingresso "palette piene", uscita "palette, cappucci, falde vuote" e nastri EMS a +1100', NULL),  -- Depalletizzatore
  ('d08e8f9d-ce25-421f-9197-dc4a4a561ba1', 71550, 84930, 'stimata', 'Macchina all''uscita lato ovest del pastorizzatore', NULL),  -- Etichettatrice
  ('f641c366-6b9e-4e73-ba63-1e8aa21c66ac', 79140, 80445, 'dwg', 'Etichette "Buffer · Dosing · Pasteur" nel layout', NULL),  -- Flash Pastorizzatore KEG
  ('57357c9d-1ab5-43e7-9e95-130529be4005', 85700, 99800, 'stimata', 'Fine linea cartoni (zona 26)', NULL),  -- Formatrice Cartoni
  ('80d6a66d-cf47-461f-99a0-7c48f75f7ac9', 81440, 96890, 'media', 'Riempitrice rotativa con alimentazione a stella (zona 13)', NULL),  -- Imbottigliatrice KOSME
  ('f8c160ce-f0e4-452a-9968-6f87dd61d1b6', 87400, 96600, 'stimata', 'Fine linea cartoni (zona 26)', NULL),  -- Incartonatrice
  ('31f548cc-a776-4bf8-b898-d2a560d5270c', 101000, 89200, 'media', 'Nastri bottiglie a +1100 (tag P01–P31)', NULL),  -- Linea Nastri
  ('2ab5572f-0772-4c08-b4c2-a9f0f64edfed', 98400, 83770, 'media', 'Macchina rotativa AMS sul ramo sud dei nastri', NULL),  -- Macchina montaggio tappi (doppia)
  ('368d3b90-998d-456e-9cc3-bf58cbaf572d', 95170, 85820, 'media', 'Macchina rotativa AMS sul ramo nord dei nastri', NULL),  -- Macchina montaggio tappi (singola)
  ('8aae7568-e049-4630-b9f8-0f87f13706de', 91600, 101100, 'stimata', 'Testa del nastro pallet (zona 15)', NULL),  -- Palletizzatore
  ('4ae3bc95-8ee4-46da-a459-ca5a649ada03', 81800, 85700, 'media', 'Tunnel di circa 7 m con frecce di flusso (zona 12)', NULL),  -- Pastorizzatore TUNNEL
  ('973ec880-a057-40ba-8e7b-7f5056466731', 82000, 102200, 'stimata', 'A valle della riempitrice (zona 14)', NULL),  -- Tappatrice per tappi meccanici
  -- Ausiliari
  ('d07c0c83-0a41-4e6b-8ce1-72cd4eb281b2', 110940, 113800, 'dwg', 'Gruppo frigoriferi: tre unità affiancate', NULL),  -- Chiller HIROSS
  ('87c43a14-4632-4b0f-b0bd-490597f3f116', 118390, 124500, 'dwg', 'Vano compressori (22)', NULL),  -- Compressore ZT 37
  ('9f31b532-a0b9-4fc1-bccb-0d775baa531d', 118390, 122700, 'dwg', 'Vano compressori (22)', NULL),  -- Compressore ZT22
  ('123b85ea-f885-4cae-96f7-bc11125021e4', 81300, 74600, 'dwg', 'Sala caldaia', NULL),  -- Generatore Di Vapore
  ('95115d66-6192-4631-8a1c-1b4af2f6faf5', 104500, 121400, 'stimata', 'Impianto diffuso: indicato il vano tecnico acqua', NULL),  -- Impianto Antiincendio
  ('73ae58fb-fd23-4ad2-a7f3-8daaab738d63', 186000, 96000, 'stimata', 'Flotta mobile: indicato il magazzino', NULL),  -- Jungheinrich Moretti UGO
  ('2889c22b-cd40-4f2d-8671-201e8c159446', 84300, 76300, 'stimata', 'Rete diffusa: indicata la partenza dalla sala caldaia', NULL),  -- Linea Vapore
  ('feecf52f-ce44-418c-9144-2accc2ba515f', 108170, 123720, 'dwg', 'Vano tecnico acqua', NULL),  -- Sala Acque
  ('dbca16c7-1fb3-4135-bc9b-e1cf32435bae', 86390, 75500, 'dwg', 'Magazzino prodotti chimici (soda, acido, DESI)', NULL),  -- Sala Chimica
  ('abcf57cc-4d93-42b5-bc5c-be933098dae4', 65340, 60680, 'media', 'Serbatoio CO2 su tre piedi con evaporatore', NULL),  -- Serbatoio CO2 AIRLIQUIDS
  -- Depurazione
  ('9dca8065-aabf-436b-9dee-89a5416496e8', 140800, 122400, 'stimata', 'Interno area depuratore', NULL),  -- Centrifuga Baby3
  ('41941b70-162a-498f-b23a-af6e595f65ad', 140800, 127200, 'stimata', 'Interno area depuratore', NULL),  -- Centrifuga FP600
  ('ddb8271e-74da-4684-9e94-a8f491d0b13c', 136250, 124700, 'dwg', 'Depuratore a ciclo biologico per acque di scarico', NULL),  -- Depuratore
  ('032cd426-eb62-4580-aeba-28a62a3297a5', 131800, 122400, 'stimata', 'Interno area depuratore', NULL),  -- Soffiante Keaser
  -- Senza area
  ('c43baccd-a91f-457f-8bcf-6ac1e5cd7515', 89300, 88900, 'media', 'Accanto al "manipolatore esistente Indeva 2 teste"', NULL),  -- Infustatrice
  ('c7786bf0-82f9-4782-a91a-dbfe6400f389', 127000, 119000, 'stimata', 'Area esterna nord, vicino al depuratore', NULL)   -- Piezometro
  ) AS v(id, x, y, conf, basis, at)
 WHERE m.id::text = v.id AND m.map_position IS NULL;
