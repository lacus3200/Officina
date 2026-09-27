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
import { Checkbox } from "@/components/ui/checkbox";
import {
    Plus,
    Search,
    Pencil,
    Trash2,
    Printer,
    Filter,
    Wrench,
} from "lucide-react";
import { toast } from "sonner";
import {
    currency,
    formatDate,
    REPAIR_STATUS,
    DEVICE_TYPES,
} from "@/lib/format";
import { printRepairReceipt } from "@/lib/pdf";
import { CustomerSelect } from "@/components/CustomerSelect";
import { DeviceBrandModelFields } from "@/components/DeviceBrandModelFields";
import { SerialHistoryAlert } from "@/components/SerialHistoryAlert";

const toDateInput = (iso) => (iso ? iso.slice(0, 10) : "");
const fromDateInput = (d, fallback) => (d ? new Date(`${d}T12:00:00`).toISOString() : fallback || null);

const EMPTY = {
    customer_id: "",
    customer_name: "",
    device_type: "PC / Notebook",
    device_brand: "",
    device_model: "",
    serial_or_imei: "",
    problem: "",
    diagnosis: "",
    status: "in_attesa",
    estimate: 0,
    labor_cost: 0,
    final_price: 0,
    paid: false,
    parts_used: [],
    technical_notes: "",
    received_at: "",
    delivered_at: "",
};

export default function RepairsPage() {
    const [items, setItems] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [parts, setParts] = useState([]);
    const [q, setQ] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState(EMPTY);
    const [editingId, setEditingId] = useState(null);

    const load = async () => {
        try {
            const params = { q };
            if (statusFilter !== "all") params.status = statusFilter;
            const [r, c, p] = await Promise.all([
                api.get("/repairs", { params }),
                api.get("/customers"),
                api.get("/parts"),
            ]);
            setItems(r.data);
            setCustomers(c.data);
            setParts(p.data);
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };
    useEffect(() => {
        load();
        // eslint-disable-next-line
    }, [q, statusFilter]);

    const save = async () => {
        try {
            const payload = {
                ...form,
                estimate: Number(form.estimate),
                labor_cost: Number(form.labor_cost),
                final_price: Number(form.final_price),
                received_at: fromDateInput(form.received_at),
                delivered_at: fromDateInput(form.delivered_at),
            };
            if (!payload.received_at) delete payload.received_at;
            if (!payload.delivered_at) delete payload.delivered_at;
            if (editingId) {
                await api.put(`/repairs/${editingId}`, payload);
                toast.success("Riparazione aggiornata");
            } else {
                await api.post("/repairs", payload);
                toast.success("Riparazione creata");
            }
            setOpen(false);
            setForm(EMPTY);
            setEditingId(null);
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    const edit = (r) => {
        setForm({ ...EMPTY, ...r, received_at: toDateInput(r.received_at || r.created_at), delivered_at: toDateInput(r.delivered_at) });
        setEditingId(r.id);
        setOpen(true);
    };

    const remove = async (id) => {
        if (!window.confirm("Eliminare questa riparazione?")) return;
        try {
            await api.delete(`/repairs/${id}`);
            toast.success("Eliminata");
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    const addPart = () => {
        setForm({
            ...form,
            parts_used: [
                ...form.parts_used,
                { part_id: "", part_name: "", quantity: 1, unit_price: 0 },
            ],
        });
    };
    const updatePart = (i, patch) => {
        const arr = [...form.parts_used];
        arr[i] = { ...arr[i], ...patch };
        setForm({ ...form, parts_used: arr });
    };
    const removePart = (i) => {
        const arr = form.parts_used.filter((_, idx) => idx !== i);
        setForm({ ...form, parts_used: arr });
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                    <div className="eyebrow mb-2">Officina</div>
                    <h1 className="font-display text-4xl font-black tracking-tight">
                        Riparazioni
                    </h1>
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
                        <Button data-testid="new-repair-button">
                            <Plus className="h-4 w-4 mr-2" /> Nuova riparazione
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-card border-border max-w-3xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>
                                {editingId ? "Modifica riparazione" : "Nuova riparazione"}
                            </DialogTitle>
                        </DialogHeader>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2">
                                <Label className="eyebrow">Cliente</Label>
                                <CustomerSelect
                                    customers={customers}
                                    value={form.customer_id}
                                    testId="repair-customer-select"
                                    onCreated={(c) => setCustomers((prev) => [c, ...prev])}
                                    onChange={(id, c) =>
                                        setForm({ ...form, customer_id: id, customer_name: id ? c?.name || "" : form.customer_name })
                                    }
                                />
                            </div>
                            {!form.customer_id && (
                                <div className="col-span-2">
                                    <Label className="eyebrow">Nome cliente (walk-in)</Label>
                                    <Input
                                        value={form.customer_name}
                                        onChange={(e) =>
                                            setForm({ ...form, customer_name: e.target.value })
                                        }
                                    />
                                </div>
                            )}
                            <div>
                                <Label className="eyebrow">Tipo dispositivo</Label>
                                <Select
                                    value={form.device_type}
                                    onValueChange={(v) => setForm({ ...form, device_type: v })}
                                >
                                    <SelectTrigger data-testid="repair-device-type-select">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {DEVICE_TYPES.map((d) => (
                                            <SelectItem key={d} value={d}>
                                                {d}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <DeviceBrandModelFields
                                brand={form.device_brand}
                                model={form.device_model}
                                deviceType={form.device_type}
                                onChange={({ brand, model }) => setForm({ ...form, device_brand: brand, device_model: model })}
                            />
                            <div>
                                <Label className="eyebrow">Seriale / IMEI</Label>
                                <Input
                                    data-testid="repair-serial-input"
                                    value={form.serial_or_imei}
                                    onChange={(e) =>
                                        setForm({ ...form, serial_or_imei: e.target.value })
                                    }
                                />
                            </div>
                            <SerialHistoryAlert serial={form.serial_or_imei} excludeId={editingId} />
                            <div>
                                <Label className="eyebrow">Data entrata</Label>
                                <Input
                                    type="date"
                                    data-testid="repair-received-date"
                                    value={form.received_at}
                                    onChange={(e) => setForm({ ...form, received_at: e.target.value })}
                                />
                            </div>
                            <div>
                                <Label className="eyebrow">Data uscita / consegna</Label>
                                <Input
                                    type="date"
                                    data-testid="repair-delivered-date"
                                    value={form.delivered_at}
                                    onChange={(e) => setForm({ ...form, delivered_at: e.target.value })}
                                />
                            </div>
                            <div className="col-span-2">
                                <Label className="eyebrow">Problema segnalato *</Label>
                                <Textarea
                                    data-testid="repair-problem-input"
                                    value={form.problem}
                                    onChange={(e) =>
                                        setForm({ ...form, problem: e.target.value })
                                    }
                                />
                            </div>
                            <div className="col-span-2">
                                <Label className="eyebrow">Diagnosi tecnica</Label>
                                <Textarea
                                    value={form.diagnosis}
                                    onChange={(e) =>
                                        setForm({ ...form, diagnosis: e.target.value })
                                    }
                                />
                            </div>
                            <div>
                                <Label className="eyebrow">Stato</Label>
                                <Select
                                    value={form.status}
                                    onValueChange={(v) => setForm({ ...form, status: v })}
                                >
                                    <SelectTrigger data-testid="repair-status-select">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(REPAIR_STATUS).map(([k, v]) => (
                                            <SelectItem key={k} value={k}>
                                                {v.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label className="eyebrow">Preventivo (€)</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={form.estimate}
                                    onChange={(e) =>
                                        setForm({ ...form, estimate: e.target.value })
                                    }
                                />
                            </div>
                            <div>
                                <Label className="eyebrow">Manodopera (€)</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={form.labor_cost}
                                    onChange={(e) =>
                                        setForm({ ...form, labor_cost: e.target.value })
                                    }
                                />
                            </div>
                            <div>
                                <Label className="eyebrow">Prezzo finale (€)</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    data-testid="repair-final-price-input"
                                    value={form.final_price}
                                    onChange={(e) =>
                                        setForm({ ...form, final_price: e.target.value })
                                    }
                                />
                            </div>

                            {/* Parts */}
                            <div className="col-span-2 pt-2">
                                <div className="flex items-center justify-between mb-2">
                                    <Label className="eyebrow">Ricambi utilizzati</Label>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={addPart}
                                        data-testid="add-part-to-repair"
                                    >
                                        <Plus className="h-3 w-3 mr-1" /> Aggiungi
                                    </Button>
                                </div>
                                <div className="space-y-2">
                                    {form.parts_used.map((pu, i) => (
                                        <div
                                            key={i}
                                            className="grid grid-cols-12 gap-2 items-center"
                                        >
                                            <div className="col-span-6">
                                                <Select
                                                    value={pu.part_id || ""}
                                                    onValueChange={(v) => {
                                                        const p = parts.find((x) => x.id === v);
                                                        updatePart(i, {
                                                            part_id: v,
                                                            part_name: p?.name || "",
                                                            unit_price: p?.sell_price || 0,
                                                        });
                                                    }}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Seleziona ricambio" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {parts.map((p) => (
                                                            <SelectItem key={p.id} value={p.id}>
                                                                {p.name} · {p.quantity} in stock
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <Input
                                                className="col-span-2"
                                                type="number"
                                                min={1}
                                                value={pu.quantity}
                                                onChange={(e) =>
                                                    updatePart(i, {
                                                        quantity: Number(e.target.value),
                                                    })
                                                }
                                            />
                                            <Input
                                                className="col-span-3"
                                                type="number"
                                                step="0.01"
                                                value={pu.unit_price}
                                                onChange={(e) =>
                                                    updatePart(i, {
                                                        unit_price: Number(e.target.value),
                                                    })
                                                }
                                            />
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="col-span-1 text-red-400"
                                                onClick={() => removePart(i)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="col-span-2 flex items-center gap-2 pt-2">
                                <Checkbox
                                    id="paid"
                                    data-testid="repair-paid-checkbox"
                                    checked={form.paid}
                                    onCheckedChange={(v) => setForm({ ...form, paid: !!v })}
                                />
                                <Label htmlFor="paid">Pagata (registra in cassa se consegnata)</Label>
                            </div>

                            <div className="col-span-2">
                                <Label className="eyebrow">Note tecniche</Label>
                                <Textarea
                                    value={form.technical_notes}
                                    onChange={(e) =>
                                        setForm({ ...form, technical_notes: e.target.value })
                                    }
                                />
                            </div>

                            <Button
                                data-testid="save-repair-button"
                                onClick={save}
                                disabled={!form.problem || !form.device_type}
                                className="col-span-2 mt-2"
                            >
                                {editingId ? "Aggiorna riparazione" : "Apri ticket"}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        data-testid="repair-search"
                        className="pl-9"
                        placeholder="Cerca ticket, cliente, dispositivo…"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                    />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-56" data-testid="repair-status-filter">
                        <Filter className="h-4 w-4 mr-2" />
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Tutti gli stati</SelectItem>
                        {Object.entries(REPAIR_STATUS).map(([k, v]) => (
                            <SelectItem key={k} value={k}>
                                {v.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <Card>
                <CardContent className="p-0 overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-muted-foreground border-b border-border">
                                <th className="px-4 py-3 font-medium">Ticket</th>
                                <th className="px-4 py-3 font-medium">Cliente</th>
                                <th className="px-4 py-3 font-medium">Dispositivo</th>
                                <th className="px-4 py-3 font-medium">Problema</th>
                                <th className="px-4 py-3 font-medium">Stato</th>
                                <th className="px-4 py-3 font-medium text-right">Prezzo</th>
                                <th className="px-4 py-3 font-medium">Entrata / Uscita</th>
                                <th className="px-4 py-3 font-medium text-right">Azioni</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="text-center py-14 text-muted-foreground">
                                        <Wrench className="h-8 w-8 mx-auto mb-2 opacity-40" />
                                        Nessuna riparazione trovata.
                                    </td>
                                </tr>
                            )}
                            {items.map((r, idx) => (
                                <tr
                                    key={r.id}
                                    className={`border-b border-border/50 hover:bg-white/5 ${idx % 2 ? "bg-white/[0.02]" : ""}`}
                                >
                                    <td className="px-4 py-3 font-mono text-primary font-semibold">
                                        {r.ticket_number}
                                    </td>
                                    <td className="px-4 py-3">{r.customer_name || "—"}</td>
                                    <td className="px-4 py-3 text-muted-foreground">
                                        {r.device_type}
                                        <div className="text-xs">
                                            {r.device_brand} {r.device_model}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 max-w-xs truncate">
                                        {r.problem}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span
                                            className={`inline-block px-2 py-0.5 rounded-md text-xs border ${REPAIR_STATUS[r.status]?.color}`}
                                        >
                                            {REPAIR_STATUS[r.status]?.label}
                                        </span>
                                        {r.paid && (
                                            <span className="ml-2 text-xs text-emerald-400">
                                                ✓ Pagata
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono">
                                        {currency(r.final_price || r.estimate)}
                                    </td>
                                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                                        <div>↓ {formatDate(r.received_at || r.created_at)}</div>
                                        {r.delivered_at && <div className="text-sky-400">↑ {formatDate(r.delivered_at)}</div>}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex gap-1 justify-end">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => printRepairReceipt(r)}
                                                title="Ricevuta PDF"
                                                data-testid={`print-repair-${r.id}`}
                                            >
                                                <Printer className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => edit(r)}
                                                data-testid={`edit-repair-${r.id}`}
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => remove(r.id)}
                                                data-testid={`delete-repair-${r.id}`}
                                                className="text-red-400 hover:text-red-300"
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
