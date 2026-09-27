import React, { useEffect, useState } from "react";
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
import { currency, PART_CONDITION, PART_STATUS } from "@/lib/format";
import { printPartLabel } from "@/lib/pdf";

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
};

export default function InventoryPage() {
    const [items, setItems] = useState([]);
    const [q, setQ] = useState("");
    const [lowOnly, setLowOnly] = useState(false);
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState(EMPTY);
    const [editingId, setEditingId] = useState(null);

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
        setForm({ ...EMPTY, ...p });
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
                                <Input
                                    data-testid="part-name-input"
                                    value={form.name}
                                    onChange={(e) =>
                                        setForm({ ...form, name: e.target.value })
                                    }
                                />
                            </div>
                            <div>
                                <Label className="eyebrow">Categoria</Label>
                                <Input
                                    value={form.category}
                                    placeholder="Batteria, Schermo, SSD…"
                                    onChange={(e) =>
                                        setForm({ ...form, category: e.target.value })
                                    }
                                />
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
            </div>

            <Card>
                <CardContent className="p-0 overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-muted-foreground border-b border-border">
                                <th className="px-4 py-3 font-medium">Nome</th>
                                <th className="px-4 py-3 font-medium">Categoria</th>
                                <th className="px-4 py-3 font-medium">Condizione</th>
                                <th className="px-4 py-3 font-medium">Stato</th>
                                <th className="px-4 py-3 font-medium text-right">Q.tà</th>
                                <th className="px-4 py-3 font-medium text-right">Costo</th>
                                <th className="px-4 py-3 font-medium text-right">Prezzo</th>
                                <th className="px-4 py-3 font-medium">Posizione</th>
                                <th className="px-4 py-3 font-medium text-right">Azioni</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.length === 0 && (
                                <tr>
                                    <td
                                        colSpan={9}
                                        className="text-center py-14 text-muted-foreground"
                                    >
                                        Nessun ricambio nel magazzino.
                                    </td>
                                </tr>
                            )}
                            {items.map((p, idx) => {
                                const low = p.quantity <= p.min_quantity;
                                return (
                                    <tr
                                        key={p.id}
                                        className={`border-b border-border/50 hover:bg-white/5 ${idx % 2 ? "bg-white/[0.02]" : ""}`}
                                    >
                                        <td className="px-4 py-3">
                                            <div className="font-medium" data-testid={`part-row-${p.id}`}>
                                                {p.name}
                                            </div>
                                            <div className="text-xs text-muted-foreground font-mono">
                                                {p.sku || "—"}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">
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
                                        <td className="px-4 py-3">
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
                    </table>
                </CardContent>
            </Card>
        </div>
    );
}
