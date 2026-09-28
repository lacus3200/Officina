import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { DEVICE_TYPES, REFURB_STATUS } from "@/lib/format";
import { DeviceBrandModelFields } from "@/components/DeviceBrandModelFields";
import { SerialHistoryAlert } from "@/components/SerialHistoryAlert";
import { ColorSelect } from "@/components/ColorSelect";
import { SearchSelect } from "@/components/SearchSelect";

const EMPTY = {
    device_type: "Smartphone",
    brand: "",
    model: "",
    serial_or_imei: "",
    specs: "",
    color: "",
    grade: "",
    purchase_cost: 0,
    purchase_source: "",
    purchase_date: "",
    supplier_id: "",
    target_price: 0,
    status: "acquistato",
    notes: "",
};

export function RefurbFormDialog({ open, onOpenChange, editing, onSaved }) {
    const [form, setForm] = useState(EMPTY);

    useEffect(() => {
        if (!open) return;
        setForm(
            editing
                ? {
                      ...EMPTY,
                      ...Object.fromEntries(
                          Object.keys(EMPTY).map((k) => [k, editing[k] ?? EMPTY[k]]),
                      ),
                      purchase_date: (editing.purchase_date || "").slice(0, 10),
                  }
                : { ...EMPTY, purchase_date: new Date().toISOString().slice(0, 10) },
        );
    }, [open, editing]);

    const set = (k) => (e) => setForm({ ...form, [k]: e?.target ? e.target.value : e });

    const save = async () => {
        try {
            const payload = {
                ...form,
                supplier_id: form.supplier_id || null,
                purchase_cost: Number(form.purchase_cost || 0),
                target_price: Number(form.target_price || 0),
                purchase_date: form.purchase_date ? new Date(`${form.purchase_date}T12:00:00`).toISOString() : undefined,
            };
            if (editing) {
                await api.put(`/refurbished/${editing.id}`, payload);
                toast.success("Dispositivo aggiornato");
            } else {
                await api.post("/refurbished", payload);
                toast.success("Dispositivo registrato");
            }
            onOpenChange(false);
            onSaved?.();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        {editing ? `Modifica ${editing.code}` : "Nuovo dispositivo ricondizionato"}
                    </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div>
                            <Label className="eyebrow">Tipo *</Label>
                            <SearchSelect
                                testId="refurb-type-select"
                                value={form.device_type}
                                placeholder="Tipo"
                                searchPlaceholder="Cerca tipo…"
                                options={DEVICE_TYPES.map((t) => ({ value: t, label: t }))}
                                onChange={(v) => setForm({ ...form, device_type: v })}
                            />
                        </div>
                        <DeviceBrandModelFields
                            brand={form.brand}
                            model={form.model}
                            deviceType={form.device_type}
                            onChange={({ brand, model }) => setForm({ ...form, brand, model })}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label className="eyebrow">Seriale / IMEI</Label>
                            <Input value={form.serial_or_imei} onChange={set("serial_or_imei")} data-testid="refurb-serial-input" />
                        </div>
                        <div>
                            <Label className="eyebrow">Stato</Label>
                            <Select value={form.status} onValueChange={set("status")}>
                                <SelectTrigger data-testid="refurb-status-select">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.entries(REFURB_STATUS)
                                        .filter(([k]) => k !== "venduto")
                                        .map(([k, v]) => (
                                            <SelectItem key={k} value={k}>{v.label}</SelectItem>
                                        ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <SerialHistoryAlert serial={form.serial_or_imei} excludeId={editing?.id} />
                    <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-2">
                            <Label className="eyebrow">Colore</Label>
                            <ColorSelect brand={form.brand} model={form.model} value={form.color} onChange={(c) => setForm({ ...form, color: c })} />
                        </div>
                        <div>
                            <Label className="eyebrow">Grado estetico</Label>
                            <Select value={form.grade || "none"} onValueChange={(v) => setForm({ ...form, grade: v === "none" ? "" : v })}>
                                <SelectTrigger data-testid="refurb-grade-select"><SelectValue placeholder="—" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">—</SelectItem>
                                    <SelectItem value="A+">A+ · Come nuovo</SelectItem>
                                    <SelectItem value="A">A · Perfetto</SelectItem>
                                    <SelectItem value="B">B · Lievi segni</SelectItem>
                                    <SelectItem value="C">C · Segni evidenti</SelectItem>
                                    <SelectItem value="D">D · Danneggiato / per ricambi</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div>
                        <Label className="eyebrow">Specifiche (RAM, storage…)</Label>
                        <Input value={form.specs} onChange={set("specs")} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label className="eyebrow">Costo acquisto €</Label>
                            <Input
                                data-testid="refurb-cost-input"
                                type="number"
                                step="0.01"
                                value={form.purchase_cost}
                                onChange={set("purchase_cost")}
                            />
                        </div>
                        <div>
                            <Label className="eyebrow">Prezzo obiettivo €</Label>
                            <Input
                                data-testid="refurb-target-input"
                                type="number"
                                step="0.01"
                                value={form.target_price}
                                onChange={set("target_price")}
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-2">
                            <Label className="eyebrow">Provenienza (es. privato, permuta, asta)</Label>
                            <Input value={form.purchase_source} onChange={set("purchase_source")} />
                        </div>
                        <div>
                            <Label className="eyebrow">Data acquisto</Label>
                            <Input type="date" value={form.purchase_date} onChange={set("purchase_date")} data-testid="refurb-purchase-date" />
                        </div>
                    </div>
                    <div>
                        <Label className="eyebrow">Note</Label>
                        <Textarea value={form.notes} onChange={set("notes")} />
                    </div>
                    <Button
                        className="w-full"
                        onClick={save}
                        disabled={!form.device_type}
                        data-testid="save-refurb-button"
                    >
                        {editing ? "Aggiorna" : "Registra acquisto"}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
