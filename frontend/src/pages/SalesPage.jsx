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
import { Textarea } from "@/components/ui/textarea";
import { Plus, Printer, Trash2, ShoppingCart, Search } from "lucide-react";
import { toast } from "sonner";
import { currency, formatDateTime } from "@/lib/format";
import { printSaleInvoice } from "@/lib/pdf";
import { CustomerSelect } from "@/components/CustomerSelect";
import { SearchSelect } from "@/components/SearchSelect";
import { useColumnWidths, ResizableTh, ScrollTable, useTableSort, useSelection, SelectAllCheckbox, RowCheckbox, BulkBar, bulkDelete } from "@/components/ResizableTable";

const COLS = ["Fattura", "Cliente", "Articoli", "Pagamento", "Totale", "Margine", "Data", "Azioni"];
const COL_DEFAULTS = [120, 180, 300, 120, 110, 110, 130, 110];
const SORT_KEYS = ["invoice_number", "customer_name", "items", "payment_method", "total", "margin", "created_at", null];
const ACCESSORS = { invoice_number: (s) => s.invoice_number, customer_name: (s) => s.customer_name, items: (s) => s.items?.map((i) => i.description).join(", "), payment_method: (s) => s.payment_method, total: (s) => s.total, margin: (s) => s.margin, created_at: (s) => s.created_at };

const EMPTY_ITEM = { part_id: "", description: "", quantity: 1, unit_price: 0 };

export default function SalesPage() {
    const [items, setItems] = useState([]);
    const [parts, setParts] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [open, setOpen] = useState(false);
    const [widths, setWidths, resetWidths] = useColumnWidths("sales", COL_DEFAULTS);
    const [tq, setTq] = useState("");
    const filtered = useMemo(() => {
        const t = tq.trim().toLowerCase();
        if (!t) return items;
        return items.filter((x) => [x.invoice_number, x.customer_name, x.payment_method, x.notes, ...(x.items || []).map((i) => i.description)].some((v) => String(v ?? "").toLowerCase().includes(t)));
    }, [items, tq]);
    const { sorted, sort, toggle: toggleSort } = useTableSort(filtered, ACCESSORS);
    const sel = useSelection(sorted);
    const [bulkBusy, setBulkBusy] = useState(false);
    const removeSelected = async () => {
        if (!window.confirm(`Eliminare ${sel.selected.size} vendite?`)) return;
        setBulkBusy(true);
        const res = await bulkDelete([...sel.selected], (id) => api.delete(`/sales/${id}`));
        setBulkBusy(false);
        res.failed ? toast.warning(`${res.ok} eliminati, ${res.failed} non eliminabili`) : toast.success(`${res.ok} vendite eliminati`);
        sel.clear();
        load();
    };
    const [form, setForm] = useState({
        customer_id: "",
        customer_name: "",
        items: [{ ...EMPTY_ITEM }],
        payment_method: "contanti",
        notes: "",
        date: "",
    });
    const [dateEdit, setDateEdit] = useState(null);

    const saveDate = async () => {
        try {
            await api.put(`/sales/${dateEdit.id}`, { date: new Date(`${dateEdit.date}T12:00:00`).toISOString() });
            toast.success("Data vendita aggiornata");
            setDateEdit(null);
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    const load = async () => {
        try {
            const [s, p, c] = await Promise.all([
                api.get("/sales"),
                api.get("/parts"),
                api.get("/customers"),
            ]);
            setItems(s.data);
            setParts(p.data);
            setCustomers(c.data);
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };
    useEffect(() => {
        load();
    }, []);

    const addItem = () =>
        setForm({ ...form, items: [...form.items, { ...EMPTY_ITEM }] });
    const updateItem = (i, patch) => {
        const arr = [...form.items];
        arr[i] = { ...arr[i], ...patch };
        setForm({ ...form, items: arr });
    };
    const removeItem = (i) =>
        setForm({ ...form, items: form.items.filter((_, idx) => idx !== i) });

    const total = form.items.reduce(
        (s, it) => s + Number(it.quantity || 0) * Number(it.unit_price || 0),
        0,
    );
    const costTotal = form.items.reduce((s, it) => {
        const p = parts.find((x) => x.id === it.part_id);
        return s + (p?.cost_price || 0) * Number(it.quantity || 0);
    }, 0);

    const save = async () => {
        try {
            await api.post("/sales", {
                ...form,
                date: form.date ? new Date(`${form.date}T12:00:00`).toISOString() : null,
                total,
                cost_total: costTotal,
            });
            toast.success("Vendita registrata");
            setOpen(false);
            setForm({
                customer_id: "",
                customer_name: "",
                items: [{ ...EMPTY_ITEM }],
                payment_method: "contanti",
                notes: "",
                date: "",
            });
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    const remove = async (id) => {
        if (!window.confirm("Annullare questa vendita?")) return;
        try {
            await api.delete(`/sales/${id}`);
            toast.success("Vendita annullata");
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                    <div className="eyebrow mb-2">Rivendite</div>
                    <h1 className="font-display text-4xl font-black tracking-tight">
                        Vendite
                    </h1>
                </div>
                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogTrigger asChild>
                        <Button data-testid="new-sale-button">
                            <Plus className="h-4 w-4 mr-2" /> Nuova vendita
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-card border-border max-w-3xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>Nuova vendita</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label className="eyebrow">Cliente</Label>
                                    <CustomerSelect
                                        customers={customers}
                                        value={form.customer_id}
                                        testId="sale-customer-select"
                                        noneLabel="— walk-in —"
                                        onCreated={(c) => setCustomers((prev) => [c, ...prev])}
                                        onChange={(id, c) => setForm({ ...form, customer_id: id, customer_name: c?.name || "" })}
                                    />
                                </div>
                                <div>
                                    <Label className="eyebrow">Data vendita</Label>
                                    <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} data-testid="sale-date-input" />
                                </div>
                                <div>
                                    <Label className="eyebrow">Pagamento</Label>
                                    <Select
                                        value={form.payment_method}
                                        onValueChange={(v) =>
                                            setForm({ ...form, payment_method: v })
                                        }
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="contanti">Contanti</SelectItem>
                                            <SelectItem value="carta">Carta</SelectItem>
                                            <SelectItem value="bonifico">Bonifico</SelectItem>
                                            <SelectItem value="altro">Altro</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <Label className="eyebrow">Articoli</Label>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={addItem}
                                        data-testid="add-sale-item"
                                    >
                                        <Plus className="h-3 w-3 mr-1" /> Aggiungi articolo
                                    </Button>
                                </div>
                                <div className="space-y-2">
                                    {form.items.map((it, i) => (
                                        <div
                                            key={i}
                                            className="grid grid-cols-12 gap-2 items-center"
                                        >
                                            <div className="col-span-5">
                                                <SearchSelect
                                                    testId={`sale-part-select-${i}`}
                                                    value={it.part_id || ""}
                                                    placeholder="Da magazzino…"
                                                    searchPlaceholder="Cerca ricambio…"
                                                    noneLabel="— Articolo libero —"
                                                    options={parts.map((p) => ({ value: p.id, label: `${p.name}${p.brand ? ` (${p.brand})` : ""} · ${p.quantity} pz`, keywords: p.brand || "" }))}
                                                    onChange={(v) => {
                                                        if (!v) return updateItem(i, { part_id: "" });
                                                        const p = parts.find((x) => x.id === v);
                                                        updateItem(i, { part_id: v, description: p?.name || "", unit_price: p?.sell_price || 0 });
                                                    }}
                                                />
                                            </div>
                                            <Input
                                                className="col-span-3"
                                                placeholder="Descrizione"
                                                value={it.description}
                                                onChange={(e) =>
                                                    updateItem(i, {
                                                        description: e.target.value,
                                                    })
                                                }
                                            />
                                            <Input
                                                type="number"
                                                min={1}
                                                className="col-span-1"
                                                value={it.quantity}
                                                onChange={(e) =>
                                                    updateItem(i, {
                                                        quantity: Number(e.target.value),
                                                    })
                                                }
                                            />
                                            <Input
                                                type="number"
                                                step="0.01"
                                                className="col-span-2"
                                                value={it.unit_price}
                                                onChange={(e) =>
                                                    updateItem(i, {
                                                        unit_price: Number(e.target.value),
                                                    })
                                                }
                                            />
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="col-span-1 text-red-400"
                                                onClick={() => removeItem(i)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <Label className="eyebrow">Note</Label>
                                <Textarea
                                    value={form.notes}
                                    onChange={(e) =>
                                        setForm({ ...form, notes: e.target.value })
                                    }
                                />
                            </div>

                            <div className="border-t border-border pt-4 flex items-center justify-between">
                                <div>
                                    <div className="eyebrow">Margine stimato</div>
                                    <div className="font-mono">
                                        {currency(total - costTotal)}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="eyebrow">Totale</div>
                                    <div className="font-display text-3xl font-bold text-primary">
                                        {currency(total)}
                                    </div>
                                </div>
                            </div>

                            <Button
                                onClick={save}
                                data-testid="save-sale-button"
                                disabled={
                                    form.items.length === 0 ||
                                    form.items.every((i) => !i.description)
                                }
                                className="w-full"
                            >
                                Registra vendita
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>
            <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="Cerca fattura, cliente, articolo…" value={tq} onChange={(e) => setTq(e.target.value)} data-testid="sales-search" />
            </div>

            <BulkBar count={sel.selected.size} onDelete={removeSelected} onClear={sel.clear} label="vendite" busy={bulkBusy} />

            <div className="flex justify-end">
                <button className="text-xs text-muted-foreground hover:text-primary" onClick={resetWidths} data-testid="reset-columns-sales">
                    Ripristina larghezza colonne
                </button>
            </div>
            <Card>
                <CardContent className="p-0">
                    <ScrollTable widths={widths} testId="sales-table-scroll" withSelect>
                        <thead>
                            <tr className="text-left text-muted-foreground border-b border-border">
                                <th className="px-3 py-3 w-10"><SelectAllCheckbox checked={sel.allSelected} onChange={sel.toggleAll} testId="sales-select-all" /></th>
                                {COLS.map((c, i) => (
                                    <ResizableTh key={c} index={i} widths={widths} setWidths={setWidths} testId={`sales-th-${i}`} sortKey={SORT_KEYS[i]} sort={sort} onSort={toggleSort} className={[4, 5, 7].includes(i) ? "text-right" : ""}>
                                        {c}
                                    </ResizableTh>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.length === 0 && (
                                <tr>
                                    <td colSpan={9} className="text-center py-14 text-muted-foreground">
                                        <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-40" />
                                        Nessuna vendita registrata.
                                    </td>
                                </tr>
                            )}
                            {sorted.map((s, idx) => (
                                <tr
                                    key={s.id}
                                    className={`border-b border-border/50 hover:bg-white/5 ${idx % 2 ? "bg-white/[0.02]" : ""}`}
                                >
                                    <RowCheckbox checked={sel.selected.has(s.id)} onChange={() => sel.toggle(s.id)} testId={`sales-select-${s.id}`} />
                                    <td className="px-4 py-3 font-mono text-primary font-semibold">
                                        {s.invoice_number}
                                    </td>
                                    <td className="px-4 py-3">
                                        {s.customer_name || "walk-in"}
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground">
                                        {s.items.length} articoli
                                    </td>
                                    <td className="px-4 py-3 capitalize">
                                        {s.payment_method}
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono">
                                        {currency(s.total)}
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono text-emerald-400">
                                        {currency(s.margin)}
                                    </td>
                                    <td className="px-4 py-3 text-xs text-muted-foreground">
                                        <button
                                            className="hover:text-primary underline-offset-2 hover:underline text-left"
                                            title="Modifica data vendita"
                                            onClick={() => setDateEdit({ id: s.id, date: s.created_at.slice(0, 10) })}
                                            data-testid={`sale-date-${s.id}`}
                                        >
                                            {formatDateTime(s.created_at)}
                                        </button>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex gap-1 justify-end">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => printSaleInvoice(s)}
                                                data-testid={`print-sale-${s.id}`}
                                            >
                                                <Printer className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => remove(s.id)}
                                                className="text-red-400 hover:text-red-300"
                                                data-testid={`delete-sale-${s.id}`}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </ScrollTable>
                </CardContent>
            </Card>
            <Dialog open={!!dateEdit} onOpenChange={(v) => !v && setDateEdit(null)}>
                <DialogContent className="bg-card border-border max-w-sm" data-testid="sale-date-dialog">
                    <DialogHeader><DialogTitle>Modifica data vendita</DialogTitle></DialogHeader>
                    <Input type="date" value={dateEdit?.date || ""} onChange={(e) => setDateEdit({ ...dateEdit, date: e.target.value })} data-testid="sale-date-edit-input" />
                    <Button onClick={saveDate} disabled={!dateEdit?.date} data-testid="sale-date-save">Salva</Button>
                </DialogContent>
            </Dialog>
        </div>
    );
}
