// Planimetria dello stabilimento Birra Amarcord (Apecchio).
//
// Tutte le coordinate sono in millimetri, nel sistema del disegno DWG
// (y verso l'alto). Le macchine NON sono qui: la loro posizione è un dato
// della macchina (`machines.map_position`, migration 069). Qui c'è solo
// quello che non cambia con i dati: il disegno a tasselli, i nomi dei
// locali e le posizioni della linea lenta in progetto (layout Beertec),
// che in ManuTech ancora non esistono.
//
// Anche i contorni delle aree sono un dato dell'area (`areas.map_shape`,
// migration 070): quelli qui sotto servono solo finché un'area non ne ha
// uno suo (070 non eseguita, demo) e si agganciano per NOME.

import ov from '../../assets/plantMap/amarcord/ov.webp'
import ovP from '../../assets/plantMap/amarcord/ov_p.webp'
import t1 from '../../assets/plantMap/amarcord/t1.webp'
import t1P from '../../assets/plantMap/amarcord/t1_p.webp'
import t2 from '../../assets/plantMap/amarcord/t2.webp'
import t3a from '../../assets/plantMap/amarcord/t3a.webp'
import t3aP from '../../assets/plantMap/amarcord/t3a_p.webp'
import t3b from '../../assets/plantMap/amarcord/t3b.webp'
import t3bP from '../../assets/plantMap/amarcord/t3b_p.webp'
import t4 from '../../assets/plantMap/amarcord/t4.webp'
import t5 from '../../assets/plantMap/amarcord/t5.webp'
import t5P from '../../assets/plantMap/amarcord/t5_p.webp'

// r = [xmin, ymin, xmax, ymax] in mm. La vista d'insieme è a 45 mm/px,
// i tasselli a 15 mm/px: si caricano solo quando lo zoom li richiede.
const BASE = {
  overview: { src: ov, r: [52000, 50000, 214000, 138000] },
  tiles: [
    { src: t1, r: [52000, 64000, 90000, 110000] },
    { src: t2, r: [88000, 70000, 130000, 110000] },
    { src: t3a, r: [56000, 106000, 101000, 131000] },
    { src: t3b, r: [99000, 106000, 146000, 131000] },
    { src: t4, r: [52000, 54000, 90000, 66000] },
    { src: t5, r: [145000, 76000, 176000, 120000] },
  ],
}

// Il progetto Beertec (linea lenta e studi) su un livello a parte, in verde.
const PROJECT = {
  overview: { src: ovP, r: [52000, 50000, 214000, 138000] },
  tiles: [
    { src: t1P, r: [52000, 64000, 90000, 110000] },
    { src: t3aP, r: [56000, 106000, 101000, 131000] },
    { src: t3bP, r: [99000, 106000, 146000, 131000] },
    { src: t5P, r: [145000, 76000, 176000, 120000] },
  ],
}

// Colori: quelli di `AREA_MAP_COLORS` (lib/plantMap/areas.js), che la 070
// scrive anche in `areas.color`.
//
// Sala Cottura e Cantina riviste il 21/10/2026: la parte nord
// dell'edificio cottura (dove sta FV1) e i due BBT esterni a sud sono
// cantina; i serbatoi acqua e acqua calda in testa al parco serbatoi sono
// sala cottura.
const AREAS = [
  { name: 'Sala Cottura', color: { dark: '#e0904a', light: '#c46b1f' }, label: [61000, 95500],
    polys: [
      [[52300, 72600], [69300, 72600], [69300, 98000], [58000, 98000], [58000, 107600], [52300, 107600]],
      [[58000, 107700], [66600, 107700], [66600, 115500], [58000, 115500]],
    ] },
  { name: 'Cantina', color: { dark: '#9a8cff', light: '#6c5ce0' }, label: [82000, 115500],
    polys: [
      [[58000, 98000], [69300, 98000], [69300, 107700], [98800, 107700], [98800, 117000], [66600, 117000], [66600, 107700], [58000, 107700]],
      [[101500, 107700], [117800, 107700], [117800, 112300], [101500, 112300]],
      [[65800, 68600], [72600, 68600], [72600, 72100], [77900, 72100], [77900, 77500], [69300, 77500], [69300, 72600], [65800, 72600]],
    ] },
  { name: 'Confezionamento', color: { dark: '#ef6a62', light: '#d0413a' }, label: [93000, 92500],
    polys: [[[69300, 77500], [98000, 77500], [98000, 72100], [118800, 72100], [118800, 100000], [100500, 100000], [100500, 107600], [69300, 107600]]] },
  { name: 'Ausiliari', color: { dark: '#d9be4a', light: '#a98a12' }, label: [106000, 129700],
    polys: [
      [[90700, 119600], [121300, 119600], [121300, 127900], [90700, 127900]],
      [[103000, 112300], [118800, 112300], [118800, 115000], [103000, 115000]],
      [[77900, 72500], [88100, 72500], [88100, 77400], [77900, 77400]],
      [[54700, 56100], [88000, 56100], [88000, 64000], [54700, 64000]],
      [[122200, 126300], [125700, 126300], [125700, 129700], [122200, 129700]],
    ] },
  { name: 'Depurazione', color: { dark: '#33c1d6', light: '#0d93a8' }, label: [136250, 130700],
    polys: [[[129300, 120500], [143200, 120500], [143200, 128900], [129300, 128900]]] },
]

// Nomi dei locali scritti sul disegno, visibili agli zoom intermedi.
const PLACES = [
  ['Magazzino', 186000, 104000], ['Magazzino materie prime', 109700, 104600],
  ['Cella calda', 121200, 96500], ['Cella fredda', 125900, 96500], ['Uffici', 123800, 76200],
  ['Officina', 95500, 123700], ['Isola ecologica', 66000, 126300], ['Cabine ENEL', 81500, 61200],
  ['Gruppo frigoriferi', 110900, 115800], ['BBT', 68600, 62900],
].map(([name, x, y]) => ({ name, x, y }))

// Linea lenta: layout Beertec in progetto, posizioni dalla legenda della
// tavola. Non sono macchine ManuTech: quando una sarà installata e creata
// in anagrafica, si posiziona come le altre.
const PROJECT_AREA = {
  key: 'Linea lenta', sub: 'progetto Beertec', color: { dark: '#4fd68f', light: '#168c52' },
  label: [160300, 104000],
  note: 'Layout Beertec in progetto: 416 m², altezza libera 5,20 m. Posizioni dalla legenda della tavola; non ancora in ManuTech.',
  polys: [[[152480, 118240], [170190, 110210], [157320, 81830], [149400, 85240]]],
  positions: [
    [1, 'Empty Cans / Bottles – Pallet Line', 'Linea pallet lattine e bottiglie vuote', 165709, 98244],
    [2, 'Glass-Can Depalletiser', 'Depalettizzatore vetro e lattine', 163432, 107082],
    [3, 'Pallet / Layer pad / Frame discharge', 'Scarico pallet, interfalde e telai (lettura parziale)', 168315, 108404],
    [4, 'Container Conveyors', 'Trasporti contenitori', 162353, 112418],
    [5, 'Empty Can Vacuum Conveyor / Ink Jet', 'Trasporto a depressione lattine vuote, codificatore', 161580, 109397],
    [6, 'Can & Lid Disinfection', 'Disinfezione lattine e coperchi (lettura parziale)', 155386, 108583],
    [7, 'Rinser Filler Capper Seamer', 'Sciacquatrice, riempitrice, tappatrice, aggraffatrice', 156972, 108098],
    [8, 'Lid Server', 'Alimentatore coperchi', 155965, 107773],
    [9, 'Cap Elevator', 'Elevatore tappi', 154593, 108887],
    [10, 'Cap & Level Inspector', 'Ispettore tappo e livello', 154502, 111517],
    [11, 'Sugar & Yeast Dosing', 'Dosaggio zucchero e lievito', 158930, 103068],
    [12, 'Flash Pasteur', 'Flash pastorizzatore', 160092, 105559],
    [20, 'Container Dryer', 'Asciugatore contenitori', 153936, 107705],
    [21, 'Can / Glass Labelling', 'Etichettatura vetro e lattina (lettura parziale)', 155095, 104309],
    [22, 'Future Secondary Packaging', 'Futuro imballaggio secondario', 155503, 98397],
    [23, 'Container Conveyors', 'Trasporti contenitori', 152427, 98430],
    [24, 'Wrap-around Packer', 'Incartonatrice wrap-around (lettura parziale)', 157607, 94536],
    [30, 'Palletiser infeed', 'Alimentazione pallettizzatore (lettura parziale)', 150347, 87751],
    [31, 'Automatic Palletiser', 'Pallettizzatore automatico (lettura parziale)', 152912, 86700],
    [32, 'Manual Pallet Wrapper', 'Avvolgipallet manuale', 161800, 88260],
    [33, 'Pallet Magazine', 'Magazzino pallet vuoti', 159040, 85698],
    [34, 'Full Pallet Discharge', 'Scarico pallet pieni', 158676, 82992],
  ].map(([n, original, name, x, y]) => ({ n, original, name, x, y })),
}

export const AMARCORD_PLANT = {
  id: 'amarcord-apecchio',
  title: 'Stabilimento di Apecchio',
  subtitle: 'Birra Amarcord · Apecchio',
  // Inquadratura iniziale: tutto lo stabilimento.
  fit: [50000, 52000, 205000, 134000],
  overviewMmPerPx: 45,
  base: BASE,
  project: PROJECT,
  projectLabel: 'Progetto Beertec',
  areas: AREAS,
  projectArea: PROJECT_AREA,
  places: PLACES,
}
