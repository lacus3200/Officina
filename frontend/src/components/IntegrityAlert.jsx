import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/api/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ShieldAlert, ShieldCheck, Wrench, RefreshCw, ChevronDown } from "lucide-react";
import { toast } from "sonner";

const SECTION_LINK = { riparazioni: "/riparazioni", vendite: "/vendite", cassa: "/cassa", ricondizionati: "/ricondizionati", magazzino: "/magazzino", clienti: "/clienti" };

export function IntegrityAlert() {
    const [data, setData] = useState(null);
    const [busy, setBusy] = useState(false);
    const [expanded, setExpanded] = useState(false);

    const load = async () => {
        try {
            const r = await api.get("/integrity/check");
            setData(r.data);
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };
    useEffect(() => { load(); }, []);

    const repair = async () => {
        setBusy(true);
        try {
            const r = await api.post("/integrity/repair", {});
            toast.success(`${r.data.fixed} incongruenze corrette${r.data.remaining ? `, ${r.data.remaining} da verificare a mano` : ""}`);
            setData({ count: r.data.remaining, fixable: r.data.issues.filter((i) => i.fixable).length, issues: r.data.issues });
        } catch (e) {
            toast.error(formatApiError(e));
        } finally {
            setBusy(false);
        }
    };

    if (!data) return null;
    if (data.count === 0) {
        return (
            <div className="flex items-center gap-2 text-xs text-emerald-400/80" data-testid="integrity-ok">
                <ShieldCheck className="h-4 w-4" /> Tutti i dati collegati tra le sezioni sono coerenti.
            </div>
        );
    }
    const shown = expanded ? data.issues : data.issues.slice(0, 5);
    return (
        <Card className="border-amber-500/40 bg-amber-500/5" data-testid="integrity-alert">
            <CardContent className="p-5">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div className="flex items-start gap-3">
                        <ShieldAlert className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
                        <div>
                            <div className="font-display text-lg font-bold" data-testid="integrity-count">
                                {data.count} {data.count === 1 ? "incongruenza rilevata" : "incongruenze rilevate"} tra le sezioni
                            </div>
                            <div className="text-xs text-muted-foreground">
                                Dati collegati (clienti, ricambi, riparazioni, vendite, cassa, ricondizionati) non allineati. {data.fixable} correggibili automaticamente.
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                        <Button variant="outline" size="sm" onClick={load} disabled={busy} data-testid="integrity-refresh"><RefreshCw className="h-4 w-4" /></Button>
                        {data.fixable > 0 && (
                            <Button size="sm" onClick={repair} disabled={busy} data-testid="integrity-repair-button">
                                <Wrench className="h-4 w-4 mr-2" /> Ripara automaticamente
                            </Button>
                        )}
                    </div>
                </div>
                <ul className="mt-4 space-y-1.5" data-testid="integrity-list">
                    {shown.map((i) => (
                        <li key={i.id} className="flex items-center justify-between gap-3 rounded-md border border-border bg-black/30 px-3 py-2 text-sm">
                            <span className="min-w-0 truncate">{i.message}</span>
                            <span className="flex items-center gap-2 shrink-0 text-xs">
                                <span className={i.fixable ? "text-emerald-400" : "text-amber-400"}>{i.fixable ? "auto" : "manuale"}</span>
                                {SECTION_LINK[i.section] && <Link to={SECTION_LINK[i.section]} className="text-primary hover:underline capitalize">{i.section}</Link>}
                            </span>
                        </li>
                    ))}
                </ul>
                {data.issues.length > 5 && (
                    <button onClick={() => setExpanded((v) => !v)} className="mt-2 text-xs text-muted-foreground hover:text-white flex items-center gap-1" data-testid="integrity-toggle">
                        <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} /> {expanded ? "Mostra meno" : `Mostra tutte (${data.issues.length})`}
                    </button>
                )}
            </CardContent>
        </Card>
    );
}
