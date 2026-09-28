import React, { useEffect, useMemo, useState } from "react";
import { api, formatApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, ArrowUpRight, ArrowDownRight, Link2, RefreshCw, Search } from "lucide-react";
import { useColumnWidths, ResizableTh, ScrollTable, useTableSort, useSelection, SelectAllCheckbox, RowCheckbox, BulkBar, bulkDelete } from "@/components/ResizableTable";

const COLS = ["Data", "Tipo", "Categoria", "Descrizione", "Importo", ""];
const COL_DEFAULTS = [160, 100, 150, 420, 130, 70];
const SORT_KEYS = ["date", "type", "category", "description", "amount", null];
const ACCESSORS = { date: (m) => m.date, type: (m) => m.type, category: (m) => m.category, description: (m) => m.description, amount: (m) => m.amount };
import { CashReferenceDialog } from "@/components/CashReferenceDialog";
import { toast } from "sonner";
import { currency, formatDateTime } from "@/lib/format";

export default function CashPage() {
    const [items, setItems] = useState([]);
    const [open, setOpen] = useState(false);
    const [detail, setDetail] = useState(null);
    const [widths, setWidths, resetWidths] = useColumnWidths("cash", COL_DEFAULTS);
    const [tq, setTq] = useState("");
    const filtered = useMemo(() => {
        const t = tq.trim().toLowerCase();
        if (!t) return items;
        return items.filter((x) => [x.description, x.category, x.type, String(x.amount)].some((v) => String(v ?? "").toLowerCase().includes(t)));
    }, [items, tq]);
    const { sorted, sort, toggle: toggleSort } = useTableSort(filtered, ACCESSORS);
    const sel = useSelection(sorted);
    const [bulkBusy, setBulkBusy] = useState(false);
    const removeSelected = async () => {
        if (!window.confirm(`Eliminare ${sel.selected.size} movimenti?`)) return;
        setBulkBusy(true);
        const res = await bulkDelete([...sel.selected], (id) => api.delete(`/cash/${id}`));
        setBulkBusy(false);
        res.failed ? toast.warning(`${res.ok} eliminati, ${res.failed} non eliminabili`) : toast.success(`${res.ok} movimenti eliminati`);
        sel.clear();
        load();
    };
    const [syncing, setSyncing] = useState(false);

    const syncNow = async () => {
        setSyncing(true);
        try {
            const { data } = await api.post("/cash/sync");
            const n = data.sales_added + data.sales_fixed + data.orphans_removed + data.repairs_added + data.parts_added;
            toast.success(n ? `Sincronizzato: ${data.sales_added} vendite, ${data.repairs_added} riparazioni, ${data.parts_added} ricambi aggiunti, ${data.sales_fixed} corretti, ${data.orphans_removed} rimossi` : "Cassa già sincronizzata");
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        } finally {
            setSyncing(false);
        }
    };
    const [form, setForm] = useState({
        type: "entrata",
        category: "altro",
        amount: 0,
        description: "",
    });

    const load = async () => {
        try {
            const { data } = await api.get("/cash");
            setItems(data);
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };
    useEffect(() => {
        load();
    }, []);

    const totals = useMemo(() => {
        const t = { entrata: 0, uscita: 0 };
        items.forEach((m) => {
            t[m.type] += m.amount;
        });
        return { ...t, netto: t.entrata - t.uscita };
    }, [items]);

    const save = async () => {
        try {
            await api.post("/cash", {
                ...form,
                amount: Number(form.amount),
            });
            toast.success("Movimento registrato");
            setOpen(false);
            setForm({
                type: "entrata",
                category: "altro",
                amount: 0,
                description: "",
            });
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    const remove = async (id) => {
        if (!window.confirm("Eliminare movimento?")) return;
        try {
            await api.delete(`/cash/${id}`);
            toast.success("Eliminato");
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                    <div className="eyebrow mb-2">Movimenti</div>
                    <h1 className="font-display text-4xl font-black tracking-tight">
                        Cassa
                    </h1>
                </div>
                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogTrigger asChild>
                        <Button data-testid="new-cash-button">
                            <Plus className="h-4 w-4 mr-2" /> Nuovo movimento
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-card border-border">
                        <DialogHeader>
                            <DialogTitle>Nuovo movimento di cassa</DialogTitle>
                        </DialogHeader>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label className="eyebrow">Tipo</Label>
                                <Select
                                    value={form.type}
                                    onValueChange={(v) => setForm({ ...form, type: v })}
                                >
                                    <SelectTrigger data-testid="cash-type-select">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="entrata">Entrata</SelectItem>
                                        <SelectItem value="uscita">Uscita</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label className="eyebrow">Categoria</Label>
                                <Select
                                    value={form.category}
                                    onValueChange={(v) =>
                                        setForm({ ...form, category: v })
                                    }
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="riparazione">Riparazione</SelectItem>
                                        <SelectItem value="vendita">Vendita</SelectItem>
                                        <SelectItem value="acquisto_ricambi">
                                            Acquisto ricambi
                                        </SelectItem>
                                        <SelectItem value="affitto">Affitto</SelectItem>
                                        <SelectItem value="utenze">Utenze</SelectItem>
                                        <SelectItem value="altro">Altro</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="col-span-2">
                                <Label className="eyebrow">Importo (€)</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    data-testid="cash-amount-input"
                                    value={form.amount}
                                    onChange={(e) =>
                                        setForm({ ...form, amount: e.target.value })
                                    }
                                />
                            </div>
                            <div className="col-span-2">
                                <Label className="eyebrow">Descrizione</Label>
                                <Input
                                    value={form.description}
                                    onChange={(e) =>
                                        setForm({ ...form, description: e.target.value })
                                    }
                                />
                            </div>
                            <Button
                                onClick={save}
                                disabled={!form.amount}
                                data-testid="save-cash-button"
                                className="col-span-2"
                            >
                                Registra
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                    <CardContent className="p-5">
                        <div className="flex items-center justify-between">
                            <div className="eyebrow">Entrate totali</div>
                            <ArrowUpRight className="h-4 w-4 text-emerald-400" />
                        </div>
                        <div className="kpi-value text-3xl mt-3 text-emerald-400">
                            {currency(totals.entrata)}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-5">
                        <div className="flex items-center justify-between">
                            <div className="eyebrow">Uscite totali</div>
                            <ArrowDownRight className="h-4 w-4 text-red-400" />
                        </div>
                        <div className="kpi-value text-3xl mt-3 text-red-400">
                            {currency(totals.uscita)}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-5">
                        <div className="eyebrow">Saldo netto</div>
                        <div className="kpi-value text-3xl mt-3 text-primary">
                            {currency(totals.netto)}
                        </div>
                    </CardContent>
                </Card>
            </div>
            <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="Cerca descrizione, categoria, importo…" value={tq} onChange={(e) => setTq(e.target.value)} data-testid="cash-search" />
            </div>

            <BulkBar count={sel.selected.size} onDelete={removeSelected} onClear={sel.clear} label="movimenti" busy={bulkBusy} />

            <div className="flex justify-between items-center">
                <Button variant="outline" size="sm" onClick={syncNow} disabled={syncing} data-testid="cash-sync-button">
                    <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} /> Sincronizza con vendite, riparazioni e magazzino
                </Button>
                <button className="text-xs text-muted-foreground hover:text-primary" onClick={resetWidths} data-testid="reset-columns-cash">
                    Ripristina larghezza colonne
                </button>
            </div>
            <Card>
                <CardContent className="p-0">
                    <ScrollTable widths={widths} testId="cash-table-scroll" withSelect>
                        <thead>
                            <tr className="text-left text-muted-foreground border-b border-border">
                                <th className="px-3 py-3 w-10"><SelectAllCheckbox checked={sel.allSelected} onChange={sel.toggleAll} testId="cash-select-all" /></th>
                                {COLS.map((c, i) => (
                                    <ResizableTh key={c} index={i} widths={widths} setWidths={setWidths} testId={`cash-th-${i}`} sortKey={SORT_KEYS[i]} sort={sort} onSort={toggleSort} className={i === 4 ? "text-right" : ""}>
                                        {c}
                                    </ResizableTh>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="text-center py-14 text-muted-foreground">
                                        Nessun movimento registrato.
                                    </td>
                                </tr>
                            )}
                            {sorted.map((m, idx) => (
                                <tr
                                    key={m.id}
                                    className={`border-b border-border/50 hover:bg-white/5 cursor-pointer ${idx % 2 ? "bg-white/[0.02]" : ""}`}
                                    onClick={() => setDetail(m)}
                                    data-testid={`cash-row-${m.id}`}
                                >
                                    <RowCheckbox checked={sel.selected.has(m.id)} onChange={() => sel.toggle(m.id)} testId={`cash-select-${m.id}`} />
                                    <td className="px-4 py-3 text-xs text-muted-foreground">
                                        {formatDateTime(m.date)}
                                    </td>
                                    <td className="px-4 py-3">
                                        {m.type === "entrata" ? (
                                            <span className="text-emerald-400 flex items-center gap-1">
                                                <ArrowUpRight className="h-3 w-3" /> Entrata
                                            </span>
                                        ) : (
                                            <span className="text-red-400 flex items-center gap-1">
                                                <ArrowDownRight className="h-3 w-3" /> Uscita
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 capitalize text-muted-foreground">
                                        {m.category.replace("_", " ")}
                                    </td>
                                    <td className="px-4 py-3 truncate" title={m.description}>
                                        <span className="inline-flex items-center gap-1.5 max-w-full">
                                            {m.reference_id && <Link2 className="h-3 w-3 text-primary shrink-0" />}
                                            {m.description || "—"}
                                        </span>
                                    </td>
                                    <td
                                        className={`px-4 py-3 text-right font-mono ${m.type === "entrata" ? "text-emerald-400" : "text-red-400"}`}
                                    >
                                        {m.type === "entrata" ? "+" : "-"}
                                        {currency(m.amount)}
                                    </td>
                                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => remove(m.id)}
                                            className="text-red-400 hover:text-red-300"
                                            data-testid={`delete-cash-${m.id}`}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </ScrollTable>
                </CardContent>
            </Card>
            <CashReferenceDialog movement={detail} onOpenChange={(v) => !v && setDetail(null)} />
        </div>
    );
}
