import React, { useEffect, useState } from "react";
import { api } from "@/api/client";
import { History } from "lucide-react";
import { currency, formatDate, REPAIR_STATUS, REFURB_STATUS } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";

export function SerialHistoryAlert({ serial, excludeId }) {
    const [hist, setHist] = useState(null);

    useEffect(() => {
        const s = (serial || "").trim();
        if (s.length < 4) { setHist(null); return; }
        const t = setTimeout(() => {
            api.get("/devices/history", { params: { serial: s, exclude_id: excludeId || undefined } })
                .then((r) => setHist(r.data))
                .catch(() => setHist(null));
        }, 400);
        return () => clearTimeout(t);
    }, [serial, excludeId]);

    if (!hist || (hist.repairs.length === 0 && hist.refurbished.length === 0)) return null;
    const n = hist.repairs.length + hist.refurbished.length;

    return (
        <div className="col-span-2 rounded-md border border-amber-700/60 bg-amber-950/40 p-3 text-sm" data-testid="serial-history-alert">
            <div className="flex items-center gap-2 font-medium text-amber-300 mb-2">
                <History className="h-4 w-4" />
                Dispositivo già passato in laboratorio ({n} {n === 1 ? "volta" : "volte"})
            </div>
            <ul className="space-y-1.5">
                {hist.repairs.map((r) => (
                    <li key={r.id} className="flex items-start justify-between gap-2 text-zinc-200">
                        <div className="min-w-0">
                            <span className="font-mono text-primary">{r.ticket_number}</span>
                            <span className="text-muted-foreground"> · {formatDate(r.created_at)} · {r.customer_name || "walk-in"}</span>
                            <div className="text-xs text-muted-foreground truncate">{r.problem}{r.diagnosis ? ` → ${r.diagnosis}` : ""}</div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono text-xs">{currency(r.final_price)}</span>
                            <StatusBadge map={REPAIR_STATUS} value={r.status} />
                        </div>
                    </li>
                ))}
                {hist.refurbished.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-2 text-zinc-200">
                        <span><span className="font-mono text-primary">{d.code}</span><span className="text-muted-foreground"> · ricondizionato · {formatDate(d.created_at)}</span></span>
                        <StatusBadge map={REFURB_STATUS} value={d.status} />
                    </li>
                ))}
            </ul>
        </div>
    );
}
