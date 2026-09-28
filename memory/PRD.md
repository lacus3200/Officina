# PRD — Officina · Gestionale Laboratorio Elettronica

## Problem Statement (originale, IT)
> Creare un'applicazione per la gestione economica e organizzativa di un piccolo
> laboratorio di elettronica dove si riparano pc, smartphone e simili e poi si
> rivendono. Requisiti: gestione riparazioni/ticket, clienti, inventario ricambi
> (con condizione: nuovo/usato/ricondizionato, stato utilizzo:
> disponibile/in_uso/esaurito/difettoso), vendite/rivendite, cassa e report
> economici. Single-user (uso personale da PC e smartphone). No AI.
> Esportazione PDF (ricevute riparazione, fatture semplici, etichette ricambio).
> Design moderno warm tech/officina, dark mode.

## User Persona
- Titolare del piccolo laboratorio (unico utente). Accede da desktop e mobile.
  Vuole velocità nell'apertura ticket, controllo del margine e visibilità sulla
  scorta minima.

## Architecture
- Backend: FastAPI + MongoDB (motor). Auth JWT (Bearer + httpOnly cookie),
  bcrypt. Admin seeded on startup dall'`.env`.
- Frontend: React 19 + Tailwind + Shadcn UI + Recharts + Framer Motion + Sonner.
- PDF: jsPDF lato client.

## Core Requirements (statici)
1. Login single-user (email/password, JWT).
2. Riparazioni con ticket auto-incrementale (RIP-*), stato, preventivo,
   ricambi utilizzati, prezzo finale, flag pagato, ricevuta PDF.
3. Clienti CRUD con anagrafica.
4. Magazzino ricambi con condizione, stato utilizzo, quantità/soglia minima,
   costo/prezzo, posizione, seriale, etichetta PDF.
5. Vendite con generazione fattura (VEN-*), decremento stock, calcolo margine,
   PDF fattura.
6. Cassa: movimenti entrate/uscite manuali + automatici da vendite e
   riparazioni consegnate&pagate.
7. Dashboard/Report: KPI oggi/mese, riparazioni aperte, valore magazzino,
   ricambi sotto scorta, grafico 14 giorni, distribuzione stati riparazioni.

## Implemented (2026-02-27)
- ✅ Auth JWT + admin seeding (admin@lab.local / admin123)
- ✅ Dashboard con Recharts + KPI + sotto-scorta + ultime riparazioni
- ✅ CRUD Clienti + ricerca
- ✅ CRUD Magazzino con condizione/stato utilizzo + filtro sotto-scorta + etichetta PDF
- ✅ CRUD Riparazioni + ticket auto + ricambi utilizzati + partial-update backend
- ✅ Vendite con decremento stock + margine + fattura PDF + cash auto
- ✅ Cassa con totali entrate/uscite/netto
- ✅ Report con grafici Bar + Pie
- ✅ Layout responsive (sidebar desktop, Sheet mobile)
- ✅ Test end-to-end (backend 100%, frontend ~95%)

## Implemented (2026-06 — sessione 2)
- ✅ Ricondizionati (/ricondizionati): schede dispositivo con codice RIC-*, stato
  (acquistato/in_ricondizionamento/pronto/venduto), timeline acquisto → riparazione
  (ticket collegato, costo ricambi a cost_price) → costi extra → rivendita; costo
  totale, margine previsto/finale, KPI riepilogo; vendita genera VEN-* + cassa;
  acquisto e costi extra generano uscite di cassa.
- ✅ Fornitori & Ordini (/fornitori): CRUD fornitori; ordini ORD-* con righe
  (collegabili a ricambi), stato bozza/ordinato/parziale/ricevuto/annullato, arrivo
  previsto, tracking; ricezione parziale/totale incrementa giacenza magazzino e
  registra uscita cassa "acquisto".
- ✅ Test iteration_3: backend 7/7, frontend E2E OK.

## Implemented (2026-06 — sessione 3)
- ✅ Cliente al volo (+) dentro il select cliente di Riparazioni, Vendite, vendita Ricondizionato
- ✅ Catalogo marche/modelli precaricato (19 marche, ~150 modelli con codice tecnico tra
  parentesi), aggiunta marche/modelli custom (API /catalog/*)
- ✅ Avviso storico seriale/IMEI già passato in laboratorio (API /devices/history)
- ✅ Cassa: click su movimento → dialog dettaglio documento collegato + link sezione
- ✅ Ricondizionati: campi colore e grado estetico (A+/A/B/C/D)
- ✅ Date entrata/uscita su riparazioni (received_at/delivered_at) e ricambi (entered_at/exited_at)
- ✅ Test iteration_4: backend 12/12, frontend E2E OK.
- ⏭ Saltato su richiesta utente: creare ricondizionato dalla riparazione.

## Implemented (2026-06 — sessione 4)
- ✅ Listino interventi (/listino, API /services): 19 interventi precaricati, CRUD, prezzo
  modificabile inline; nel form riparazione "Interventi da listino" con prezzo editabile,
  totale suggerito e "Usa come preventivo"; interventi nella ricevuta PDF
- ✅ Colore ricondizionato come select con colori per marca/modello (+ aggiunta colore
  salvata sul modello, API /catalog/colors, /catalog/models/{id}/colors)
- ✅ "Apri riparazione" dalla scheda ricondizionato: crea ticket precompilato collegato,
  stato → in_ricondizionamento, blocco se già aperto
- ✅ Test iteration_5: backend 9/9, frontend E2E OK.
- ✅ Vendita ricondizionato chiude automaticamente (consegnata + data uscita + nota) la
  riparazione collegata ancora aperta; nessun doppio incasso in cassa.
- ✅ Catalogo ricambi (43 precaricati, API /catalog/parts) nel campo Nome del magazzino con
  aggiunta custom e nome libero; categoria auto-assegnata dal nome (regole keyword);
  campo "Compatibile con i modelli" (marca → modello → chip) su ogni ricambio. Test iteration_6 OK.

## Implemented (2026-06 — sessione 5)
- ✅ Filtro compatibilità nel form riparazione (ricambi compatibili prima, con ✓)
- ✅ Sezione Fornitori & Ordini rimossa dal frontend (backend endpoints mantenuti per dati storici)
- ✅ Ricambi: marca (select + custom), categoria select + custom, gestione categorie
  (rinomina con propagazione) e tipologie catalogo (modifica/elimina) — API /catalog/part-categories,
  /catalog/part-brands, PUT /catalog/parts/{id}
- ✅ Tabelle Magazzino e Riparazioni: colonne ridimensionabili (drag, persistite in localStorage,
  reset), scroll interno con header sticky e scrollbar orizzontale sempre visibile
- ✅ Backup: pagina /impostazioni con export JSON completo e import (sostituisci/unisci) con anteprima
- ✅ Test iteration_7: backend 11/11, frontend E2E OK.
- ✅ Tabelle ridimensionabili + scroll interno anche su Clienti (convertita da card a tabella),
  Vendite e Cassa
- ✅ Sync cassa: GET /cash esegue sync automatico, POST /cash/sync manuale (pulsante);
  vendite/riparazioni pagate senza movimento vengono aggiunte, importi corretti, orfani rimossi;
  movimenti collegati a vendita/riparazione non eliminabili (400)
- ✅ Ricambi → uscite cassa "acquisto_ricambi" (creazione, aumento quantità, backfill via sync);
  dettaglio movimento tipo "part". Test iteration_8 OK.

## Implemented (2026-06 — sessione 6, code review)
- ✅ Refactor backend senza cambi funzionali: dashboard, startup, receive_order, import_backup,
  sync_cash suddivisi in helper (complessità ridotta)
- ✅ Test: credenziali non più hardcoded (tests/conftest.py legge env o backend/.env),
  fixture condivise (client, temp_part, cash_for), test complessi spezzati in casi singoli
- ✅ Suite 69/69 + regressione iteration_9 OK

## Implemented (2026-06 — sessione 7)
- ✅ Tutte le tabelle: ricerca (anche Vendite e Cassa), ordinamento per colonna (click header),
  selezione multipla con checkbox + "Elimina selezionati" (hook useTableSort/useSelection, BulkBar)
- ✅ Scarico automatico giacenza ricambi usati in riparazione (create/update delta, annulla/elimina ripristina)
- ✅ Nome ricambio come combobox con ricerca testuale (Command/Popover)
- ✅ Data vendita inseribile/modificabile (POST /sales date, PUT /sales/{id}); data/prezzo vendita
  ricondizionato modificabili (propagati a vendita e cassa)
- ✅ Descrizioni cassa con articolo/dispositivo (sync aggiorna le esistenti)
- ✅ Menu laterale mobile scrollabile
- ✅ Test iteration_10: backend 81/81, frontend E2E OK.

## Backlog (P1/P2)
- P1 Filtri per data su report (settimana/mese/trimestre/anno)
- P1 Riordino rapido da "sotto scorta" → crea ordine precompilato al fornitore
- P2 Export CSV movimenti cassa per commercialista
- P2 Notifiche/promemoria consegna riparazioni via email/telegram
- P2 QR code sulle etichette ricambio per scan rapido
- P2 Ricerca full-text avanzata su tutta la app
- P2 Fattura elettronica XML SDI (italiana)

## Test Credentials
Vedi /app/memory/test_credentials.md
