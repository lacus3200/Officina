import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Search, Pencil, Trash2, RefreshCw, Smartphone, Laptop, Tablet, Monitor } from "lucide-react";
import { toast } from "sonner";
import { currency, formatDate, REFURB_STATUS } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { RefurbFormDialog } from "@/components/refurbished/RefurbFormDialog";
import { RefurbDetailDialog } from "@/components/refurbished/RefurbDetailDialog";
import { useSelection, BulkBar, bulkDelete, SelectAllCheckbox } from "@/components/ResizableTable";

const ICONS = { Smartphone: Smartphone, "PC / Notebook": Laptop, Tablet: Tablet, "TV / Monitor": Monitor };

export default function RefurbishedPage() {
    const [items, setItems] = useState([]);
    const [summary, setSummary] = useState(null);
    const [q, setQ] = useState("");
    const [status, setStatus] = useState("");
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [detail, setDetail] = useState(null);
    const sel = useSelection(items);
    const [bulkBusy, setBulkBusy] = useState(false);
    const removeSelected = async () => {
        if (!window.confirm(`Eliminare ${sel.selected.size} dispositivi e i relativi movimenti di cassa?`)) return;
        setBulkBusy(true);
        const res = await bulkDelete([...sel.selected], (id) => api.delete(`/refurbished/${id}`));
        setBulkBusy(false);
        res.failed ? toast.warning(`${res.ok} eliminati, ${res.failed} non eliminabili`) : toast.success(`${res.ok} dispositivi eliminati`);
        sel.clear();
        load();
    };

    const load = async () => {
        try {
            const [r, s] = await Promise.all([
                api.get("/refurbished", { params: { q: q || undefined, status: status || undefined } }),
                api.get("/refurbished/summary"),
            ]);
            setItems(r.data);
            setSummary(s.data);
            if (detail) setDetail(r.data.find((x) => x.id === detail.id) || null);
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };
    useEffect(() => {
        load();
        // eslint-disable-next-line
    }, [q, status]);

    const remove = async (id) => {
        if (!window.confirm("Eliminare il dispositivo e i relativi movimenti di cassa?")) return;
        const it = items.find((x) => x.id === id);
        const deleteSale = it?.sale_id ? window.confirm("Il dispositivo è stato venduto: eliminare anche la vendita collegata (e il relativo incasso)?") : false;
        const restore = it?.repair?.parts_used?.some((p) => p.part_id) ? window.confirm("La riparazione collegata ha usato ricambi: ripristinarli in magazzino?") : false;
        try {
            await api.delete(`/refurbished/${id}`, { params: { delete_sale: deleteSale, restore_parts: restore } });
            toast.success("Dispositivo eliminato");
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                    <div className="eyebrow mb-2">Compra · Ripara · Rivendi</div>
                    <h1 className="font-display text-4xl font-black tracking-tight">Ricondizionati</h1>
                </div>
                <Button onClick={() => { setEditing(null); setFormOpen(true); }} data-testid="new-refurb-button">
                    <Plus className="h-4 w-4 mr-2" /> Nuovo dispositivo
                </Button>
            </div>

            {summary && (
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                    <Kpi label="In lavorazione" value={summary.in_stock} testId="kpi-in-stock" />
                    <Kpi label="Valore investito" value={currency(summary.stock_value)} testId="kpi-stock-value" />
                    <Kpi label="Venduti" value={summary.sold} testId="kpi-sold" />
                    <Kpi label="Ricavi rivendite" value={currency(summary.revenue)} testId="kpi-revenue" />
                    <Kpi label="Margine totale" value={currency(summary.margin)} accent testId="kpi-margin" />
                </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative max-w-md flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input className="pl-9" placeholder="Cerca codice, marca, modello, seriale…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="refurb-search" />
                </div>
                <div className="flex gap-1 flex-wrap">
                    <FilterChip active={status === ""} onClick={() => setStatus("")} label="Tutti" />
                    {Object.entries(REFURB_STATUS).map(([k, v]) => (
                        <FilterChip key={k} active={status === k} onClick={() => setStatus(k)} label={v.label} testId={`filter-${k}`} />
                    ))}
                </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
                {items.length > 0 && (
                    <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                        <SelectAllCheckbox checked={sel.allSelected} onChange={sel.toggleAll} testId="refurbished-select-all" /> Seleziona tutti
                    </label>
                )}
                <BulkBar count={sel.selected.size} onDelete={removeSelected} onClear={sel.clear} label="dispositivi" busy={bulkBusy} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {items.length === 0 && (
                    <Card className="col-span-full">
                        <CardContent className="p-12 text-center text-muted-foreground">
                            <RefreshCw className="h-8 w-8 mx-auto mb-2 opacity-40" />
                            Nessun dispositivo ricondizionato.
                        </CardContent>
                    </Card>
                )}
                {items.map((it) => {
                    const Icon = ICONS[it.device_type] || RefreshCw;
                    const sold = it.status === "venduto";
                    const m = sold ? it.margin : it.expected_margin;
                    return (
                        <Card
                            key={it.id}
                            className={`hover:border-primary/40 transition-colors cursor-pointer group ${sel.selected.has(it.id) ? "border-primary/60 bg-primary/5" : ""}`}
                            onClick={() => setDetail(it)}
                            data-testid={`refurb-card-${it.id}`}
                        >
                            <CardContent className="p-5 space-y-4">
                                <div className="flex justify-between items-start gap-2">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <input
                                            type="checkbox"
                                            className="h-4 w-4 accent-[hsl(var(--primary))] cursor-pointer shrink-0"
                                            checked={sel.selected.has(it.id)}
                                            onChange={() => sel.toggle(it.id)}
                                            onClick={(e) => e.stopPropagation()}
                                            data-testid={`refurbished-select-${it.id}`}
                                            aria-label="Seleziona dispositivo"
                                        />
                                        <div className="h-10 w-10 rounded-md bg-primary/15 border border-primary/30 grid place-items-center shrink-0">
                                            <Icon className="h-5 w-5 text-primary" />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="font-mono text-xs text-primary">{it.code}</div>
                                            <div className="font-display font-semibold truncate">
                                                {it.brand || it.device_type} {it.model}
                                            </div>
                                        </div>
                                    </div>
                                    <StatusBadge map={REFURB_STATUS} value={it.status} />
                                </div>

                                <div className="grid grid-cols-3 gap-2 text-sm">
                                    <div>
                                        <div className="eyebrow">Acquisto</div>
                                        <div className="font-mono">{currency(it.purchase_cost)}</div>
                                    </div>
                                    <div>
                                        <div className="eyebrow">Costo tot.</div>
                                        <div className="font-mono">{currency(it.total_cost)}</div>
                                    </div>
                                    <div>
                                        <div className="eyebrow">{sold ? "Margine" : "Prev."}</div>
                                        <div className={`font-mono font-semibold ${m >= 0 ? "text-emerald-400" : "text-red-400"}`}>{currency(m)}</div>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border pt-3">
                                    <span>
                                        {sold ? `Venduto il ${formatDate(it.sold_at)}` : `Acquistato il ${formatDate(it.purchase_date)}`}
                                        {it.repair ? ` · ${it.repair.ticket_number}` : ""}
                                    </span>
                                    <div className="flex gap-1 opacity-60 group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
                                        {!sold && (
                                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(it); setFormOpen(true); }} data-testid={`edit-refurb-${it.id}`}>
                                                <Pencil className="h-3.5 w-3.5" />
                                            </Button>
                                        )}
                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400" onClick={() => remove(it.id)} data-testid={`delete-refurb-${it.id}`}>
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            <RefurbFormDialog open={formOpen} onOpenChange={setFormOpen} editing={editing} onSaved={load} />
            <RefurbDetailDialog item={detail} onOpenChange={(v) => !v && setDetail(null)} onChanged={load} />
        </div>
    );
}

function Kpi({ label, value, accent, testId }) {
    return (
        <Card>
            <CardContent className="p-4">
                <div className="eyebrow">{label}</div>
                <div className={`font-display text-2xl font-bold ${accent ? "text-primary" : ""}`} data-testid={testId}>{value}</div>
            </CardContent>
        </Card>
    );
}

function FilterChip({ active, onClick, label, testId }) {
    return (
        <button
            onClick={onClick}
            data-testid={testId}
            className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${active ? "bg-primary/15 text-primary border-primary/30" : "text-zinc-400 border-border hover:text-white hover:bg-white/5"}`}
        >
            {label}
        </button>
    );
}
