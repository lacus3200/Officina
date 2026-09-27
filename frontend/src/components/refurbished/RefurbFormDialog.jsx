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

const EMPTY = {
    device_type: "Smartphone",
    brand: "",
    model: "",
    serial_or_imei: "",
    specs: "",
    purchase_cost: 0,
    purchase_source: "",
    supplier_id: "",
    target_price: 0,
    status: "acquistato",
    notes: "",
};

export function RefurbFormDialog({ open, onOpenChange, editing, onSaved }) {
    const [form, setForm] = useState(EMPTY);
    const [suppliers, setSuppliers] = useState([]);

    useEffect(() => {
        if (!open) return;
        api.get("/suppliers").then((r) => setSuppliers(r.data)).catch(() => {});
        setForm(
            editing
                ? {
                      ...EMPTY,
                      ...Object.fromEntries(
                          Object.keys(EMPTY).map((k) => [k, editing[k] ?? EMPTY[k]]),
                      ),
                  }
                : EMPTY,
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
                            <Select value={form.device_type} onValueChange={set("device_type")}>
                                <SelectTrigger data-testid="refurb-type-select">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {DEVICE_TYPES.map((t) => (
                                        <SelectItem key={t} value={t}>{t}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label className="eyebrow">Marca</Label>
                            <Input data-testid="refurb-brand-input" value={form.brand} onChange={set("brand")} />
                        </div>
                        <div>
                            <Label className="eyebrow">Modello</Label>
                            <Input data-testid="refurb-model-input" value={form.model} onChange={set("model")} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label className="eyebrow">Seriale / IMEI</Label>
                            <Input value={form.serial_or_imei} onChange={set("serial_or_imei")} />
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
                    <div>
                        <Label className="eyebrow">Specifiche (RAM, storage, colore…)</Label>
                        <Input value={form.specs} onChange={set("specs")} />
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
                        <div>
                            <Label className="eyebrow">Fornitore</Label>
                            <Select
                                value={form.supplier_id || "none"}
                                onValueChange={(v) => {
                                    const s = suppliers.find((x) => x.id === v);
                                    setForm({
                                        ...form,
                                        supplier_id: v === "none" ? "" : v,
                                        purchase_source: s ? s.name : form.purchase_source,
                                    });
                                }}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="—" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">— privato / altro —</SelectItem>
                                    {suppliers.map((s) => (
                                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div>
                        <Label className="eyebrow">Provenienza (es. privato, permuta, asta)</Label>
                        <Input value={form.purchase_source} onChange={set("purchase_source")} />
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
