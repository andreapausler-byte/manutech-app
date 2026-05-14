-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Migration 056 — comments.kind: aggiunge system_intervention_*
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--
-- Estende il CHECK comments_kind_check con i 2 nuovi valori introdotti
-- dalla feat/chat-intervention-notification (commit a2987cc):
--   - system_intervention_planned    : messaggio automatico "🔧 Intervento
--                                      pianificato per DD/MM/YYYY — title — urgenza"
--                                      postato in chat report al create di
--                                      un intervento (db.createInterventionWithReports).
--   - system_intervention_rescheduled: messaggio "📅 Data intervento
--                                      aggiornata: DD/MM → DD/MM" postato
--                                      al reschedule (db.updateIntervention).
--
-- Bug osservato in produzione: il codice client scrive correttamente l'INSERT
-- ma il CHECK comments_kind_check (mig 051) accetta solo 8 valori "chat"-like.
-- L'INSERT falliva con violazione → postSystemComment swallowa con
-- console.warn → comment mai apparso in chat (bug silente).
--
-- Pattern identico a mig 047 (aggiunta 'spare_request') e mig 051
-- (aggiunta 'request_chat'). Additiva, no destructive: i record esistenti
-- restano validi.
--
-- DOWN: 056_comment_kind_system_intervention_down.sql

ALTER TABLE public.comments
  DROP CONSTRAINT IF EXISTS comments_kind_check;

ALTER TABLE public.comments
  ADD CONSTRAINT comments_kind_check CHECK (kind IN (
    'chat',
    'voice_new_ticket',
    'voice_update',
    'voice_close',
    'voice_note',
    'voice_spare_request',
    'spare_request',
    'request_chat',
    'system_intervention_planned',
    'system_intervention_rescheduled'
  ));
