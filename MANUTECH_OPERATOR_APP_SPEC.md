# ManuTech — Specifiche App Operatore con Input Vocale AI

> Progetto: ManuTech PWA · Stack: React 19 + Vite 7 + Tailwind CSS 4 + Supabase
> Scope: implementazione dell'app operatore con creazione ticket tramite audio + AI

---

## Contesto

ManuTech è una PWA di manutenzione industriale per Birra Amarcord.
Esistono tre ruoli: Operator, Technician, Admin.

Questa spec riguarda esclusivamente la vista Operator.

L'obiettivo è un'interfaccia radicalmente minimal pensata per ambiente industriale
(mani occupate, rumore, schermo sporco, poco tempo). L'azione principale è creare
un ticket tramite audio: l'operatore parla, l'AI trascrive e struttura, l'operatore
conferma.

---

## Filosofia di Design

### Regola principale
> Una sola azione dominante per schermata.

L'operatore non deve mai chiedersi "cosa faccio adesso?".

### Principi
- Minimal brutalista: niente decorazioni, solo ciò che serve
- Dark-first: sfondo quasi nero (#060e09), palette verde Amarcord (#1B6B4A)
- Touch-first: bottoni grandi, tap target minimo 48px, niente hover-only
- Feedback immediato: ogni azione risponde visivamente entro 100ms
- Zero ambiguità: ogni elemento dice esattamente cosa fa

### Font (Google Fonts)
- Display / UI: Barlow Condensed
- Monospace / metadati: DM Mono

### Palette
```
background:    #060e09
surface:       #0b1710
border:        #152111
green-primary: #1B6B4A
green-light:   #2a9d6e
green-dim:     #0f3d2a
text-primary:  #e8f5ee
text-muted:    #3d6b50
red:           #e03c31
amber:         #f59e0b
```

---

## Struttura Schermate

```
[HOME] → [RECORDING] → [REVIEW] → conferma → [HOME]
  ↓
[TICKET LIST] → [TICKET DETAIL]
```

### 1. HOME — OperatorHome.jsx

Layout dall'alto verso il basso:
1. Status bar: ora + turno operatore
2. Header: nome operatore + badge turno (es. "TURNO A")
3. Tre card contatori orizzontali:
   - Ticket assegnati a me
   - Ticket aperti oggi
   - Ticket chiusi questa settimana
4. Bottone di registrazione (elemento dominante, centro schermata):
   - Cerchio verde 140px con icona microfono
   - Label: "Tieni premuto per segnalare"
   - Anelli pulsanti animati CSS
   - Evento: onPointerDown → avvia registrazione
5. Preview ticket in corso (max 2, poi "vedi tutti"):
   - Riga compatta: dot priorità + titolo + macchina + ID
6. Nav bar in basso: Home · Ticket · Profilo

### 2. RECORDING — OperatorRecording.jsx

Si attiva al onPointerDown sul bottone home. Elementi:
- Indicatore REC rosso lampeggiante
- Timer MM:SS in DM Mono
- Waveform animata: 28 barre verticali che oscillano ogni 80ms
- Bottone STOP (cerchio rosso con quadrato bianco interno)
- Label "Rilascia per terminare"

Al rilascio → stop registrazione → passa a stato TRANSCRIBING.

Note tecniche:
- Usa MediaRecorder API del browser
- Chunk audio raccolti in Blob
- Mantieni lo stream microfono attivo fino allo stop

### 3. TRANSCRIBING (stato interno di OperatorRecording.jsx)

Non è una schermata separata. Mostra:
- Spinner CSS (bordo verde che ruota)
- Label "Trascrizione in corso…"

In questo stato vengono chiamate le Edge Function Supabase.

### 4. REVIEW — OperatorReview.jsx

1. Badge "AI Whisper · Trascritto" con dot verde animato
2. Box trascrizione: testo editabile (textarea stilizzato, sfondo surface)
3. Campi estratti dall'AI (pre-compilati ma editabili):
   - Macchina: select con le macchine reali dal database, pre-selezionata
   - Priorità: select (alta / media / bassa)
   - Categoria: select (guasto / manutenzione / anomalia / altro)
   - Area: campo testo
4. Bottone primario: "INVIA TICKET →" (verde, flex 2)
5. Bottone secondario: "ANNULLA" (trasparente, flex 1)

### 5. TICKET LIST — OperatorTicketList.jsx

Lista ticket dell'operatore loggato. Ogni card:
- ID ticket (DM Mono, piccolo)
- Status pill colorato
- Titolo (Barlow Condensed, 18px bold)
- Nome macchina (DM Mono, muted)
- Dot priorità + label + timestamp

Filtri rapidi: Tutti · Aperti · In corso

### 6. TICKET DETAIL — OperatorTicketDetail.jsx

- ID + timestamp
- Titolo grande
- Nome macchina
- Box note/descrizione
- Status + Priorità (2 field card)
- Nome tecnico assegnato (se presente)

---

## Integrazione Database — Macchine

Le macchine NON sono hardcoded. Vanno recuperate dalla tabella `machinery`
di Supabase già esistente nel progetto.

PRIMA DI TUTTO verifica la struttura reale delle tabelle con questa query:
```sql
select column_name, data_type
from information_schema.columns
where table_name in ('machinery', 'tickets', 'profiles')
order by table_name, ordinal_position;
```
Adatta tutti i nomi di colonna allo schema reale — non assumere nulla.

### Hook useMachinery

```typescript
// src/hooks/useMachinery.ts
import { supabase } from "@/lib/supabase";

export function useMachinery() {
  const [machines, setMachines] = useState([]);

  useEffect(() => {
    supabase
      .from("machinery")
      .select("id, name, area, code")
      .eq("active", true)
      .order("name")
      .then(({ data }) => setMachines(data ?? []));
  }, []);

  return machines;
}
```

---

## Implementazione Audio + AI

### Flusso tecnico completo

```
onPointerDown → MediaRecorder start
onPointerUp   → MediaRecorder stop → Blob audio (webm)
                    ↓
          POST /functions/v1/transcribe
                    ↓
          OpenAI Whisper (whisper-1, language: it)
                    ↓
          testo trascritto grezzo
                    ↓
          POST /functions/v1/extract-ticket-fields
          (include lista macchine dal DB)
                    ↓
          Claude Haiku → JSON strutturato
                    ↓
          { machine_id, machine_name, priority, category, area, summary }
                    ↓
          render in OperatorReview.jsx
                    ↓
          utente conferma → INSERT in tabella tickets
```

### Edge Function: transcribe

```typescript
// supabase/functions/transcribe/index.ts
import { OpenAI } from "openai";

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });

Deno.serve(async (req) => {
  const formData = await req.formData();
  const audioFile = formData.get("audio") as File;

  const transcription = await openai.audio.transcriptions.create({
    file: audioFile,
    model: "whisper-1",
    language: "it",
  });

  return Response.json({ text: transcription.text });
});
```

### Edge Function: extract-ticket-fields

```typescript
// supabase/functions/extract-ticket-fields/index.ts
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

Deno.serve(async (req) => {
  const { text, machines } = await req.json();

  const machineList = machines
    .map((m: any) => `- id:${m.id} | ${m.name} (${m.code}) | area: ${m.area}`)
    .join("\n");

  const SYSTEM_PROMPT = `
Sei un assistente per la manutenzione industriale di un birrificio.
Ricevi la trascrizione di un audio con cui un operatore segnala un problema.
Estrai i campi richiesti. Se un campo non è chiaro usa null.
Rispondi SOLO con JSON valido, nessun altro testo.

Macchine disponibili nel sistema (usa esattamente il valore "id" per machine_id):
${machineList}

Schema risposta:
{
  "machine_id": string | null,
  "machine_name": string | null,
  "priority": "alta" | "media" | "bassa" | null,
  "category": "guasto" | "manutenzione" | "anomalia" | "altro" | null,
  "area": string | null,
  "summary": string
}

Regole priorità:
- alta: guasto bloccante, perdita di prodotto, rischio sicurezza
- media: anomalia che rallenta ma non blocca la produzione
- bassa: manutenzione preventiva, osservazione, non urgente
`;

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: text }],
  });

  const json = JSON.parse((message.content[0] as { text: string }).text);
  return Response.json(json);
});
```

### Hook useVoiceTicket

```typescript
// src/hooks/useVoiceTicket.ts
import { useState, useRef } from "react";
import { supabase } from "@/lib/supabase";

export type VoiceTicketState = "idle" | "recording" | "transcribing" | "review";

export interface ExtractedFields {
  machine_id: string | null;
  machine_name: string | null;
  priority: "alta" | "media" | "bassa" | null;
  category: string | null;
  area: string | null;
  summary: string;
}

export function useVoiceTicket(machines: any[]) {
  const [state, setState] = useState<VoiceTicketState>("idle");
  const [transcription, setTranscription] = useState("");
  const [fields, setFields] = useState<ExtractedFields | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunks.current = [];
      recorder.ondataavailable = (e) => chunks.current.push(e.data);
      recorder.onstop = handleStop;
      mediaRecorder.current = recorder;
      recorder.start();
      setState("recording");
    } catch {
      setError("Microfono non disponibile. Controlla i permessi del browser.");
    }
  };

  const stopRecording = () => {
    mediaRecorder.current?.stop();
    mediaRecorder.current?.stream.getTracks().forEach(t => t.stop());
    setState("transcribing");
  };

  const handleStop = async () => {
    const blob = new Blob(chunks.current, { type: "audio/webm" });

    if (blob.size < 5000) {
      setError("Audio troppo breve. Tieni premuto più a lungo.");
      setState("idle");
      return;
    }

    try {
      // Step 1: Trascrizione Whisper
      const form = new FormData();
      form.append("audio", blob, "recording.webm");
      const { data: transcribeData, error: transcribeError } =
        await supabase.functions.invoke("transcribe", { body: form });
      if (transcribeError) throw transcribeError;
      const text = transcribeData.text;
      setTranscription(text);

      // Step 2: Estrazione campi con Claude Haiku
      const { data: extractData, error: extractError } =
        await supabase.functions.invoke("extract-ticket-fields", {
          body: { text, machines },
        });
      if (extractError) throw extractError;
      setFields(extractData);

      setState("review");
    } catch (err) {
      setError("Errore durante la trascrizione. Riprova.");
      setState("idle");
    }
  };

  const submitTicket = async (finalFields: ExtractedFields, finalText: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("tickets").insert({
      title: finalFields.summary,
      description: finalText,
      machine_id: finalFields.machine_id,
      priority: finalFields.priority,
      category: finalFields.category,
      area: finalFields.area,
      status: "aperto",
      created_by: user?.id,
    });
    if (error) throw error;
  };

  const reset = () => {
    setState("idle");
    setTranscription("");
    setFields(null);
    setError(null);
  };

  return {
    state, transcription, fields, error,
    startRecording, stopRecording, submitTicket, reset,
  };
}
```

---

## Struttura File da Creare

```
src/
  pages/
    operator/
      OperatorApp.jsx          ← router interno delle schermate
      OperatorHome.jsx
      OperatorRecording.jsx    ← gestisce anche stato "transcribing"
      OperatorReview.jsx
      OperatorTicketList.jsx
      OperatorTicketDetail.jsx
  hooks/
    useVoiceTicket.ts
    useMachinery.ts
  components/
    operator/
      Waveform.jsx             ← 28 barre animate
      PriorityDot.jsx
      TicketCard.jsx
      StatusPill.jsx
      OperatorNavBar.jsx
supabase/
  functions/
    transcribe/
      index.ts
    extract-ticket-fields/
      index.ts
```

---

## Variabili d'Ambiente Supabase

Aggiungere in Supabase Dashboard → Settings → Edge Functions → Secrets:
```
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
```

---

## Note Implementative

- Permessi microfono: chiedi al primo avvio con getUserMedia. Se negato,
  mostra istruzioni e non bloccare il resto dell'app.
- Timeout trascrizione: 15 secondi massimo, poi errore con messaggio chiaro.
- Se extract-ticket-fields fallisce: mostra la trascrizione grezza con campi
  vuoti — l'operatore può compilare manualmente.
- Usa supabase.functions.invoke() per chiamare le edge function,
  non fetch diretto.
- aria-label su tutti i bottoni icon-only.
- aria-live="polite" per annunciare i cambi di stato all'operatore.
- Il select macchine in OperatorReview deve avere un'opzione vuota
  "— Seleziona macchina —" per i casi in cui l'AI non riconosce la macchina.

---

## Cosa NON Implementare in Questa Fase

- Gamification, badge, ManuCoin
- Vista Admin o Technician
- Notifiche push
- Modifica ticket post-invio (solo admin/technician)
- Upload foto allegati
- Commenti ai ticket

---

## Ordine di Implementazione

Procedi in questo ordine esatto:

1. Esegui la query SQL per verificare lo schema reale delle tabelle
2. Crea le due Edge Function Supabase (transcribe + extract-ticket-fields)
3. Crea src/hooks/useMachinery.ts
4. Crea src/hooks/useVoiceTicket.ts
5. Crea i componenti operator/ (Waveform, PriorityDot, TicketCard, StatusPill, NavBar)
6. Crea OperatorHome.jsx
7. Crea OperatorRecording.jsx (con stato transcribing integrato)
8. Crea OperatorReview.jsx
9. Crea OperatorTicketList.jsx e OperatorTicketDetail.jsx
10. Crea OperatorApp.jsx come router delle schermate
11. Collega OperatorApp al sistema di routing esistente di ManuTech

Ad ogni step verifica che non ci siano errori TypeScript prima di procedere
al successivo.
