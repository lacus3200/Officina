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
import { RefurbDeleteDialog } from "@/components/refurbished/RefurbDeleteDialog";
import { useColumnWidths, ResizableTh, ScrollTable, useTableSort, useSelection, SelectAllCheckbox, RowCheckbox, BulkBar, bulkDelete } from "@/components/ResizableTable";

const COLS = ["Codice", "Dispositivo", "Colore", "Grado", "Stato", "Acquisto", "Costo tot.", "Prezzo", "Margine", "Ticket", "Date", "Azioni"];
const COL_DEFAULTS = [110, 240, 110, 80, 150, 100, 110, 110, 110, 110, 130, 110];
const SORT_KEYS = ["code", "device", "color", "grade", "status", "purchase_cost", "total_cost", "price", "margin", "ticket", "purchase_date", null];
const ACCESSORS = {
    code: (i) => i.code, device: (i) => `${i.brand || i.device_type} ${i.model || ""}`, color: (i) => i.color, grade: (i) => i.grade, status: (i) => i.status,
    purchase_cost: (i) => i.purchase_cost, total_cost: (i) => i.total_cost, price: (i) => (i.status === "venduto" ? i.sale_price : i.target_price),
    margin: (i) => (i.status === "venduto" ? i.margin : i.expected_margin), ticket: (i) => i.repair?.ticket_number, purchase_date: (i) => i.purchase_date,
};

const ICONS = { Smartphone: Smartphone, "PC / Notebook": Laptop, Tablet: Tablet, "TV / Monitor": Monitor };

export default function RefurbishedPage() {
    const [items, setItems] = useState([]);
    const [summary, setSummary] = useState(null);
    const [q, setQ] = useState("");
    const [status, setStatus] = useState("");
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [detail, setDetail] = useState(null);
    const [widths, setWidths, resetWidths] = useColumnWidths("refurbished", COL_DEFAULTS);
    const { sorted, sort, toggle: toggleSort } = useTableSort(items, ACCESSORS);
    const sel = useSelection(sorted);
    const [bulkBusy, setBulkBusy] = useState(false);
    const [toDelete, setToDelete] = useState(null);
    const removeSelected = () => setToDelete(items.filter((x) => sel.selected.has(x.id)));
    const confirmDelete = async (opts) => {
        setBulkBusy(true);
        const res = await bulkDelete(toDelete.map((x) => x.id), (id) => api.delete(`/refurbished/${id}`, { params: opts }));
        setBulkBusy(false);
        setToDelete(null);
        res.failed ? toast.warning(`${res.ok} eliminati, ${res.failed} non eliminabili`) : toast.success(res.ok === 1 ? "Dispositivo eliminato" : `${res.ok} dispositivi eliminati`);
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

    const remove = (id) => {
        const it = items.find((x) => x.id === id);
        if (it) setToDelete([it]);
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

            <BulkBar count={sel.selected.size} onDelete={removeSelected} onClear={sel.clear} label="dispositivi" busy={bulkBusy} />
            <div className="flex justify-end">
                <button className="text-xs text-muted-foreground hover:text-primary" onClick={resetWidths} data-testid="reset-columns-refurbished">
                    Ripristina larghezza colonne
                </button>
            </div>

            <Card>
                <CardContent className="p-0">
                    <ScrollTable widths={widths} testId="refurbished-table-scroll" withSelect>
                        <thead>
                            <tr className="text-left text-muted-foreground border-b border-border">
                                <th className="px-3 py-3 w-10"><SelectAllCheckbox checked={sel.allSelected} onChange={sel.toggleAll} testId="refurbished-select-all" /></th>
                                {COLS.map((c, i) => (
                                    <ResizableTh key={c} index={i} widths={widths} setWidths={setWidths} testId={`refurbished-th-${i}`} sortKey={SORT_KEYS[i]} sort={sort} onSort={toggleSort} className={[5, 6, 7, 8, 11].includes(i) ? "text-right" : ""}>
                                        {c}
                                    </ResizableTh>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.length === 0 && (
                                <tr>
                                    <td colSpan={13} className="text-center py-14 text-muted-foreground">
                                        <RefreshCw className="h-8 w-8 mx-auto mb-2 opacity-40" />
                                        Nessun dispositivo ricondizionato.
                                    </td>
                                </tr>
                            )}
                            {sorted.map((it, idx) => {
                                const Icon = ICONS[it.device_type] || RefreshCw;
                                const sold = it.status === "venduto";
                                const m = sold ? it.margin : it.expected_margin;
                                return (
                                    <tr key={it.id} onClick={() => setDetail(it)} data-testid={`refurb-card-${it.id}`} className={`border-b border-border/50 hover:bg-white/5 cursor-pointer ${idx % 2 ? "bg-white/[0.02]" : ""}`}>
                                        <RowCheckbox checked={sel.selected.has(it.id)} onChange={() => sel.toggle(it.id)} testId={`refurbished-select-${it.id}`} />
                                        <td className="px-4 py-3 font-mono text-xs text-primary whitespace-nowrap">{it.code}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <Icon className="h-4 w-4 text-primary shrink-0" />
                                                <div className="min-w-0">
                                                    <div className="font-medium truncate">{it.brand || it.device_type} {it.model}</div>
                                                    {it.serial_or_imei && <div className="text-xs text-muted-foreground font-mono truncate">{it.serial_or_imei}</div>}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground truncate">{it.color || "—"}</td>
                                        <td className="px-4 py-3 text-muted-foreground">{it.grade || "—"}</td>
                                        <td className="px-4 py-3"><StatusBadge map={REFURB_STATUS} value={it.status} /></td>
                                        <td className="px-4 py-3 text-right font-mono text-muted-foreground">{currency(it.purchase_cost)}</td>
                                        <td className="px-4 py-3 text-right font-mono">{currency(it.total_cost)}</td>
                                        <td className="px-4 py-3 text-right font-mono">{currency(sold ? it.sale_price : it.target_price)}</td>
                                        <td className={`px-4 py-3 text-right font-mono font-semibold ${m >= 0 ? "text-emerald-400" : "text-red-400"}`}>{currency(m)}</td>
                                        <td className="px-4 py-3 font-mono text-xs text-sky-400 whitespace-nowrap">{it.repair?.ticket_number || "—"}</td>
                                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                                            <div>↓ {formatDate(it.purchase_date)}</div>
                                            {sold && <div className="text-emerald-400">↑ {formatDate(it.sold_at)}</div>}
                                        </td>
                                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                            <div className="flex gap-1 justify-end">
                                                {!sold && (
                                                    <Button variant="ghost" size="icon" onClick={() => { setEditing(it); setFormOpen(true); }} data-testid={`edit-refurb-${it.id}`}>
                                                        <Pencil className="h-4 w-4" />
                                                    </Button>
                                                )}
                                                <Button variant="ghost" size="icon" className="text-red-400 hover:text-red-300" onClick={() => remove(it.id)} data-testid={`delete-refurb-${it.id}`}>
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </ScrollTable>
                </CardContent>
            </Card>

            <RefurbFormDialog open={formOpen} onOpenChange={setFormOpen} editing={editing} onSaved={load} />
            <RefurbDetailDialog item={detail} onOpenChange={(v) => !v && setDetail(null)} onChanged={load} />
            <RefurbDeleteDialog items={toDelete} open={!!toDelete} onClose={() => setToDelete(null)} onConfirm={confirmDelete} busy={bulkBusy} />
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
