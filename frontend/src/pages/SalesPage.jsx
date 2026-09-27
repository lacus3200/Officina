import React, { useEffect, useState } from "react";
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
import { Plus, Printer, Trash2, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { currency, formatDateTime } from "@/lib/format";
import { printSaleInvoice } from "@/lib/pdf";
import { CustomerSelect } from "@/components/CustomerSelect";

const EMPTY_ITEM = { part_id: "", description: "", quantity: 1, unit_price: 0 };

export default function SalesPage() {
    const [items, setItems] = useState([]);
    const [parts, setParts] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState({
        customer_id: "",
        customer_name: "",
        items: [{ ...EMPTY_ITEM }],
        payment_method: "contanti",
        notes: "",
    });

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
                                                <Select
                                                    value={it.part_id || "custom"}
                                                    onValueChange={(v) => {
                                                        if (v === "custom") {
                                                            updateItem(i, {
                                                                part_id: "",
                                                            });
                                                        } else {
                                                            const p = parts.find(
                                                                (x) => x.id === v,
                                                            );
                                                            updateItem(i, {
                                                                part_id: v,
                                                                description: p?.name || "",
                                                                unit_price:
                                                                    p?.sell_price || 0,
                                                            });
                                                        }
                                                    }}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Da magazzino…" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="custom">
                                                            — Articolo libero —
                                                        </SelectItem>
                                                        {parts.map((p) => (
                                                            <SelectItem key={p.id} value={p.id}>
                                                                {p.name} · {p.quantity} pz
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
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

            <Card>
                <CardContent className="p-0 overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-muted-foreground border-b border-border">
                                <th className="px-4 py-3 font-medium">Fattura</th>
                                <th className="px-4 py-3 font-medium">Cliente</th>
                                <th className="px-4 py-3 font-medium">Articoli</th>
                                <th className="px-4 py-3 font-medium">Pagamento</th>
                                <th className="px-4 py-3 font-medium text-right">Totale</th>
                                <th className="px-4 py-3 font-medium text-right">Margine</th>
                                <th className="px-4 py-3 font-medium">Data</th>
                                <th className="px-4 py-3 font-medium text-right">Azioni</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="text-center py-14 text-muted-foreground">
                                        <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-40" />
                                        Nessuna vendita registrata.
                                    </td>
                                </tr>
                            )}
                            {items.map((s, idx) => (
                                <tr
                                    key={s.id}
                                    className={`border-b border-border/50 hover:bg-white/5 ${idx % 2 ? "bg-white/[0.02]" : ""}`}
                                >
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
                                        {formatDateTime(s.created_at)}
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
                    </table>
                </CardContent>
            </Card>
        </div>
    );
}
