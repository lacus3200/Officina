import React, { useEffect, useMemo, useState } from "react";
import { api, formatApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Plus, Search, Pencil, Trash2, Printer, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { currency, formatDate, PART_CONDITION, PART_STATUS } from "@/lib/format";
import { printPartLabel } from "@/lib/pdf";
import { PartNameSelect, CompatibleModelsField, PartCategorySelect, PartBrandSelect } from "@/components/PartCatalogFields";
import { PartCatalogManager } from "@/components/PartCatalogManager";
import { useColumnWidths, ResizableTh, ScrollTable, useTableSort, useSelection, SelectAllCheckbox, RowCheckbox, BulkBar, bulkDelete } from "@/components/ResizableTable";
import { DetailDialog } from "@/components/DetailDialog";
import { ColorSelect } from "@/components/ColorSelect";
import { SearchSelect } from "@/components/SearchSelect";
import { isCompatible } from "@/lib/compat";
import { Settings2 } from "lucide-react";

const COLS = ["Nome", "Marca", "Colore", "Categoria", "Condizione", "Stato", "Q.tà", "Costo", "Prezzo", "Posizione", "Entrata / Uscita", "Azioni"];
const COL_DEFAULTS = [240, 130, 110, 130, 120, 130, 90, 100, 100, 110, 140, 130];
const SORT_KEYS = ["name", "brand", "color", "category", "condition", "status", "quantity", "cost_price", "sell_price", "location", "entered_at", null];
const ACCESSORS = { name: (p) => p.name, brand: (p) => p.brand, color: (p) => p.color, category: (p) => p.category, condition: (p) => p.condition, status: (p) => p.status, quantity: (p) => p.quantity, cost_price: (p) => p.cost_price, sell_price: (p) => p.sell_price, location: (p) => p.location, entered_at: (p) => p.entered_at || p.created_at };

const EMPTY = {
    name: "",
    category: "",
    sku: "",
    serial_number: "",
    condition: "nuovo",
    status: "disponibile",
    quantity: 0,
    min_quantity: 0,
    cost_price: 0,
    sell_price: 0,
    location: "",
    notes: "",
    entered_at: "",
    exited_at: "",
    compatible_models: [],
    brand: "",
    color: "",
};

const toDateInput = (iso) => (iso ? iso.slice(0, 10) : "");
const fromDateInput = (d) => (d ? new Date(`${d}T12:00:00`).toISOString() : null);

export default function InventoryPage() {
    const [items, setItems] = useState([]);
    const [q, setQ] = useState("");
    const [lowOnly, setLowOnly] = useState(false);
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState(EMPTY);
    const [editingId, setEditingId] = useState(null);
    const [manageOpen, setManageOpen] = useState(false);
    const [compat, setCompat] = useState({ brand: "", model: "" });
    const [brands, setBrands] = useState([]);
    const [models, setModels] = useState([]);
    useEffect(() => { api.get("/catalog/brands").then((r) => setBrands(r.data)).catch(() => {}); }, []);
    useEffect(() => { compat.brand ? api.get("/catalog/models", { params: { brand: compat.brand } }).then((r) => setModels(r.data)).catch(() => {}) : setModels([]); }, [compat.brand]);
    const [widths, setWidths, resetWidths] = useColumnWidths("inventory", COL_DEFAULTS);
    const filtered = useMemo(() => (compat.brand ? items.filter((p) => isCompatible(p, compat.brand, compat.model)) : items), [items, compat]);
    const { sorted, sort, toggle: toggleSort } = useTableSort(filtered, ACCESSORS);
    const sel = useSelection(sorted);
    const [bulkBusy, setBulkBusy] = useState(false);
    const [rowDetail, setRowDetail] = useState(null);
    const removeSelected = async () => {
        if (!window.confirm(`Eliminare ${sel.selected.size} ricambi?`)) return;
        setBulkBusy(true);
        const res = await bulkDelete([...sel.selected], (id) => api.delete(`/parts/${id}`));
        setBulkBusy(false);
        res.failed ? toast.warning(`${res.ok} eliminati, ${res.failed} non eliminabili`) : toast.success(`${res.ok} ricambi eliminati`);
        sel.clear();
        load();
    };

    const load = async () => {
        try {
            const { data } = await api.get("/parts", {
                params: { q, low_stock: lowOnly ? true : undefined },
            });
            setItems(data);
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };
    useEffect(() => {
        load();
        // eslint-disable-next-line
    }, [q, lowOnly]);

    const save = async () => {
        try {
            const payload = {
                ...form,
                quantity: Number(form.quantity),
                min_quantity: Number(form.min_quantity),
                cost_price: Number(form.cost_price),
                sell_price: Number(form.sell_price),
                entered_at: fromDateInput(form.entered_at),
                exited_at: fromDateInput(form.exited_at),
            };
            if (editingId) {
                await api.put(`/parts/${editingId}`, payload);
                toast.success("Ricambio aggiornato");
            } else {
                await api.post("/parts", payload);
                toast.success("Ricambio aggiunto");
            }
            setOpen(false);
            setForm(EMPTY);
            setEditingId(null);
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    const edit = (p) => {
        setForm({ ...EMPTY, ...p, entered_at: toDateInput(p.entered_at || p.created_at), exited_at: toDateInput(p.exited_at) });
        setEditingId(p.id);
        setOpen(true);
    };

    const remove = async (id) => {
        if (!window.confirm("Eliminare questo ricambio?")) return;
        try {
            await api.delete(`/parts/${id}`);
            toast.success("Ricambio eliminato");
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                    <div className="eyebrow mb-2">Magazzino ricambi</div>
                    <h1 className="font-display text-4xl font-black tracking-tight">
                        Inventario
                    </h1>
                    <p className="text-muted-foreground mt-2">
                        Gestisci pezzi nuovi, usati e ricondizionati.
                    </p>
                </div>
                <Dialog
                    open={open}
                    onOpenChange={(v) => {
                        setOpen(v);
                        if (!v) {
                            setForm(EMPTY);
                            setEditingId(null);
                        }
                    }}
                >
                    <DialogTrigger asChild>
                        <Button data-testid="new-part-button">
                            <Plus className="h-4 w-4 mr-2" /> Nuovo ricambio
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>
                                {editingId ? "Modifica ricambio" : "Nuovo ricambio"}
                            </DialogTitle>
                        </DialogHeader>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2">
                                <Label className="eyebrow">Nome *</Label>
                                <PartNameSelect
                                    value={form.name}
                                    onSelect={(name, category) =>
                                        setForm({ ...form, name, category: category || form.category })
                                    }
                                />
                            </div>
                            <CompatibleModelsField
                                value={form.compatible_models || []}
                                onChange={(compatible_models) => setForm({ ...form, compatible_models })}
                            />
                            <div>
                                <Label className="eyebrow">Categoria</Label>
                                <PartCategorySelect value={form.category || ""} onChange={(category) => setForm({ ...form, category })} />
                            </div>
                            <div>
                                <Label className="eyebrow">Marca ricambio</Label>
                                <PartBrandSelect value={form.brand || ""} onChange={(brand) => setForm({ ...form, brand })} />
                            </div>
                            <div>
                                <Label className="eyebrow">Colore</Label>
                                <ColorSelect value={form.color || ""} onChange={(color) => setForm({ ...form, color })} />
                            </div>
                            <div>
                                <Label className="eyebrow">SKU / Codice</Label>
                                <Input
                                    value={form.sku}
                                    onChange={(e) =>
                                        setForm({ ...form, sku: e.target.value })
                                    }
                                />
                            </div>
                            <div>
                                <Label className="eyebrow">Seriale</Label>
                                <Input
                                    value={form.serial_number}
                                    onChange={(e) =>
                                        setForm({ ...form, serial_number: e.target.value })
                                    }
                                />
                            </div>
                            <div>
                                <Label className="eyebrow">Posizione</Label>
                                <Input
                                    value={form.location}
                                    placeholder="Scaffale A2"
                                    onChange={(e) =>
                                        setForm({ ...form, location: e.target.value })
                                    }
                                />
                            </div>
                            <div>
                                <Label className="eyebrow">Condizione</Label>
                                <Select
                                    value={form.condition}
                                    onValueChange={(v) =>
                                        setForm({ ...form, condition: v })
                                    }
                                >
                                    <SelectTrigger data-testid="part-condition-select">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(PART_CONDITION).map(([k, v]) => (
                                            <SelectItem key={k} value={k}>
                                                {v.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label className="eyebrow">Stato utilizzo</Label>
                                <Select
                                    value={form.status}
                                    onValueChange={(v) =>
                                        setForm({ ...form, status: v })
                                    }
                                >
                                    <SelectTrigger data-testid="part-status-select">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(PART_STATUS).map(([k, v]) => (
                                            <SelectItem key={k} value={k}>
                                                {v.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label className="eyebrow">Quantità</Label>
                                <Input
                                    type="number"
                                    data-testid="part-quantity-input"
                                    value={form.quantity}
                                    onChange={(e) =>
                                        setForm({ ...form, quantity: e.target.value })
                                    }
                                />
                            </div>
                            <div>
                                <Label className="eyebrow">Soglia minima</Label>
                                <Input
                                    type="number"
                                    value={form.min_quantity}
                                    onChange={(e) =>
                                        setForm({ ...form, min_quantity: e.target.value })
                                    }
                                />
                            </div>
                            <div>
                                <Label className="eyebrow">Costo (€)</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={form.cost_price}
                                    onChange={(e) =>
                                        setForm({ ...form, cost_price: e.target.value })
                                    }
                                />
                            </div>
                            <div>
                                <Label className="eyebrow">Prezzo vendita (€)</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={form.sell_price}
                                    onChange={(e) =>
                                        setForm({ ...form, sell_price: e.target.value })
                                    }
                                />
                            </div>
                            <div>
                                <Label className="eyebrow">Data entrata</Label>
                                <Input type="date" value={form.entered_at} onChange={(e) => setForm({ ...form, entered_at: e.target.value })} data-testid="part-entered-date" />
                            </div>
                            <div>
                                <Label className="eyebrow">Data uscita</Label>
                                <Input type="date" value={form.exited_at} onChange={(e) => setForm({ ...form, exited_at: e.target.value })} data-testid="part-exited-date" />
                            </div>
                            <div className="col-span-2">
                                <Label className="eyebrow">Note</Label>
                                <Textarea
                                    value={form.notes}
                                    onChange={(e) =>
                                        setForm({ ...form, notes: e.target.value })
                                    }
                                />
                            </div>
                            <Button
                                data-testid="save-part-button"
                                className="col-span-2 mt-2"
                                onClick={save}
                                disabled={!form.name}
                            >
                                {editingId ? "Aggiorna" : "Aggiungi al magazzino"}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        data-testid="part-search"
                        className="pl-9"
                        placeholder="Cerca nome, SKU, seriale…"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                    />
                </div>
                <Button
                    variant={lowOnly ? "default" : "outline"}
                    data-testid="low-stock-filter"
                    onClick={() => setLowOnly((v) => !v)}
                >
                    <AlertTriangle className="h-4 w-4 mr-2" />
                    Solo sotto scorta
                </Button>
                <Button variant="outline" onClick={() => setManageOpen(true)} data-testid="manage-catalog-button">
                    <Settings2 className="h-4 w-4 mr-2" /> Categorie e catalogo
                </Button>
                <button className="ml-auto text-xs text-muted-foreground hover:text-primary" onClick={resetWidths} data-testid="reset-columns-inventory">
                    Ripristina larghezza colonne
                </button>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Compatibilità</span>
                <div className="w-full sm:w-52">
                    <SearchSelect testId="inventory-compat-brand" value={compat.brand} placeholder="Tutte le marche" searchPlaceholder="Cerca marca…" noneLabel="Tutte le marche"
                        options={brands.map((b) => ({ value: b.name, label: b.name }))} onChange={(v) => setCompat({ brand: v || "", model: "" })} />
                </div>
                <div className="w-full sm:w-64">
                    <SearchSelect testId="inventory-compat-model" value={compat.model} disabled={!compat.brand} placeholder={compat.brand ? "Tutti i modelli" : "Scegli la marca"} searchPlaceholder="Cerca modello…" noneLabel="Tutti i modelli"
                        options={models.map((m) => ({ value: m.name, label: m.code ? `${m.name} (${m.code})` : m.name, keywords: m.code || "" }))} onChange={(v) => setCompat({ ...compat, model: v || "" })} />
                </div>
                {compat.brand && (
                    <span className="text-xs text-sky-400" data-testid="inventory-compat-count">{filtered.length} ricambi compatibili con {compat.brand} {compat.model}</span>
                )}
            </div>
            <PartCatalogManager open={manageOpen} onOpenChange={setManageOpen} onChanged={load} />
            <BulkBar count={sel.selected.size} onDelete={removeSelected} onClear={sel.clear} label="ricambi" busy={bulkBusy} />

            <Card>
                <CardContent className="p-0">
                    <ScrollTable widths={widths} testId="inventory-table-scroll" withSelect>
                        <thead>
                            <tr className="text-left text-muted-foreground border-b border-border">
                                <th className="px-3 py-3 w-10"><SelectAllCheckbox checked={sel.allSelected} onChange={sel.toggleAll} testId="inventory-select-all" /></th>
                                {COLS.map((c, i) => (
                                    <ResizableTh key={c} index={i} widths={widths} setWidths={setWidths} testId={`inventory-th-${i}`} sortKey={SORT_KEYS[i]} sort={sort} onSort={toggleSort} className={[6, 7, 8, 11].includes(i) ? "text-right" : ""}>
                                        {c}
                                    </ResizableTh>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.length === 0 && (
                                <tr>
                                    <td
                                        colSpan={13}
                                        className="text-center py-14 text-muted-foreground"
                                    >
                                        Nessun ricambio nel magazzino.
                                    </td>
                                </tr>
                            )}
                            {sorted.map((p, idx) => {
                                const low = p.quantity <= p.min_quantity;
                                return (
                                    <tr
                                        key={p.id}
                                        onClick={() => setRowDetail(p)} data-testid={`part-row-${p.id}`} className={`border-b border-border/50 hover:bg-white/5 cursor-pointer ${idx % 2 ? "bg-white/[0.02]" : ""}`}
                                    >
                                    <RowCheckbox checked={sel.selected.has(p.id)} onChange={() => sel.toggle(p.id)} testId={`inventory-select-${p.id}`} />
                                        <td className="px-4 py-3">
                                            <div className="font-medium" data-testid={`part-row-${p.id}`}>
                                                {p.name}
                                            </div>
                                            <div className="text-xs text-muted-foreground font-mono">
                                                {p.sku || "—"}
                                            </div>
                                            {p.compatible_models?.length > 0 && (
                                                <div className="text-[11px] text-sky-400/80 truncate" title={p.compatible_models.join(", ")}>
                                                    {p.compatible_models.join(" · ")}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground truncate">
                                            {p.brand || "—"}
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground truncate" data-testid={`part-color-${p.id}`}>
                                            {p.color || "—"}
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground truncate">
                                            {p.category || "—"}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span
                                                className={`inline-block px-2 py-0.5 rounded-md text-xs border ${PART_CONDITION[p.condition]?.color}`}
                                            >
                                                {PART_CONDITION[p.condition]?.label}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span
                                                className={`inline-block px-2 py-0.5 rounded-md text-xs border ${PART_STATUS[p.status]?.color}`}
                                            >
                                                {PART_STATUS[p.status]?.label}
                                            </span>
                                        </td>
                                        <td
                                            className={`px-4 py-3 text-right font-mono ${low ? "text-amber-400 font-bold" : ""}`}
                                        >
                                            {p.quantity}
                                            <span className="text-muted-foreground text-xs">
                                                {" "}
                                                / {p.min_quantity}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                                            {currency(p.cost_price)}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono">
                                            {currency(p.sell_price)}
                                        </td>
                                        <td className="px-4 py-3 text-xs text-muted-foreground">
                                            {p.location || "—"}
                                        </td>
                                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                                            <div>↓ {formatDate(p.entered_at || p.created_at)}</div>
                                            {p.exited_at && <div className="text-sky-400">↑ {formatDate(p.exited_at)}</div>}
                                        </td>
                                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                            <div className="flex gap-1 justify-end">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => printPartLabel(p)}
                                                    title="Stampa etichetta"
                                                    data-testid={`print-label-${p.id}`}
                                                >
                                                    <Printer className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => edit(p)}
                                                    data-testid={`edit-part-${p.id}`}
                                                >
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => remove(p.id)}
                                                    data-testid={`delete-part-${p.id}`}
                                                    className="text-red-400 hover:text-red-300"
                                                >
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
            <DetailDialog
                open={!!rowDetail}
                onOpenChange={(v) => !v && setRowDetail(null)}
                testId="part-detail-dialog"
                title={rowDetail && (rowDetail.name)}
                subtitle={rowDetail && (rowDetail.sku)}
                rows={rowDetail ? [
                    { label: "Marca", value: rowDetail.brand },
                    { label: "Colore", value: rowDetail.color },
                    { label: "Categoria", value: rowDetail.category },
                    { label: "Condizione", value: PART_CONDITION[rowDetail.condition]?.label },
                    { label: "Stato", value: PART_STATUS[rowDetail.status]?.label },
                    { label: "Giacenza", value: `${rowDetail.quantity} pz (min ${rowDetail.min_quantity})` },
                    { label: "Costo unitario", value: currency(rowDetail.cost_price) },
                    { label: "Prezzo vendita", value: currency(rowDetail.sell_price) },
                    { label: "Valore giacenza", value: currency(rowDetail.quantity * rowDetail.cost_price) },
                    { label: "Posizione", value: rowDetail.location },
                    { label: "Compatibile con", value: rowDetail.compatible_models?.join(", ") },
                    { label: "Entrata", value: formatDate(rowDetail.entered_at || rowDetail.created_at) },
                    { label: "Uscita", value: rowDetail.exited_at ? formatDate(rowDetail.exited_at) : undefined },
                    { label: "Note", value: rowDetail.notes },
                ] : []}
            >
                <div className="flex gap-2 justify-end">
                    <Button variant="outline" onClick={() => { edit(rowDetail); setRowDetail(null); }} data-testid="part-detail-edit">Modifica</Button>
                </div>
            </DetailDialog>
        </div>
    );
}
