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

## Backlog (P1/P2)
- P1 Fornitori (per acquisti ricambi + ordini)
- P1 Dispositivi ricondizionati come entità con storia (acquisto, ricondizionamento, rivendita)
- P1 Filtri per data su report (settimana/mese/trimestre/anno)
- P2 Export CSV movimenti cassa per commercialista
- P2 Notifiche/promemoria consegna riparazioni via email/telegram
- P2 QR code sulle etichette ricambio per scan rapido
- P2 Ricerca full-text avanzata su tutta la app
- P2 Fattura elettronica XML SDI (italiana)

## Test Credentials
Vedi /app/memory/test_credentials.md
