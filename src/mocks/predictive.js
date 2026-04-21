// src/mocks/predictive.js
// Mock data per Fase 1 — sostituire con query Supabase reali in Fase 2

/**
 * @typedef {'ok'|'attention'|'at_risk'} MachineStatus
 * @typedef {'bassa'|'media'|'alta'} Priority
 * @typedef {'aperto'|'in_corso'|'chiuso'} TicketStatus
 * @typedef {'guasto'|'anomalia'|'manutenzione'|'altro'} Category
 */

export const MACHINES = [
  { id:'m1', code:'FER-04', name:'Fermentatore 04', area:'Cantina', status:'at_risk', risk:78, mtbf:142, lastIncident:'12 min', uptime7d:92.4 },
  { id:'m2', code:'FIL-02', name:'Filtro a piastre', area:'Filtrazione', status:'attention', risk:54, mtbf:210, lastIncident:'1 h', uptime7d:97.1 },
  { id:'m3', code:'IMB-01', name:'Imbottigliatrice', area:'Confezionamento', status:'ok', risk:22, mtbf:380, lastIncident:'3 h', uptime7d:99.2 },
  { id:'m4', code:'PAS-01', name:'Pastorizzatore', area:'Confezionamento', status:'ok', risk:18, mtbf:450, lastIncident:'ieri', uptime7d:99.8 },
  { id:'m5', code:'AMM-03', name:'Ammostatore', area:'Sala cotte', status:'ok', risk:12, mtbf:620, lastIncident:'3g', uptime7d:100 },
  { id:'m6', code:'FER-02', name:'Fermentatore 02', area:'Cantina', status:'ok', risk:28, mtbf:320, lastIncident:'2g', uptime7d:98.6 },
  { id:'m7', code:'FER-01', name:'Fermentatore 01', area:'Cantina', status:'ok', risk:15, mtbf:510, lastIncident:'5g', uptime7d:100 },
  { id:'m8', code:'BOL-01', name:'Bollitore', area:'Sala cotte', status:'attention', risk:42, mtbf:180, lastIncident:'6 h', uptime7d:96.3 },
  { id:'m9', code:'ETI-01', name:'Etichettatrice', area:'Confezionamento', status:'ok', risk:20, mtbf:420, lastIncident:'1g', uptime7d:99.4 },
]

export const PREDICTIVE_ALERTS = [
  { id:'p1', machineId:'m1', risk:78, window:'72 h', pattern:'Guarnizione valvola inferiore', confidence:0.82, evidence:'3 ticket simili negli ultimi 6 mesi · MTBF in calo del 23%', action:'Ispezione + sostituzione preventiva' },
  { id:'p2', machineId:'m2', risk:54, window:'5 g', pattern:'Usura cuscinetto compressore', confidence:0.71, evidence:'Frequenza anomalia udibile aumentata · vibrazioni sopra soglia', action:'Diagnosi vibrazioni + eventuale sostituzione' },
  { id:'p3', machineId:'m8', risk:42, window:'7 g', pattern:'Scambiatore calore calcificato', confidence:0.64, evidence:'Rendimento termico -8% rispetto alla baseline', action:'Pulizia CIP straordinaria' },
]

export const TICKETS = [
  { id:'TK-2847', status:'in_corso', priority:'alta', title:'Perdita sulla valvola inferiore', machineId:'m1', category:'guasto', ago:'12 min', techName:'Luca Bianchi', operatorName:'M. Ricci', impactEurH:480, aiConfidence:0.88, audioDurationSec:18,
    transcript:'Ciao, sto lavorando sul fermentatore 04 in cantina e ho notato una perdita sulla valvola inferiore. Non è una cosa grossa ma il prodotto sta gocciolando e bisogna fermare il ciclo prima che diventi un problema. Priorità alta direi.' },
  { id:'TK-2845', status:'aperto', priority:'media', title:'Rumore anomalo dal compressore', machineId:'m2', category:'anomalia', ago:'1 h', techName:null, operatorName:'G. Conti', impactEurH:180, aiConfidence:0.72 },
  { id:'TK-2846', status:'aperto', priority:'alta', title:'Temperatura fuori range cantina', machineId:'m6', category:'anomalia', ago:'45 min', techName:null, operatorName:'M. Ricci', impactEurH:320, aiConfidence:0.81 },
  { id:'TK-2841', status:'aperto', priority:'bassa', title:'Controllo vite imbuto carico', machineId:'m3', category:'manutenzione', ago:'3 h', techName:null, operatorName:'A. Russo', impactEurH:0, aiConfidence:0.65 },
  { id:'TK-2840', status:'in_corso', priority:'media', title:'Lubrificazione catena trasporto', machineId:'m9', category:'manutenzione', ago:'4 h', techName:'Marco Ferri', operatorName:'A. Russo', impactEurH:90, aiConfidence:0.9 },
  { id:'TK-2836', status:'chiuso', priority:'media', title:'Sostituita guarnizione porta', machineId:'m4', category:'manutenzione', ago:'ieri', techName:'Marco Ferri', operatorName:'L. Verdi', impactEurH:0, aiConfidence:0.95 },
  { id:'TK-2830', status:'chiuso', priority:'alta', title:'Sbloccato motore agitatore', machineId:'m5', category:'guasto', ago:'ieri', techName:'Luca Bianchi', operatorName:'M. Ricci', impactEurH:610, aiConfidence:0.86 },
]

export const KPI = {
  uptime: 96.8,
  uptimeDelta: 0.4,
  mttr: 38,
  mttrDelta: -5,
  mtbf: 312,
  mtbfDelta: 12,
  lostEurToday: 1440,
  lostEurDelta: -420,
  openTickets: 4,
  closedWeek: 18,
}

export const machineById = (id) => MACHINES.find(m => m.id === id)
