export const currency = (v) =>
    new Intl.NumberFormat("it-IT", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 2,
    }).format(Number(v || 0));

export const formatDate = (iso) => {
    if (!iso) return "—";
    try {
        return new Date(iso).toLocaleDateString("it-IT", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
        });
    } catch {
        return iso;
    }
};

export const formatDateTime = (iso) => {
    if (!iso) return "—";
    try {
        return new Date(iso).toLocaleString("it-IT", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    } catch {
        return iso;
    }
};

export const REPAIR_STATUS = {
    in_attesa: { label: "In attesa", color: "bg-zinc-800 text-zinc-200 border-zinc-700" },
    in_lavorazione: {
        label: "In lavorazione",
        color: "bg-amber-950 text-amber-300 border-amber-800",
    },
    completata: {
        label: "Completata",
        color: "bg-emerald-950 text-emerald-300 border-emerald-800",
    },
    consegnata: { label: "Consegnata", color: "bg-sky-950 text-sky-300 border-sky-800" },
    annullata: { label: "Annullata", color: "bg-red-950 text-red-300 border-red-800" },
};

export const PART_CONDITION = {
    nuovo: { label: "Nuovo", color: "bg-emerald-950 text-emerald-300 border-emerald-800" },
    usato: { label: "Usato", color: "bg-amber-950 text-amber-300 border-amber-800" },
    ricondizionato: {
        label: "Ricondizionato",
        color: "bg-sky-950 text-sky-300 border-sky-800",
    },
};

export const PART_STATUS = {
    disponibile: {
        label: "Disponibile",
        color: "bg-emerald-950 text-emerald-300 border-emerald-800",
    },
    in_uso: { label: "In uso", color: "bg-amber-950 text-amber-300 border-amber-800" },
    esaurito: { label: "Esaurito", color: "bg-zinc-800 text-zinc-300 border-zinc-700" },
    difettoso: { label: "Difettoso", color: "bg-red-950 text-red-300 border-red-800" },
};

export const REFURB_STATUS = {
    acquistato: { label: "Acquistato", color: "bg-zinc-800 text-zinc-200 border-zinc-700" },
    in_ricondizionamento: {
        label: "In ricondizionamento",
        color: "bg-amber-950 text-amber-300 border-amber-800",
    },
    pronto: { label: "Pronto alla vendita", color: "bg-sky-950 text-sky-300 border-sky-800" },
    venduto: { label: "Venduto", color: "bg-emerald-950 text-emerald-300 border-emerald-800" },
};

export const ORDER_STATUS = {
    bozza: { label: "Bozza", color: "bg-zinc-800 text-zinc-200 border-zinc-700" },
    ordinato: { label: "Ordinato", color: "bg-amber-950 text-amber-300 border-amber-800" },
    parziale: { label: "Arrivo parziale", color: "bg-sky-950 text-sky-300 border-sky-800" },
    ricevuto: { label: "Ricevuto", color: "bg-emerald-950 text-emerald-300 border-emerald-800" },
    annullato: { label: "Annullato", color: "bg-red-950 text-red-300 border-red-800" },
};

export const DEVICE_TYPES = [
    "PC / Notebook",
    "Smartphone",
    "Tablet",
    "Console",
    "TV / Monitor",
    "Altro",
];
