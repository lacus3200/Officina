import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { currency } from "@/lib/format";

const EMPTY_ITEM = { part_id: "", description: "", quantity: 1, unit_cost: 0 };

export function OrderFormDialog({ open, onOpenChange, suppliers, onSaved }) {
    const [parts, setParts] = useState([]);
    const [form, setForm] = useState({ supplier_id: "", supplier_name: "", status: "ordinato", expected_date: "", tracking_code: "", notes: "", items: [{ ...EMPTY_ITEM }] });

    useEffect(() => {
        if (!open) return;
        api.get("/parts").then((r) => setParts(r.data)).catch(() => {});
        setForm({ supplier_id: "", supplier_name: "", status: "ordinato", expected_date: "", tracking_code: "", notes: "", items: [{ ...EMPTY_ITEM }] });
    }, [open]);

    const updateItem = (i, patch) => {
        const arr = [...form.items];
        arr[i] = { ...arr[i], ...patch };
        setForm({ ...form, items: arr });
    };
    const total = form.items.reduce((s, it) => s + Number(it.quantity || 0) * Number(it.unit_cost || 0), 0);

    const save = async () => {
        try {
            await api.post("/purchase-orders", {
                ...form,
                supplier_id: form.supplier_id || null,
                expected_date: form.expected_date || null,
                items: form.items
                    .filter((i) => i.description)
                    .map((i) => ({ ...i, part_id: i.part_id || null, quantity: Number(i.quantity), unit_cost: Number(i.unit_cost) })),
            });
            toast.success("Ordine creato");
            onOpenChange(false);
            onSaved();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-card border-border max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Nuovo ordine ricambi</DialogTitle></DialogHeader>
                <div className="space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="col-span-2">
                            <Label className="eyebrow">Fornitore</Label>
                            <Select
                                value={form.supplier_id || "none"}
                                onValueChange={(v) => {
                                    const s = suppliers.find((x) => x.id === v);
                                    setForm({ ...form, supplier_id: v === "none" ? "" : v, supplier_name: s?.name || "" });
                                }}
                            >
                                <SelectTrigger data-testid="order-supplier-select"><SelectValue placeholder="—" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">— nessuno —</SelectItem>
                                    {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label className="eyebrow">Stato</Label>
                            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="bozza">Bozza</SelectItem>
                                    <SelectItem value="ordinato">Ordinato</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label className="eyebrow">Arrivo previsto</Label>
                            <Input type="date" value={form.expected_date} onChange={(e) => setForm({ ...form, expected_date: e.target.value })} data-testid="order-expected-date" />
                        </div>
                    </div>
                    <div>
                        <Label className="eyebrow">Codice tracking / riferimento</Label>
                        <Input value={form.tracking_code} onChange={(e) => setForm({ ...form, tracking_code: e.target.value })} />
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <Label className="eyebrow">Righe ordine</Label>
                            <Button size="sm" variant="outline" onClick={() => setForm({ ...form, items: [...form.items, { ...EMPTY_ITEM }] })} data-testid="add-order-item">
                                <Plus className="h-3 w-3 mr-1" /> Aggiungi riga
                            </Button>
                        </div>
                        <div className="space-y-2">
                            {form.items.map((it, i) => (
                                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                                    <div className="col-span-4">
                                        <Select
                                            value={it.part_id || "custom"}
                                            onValueChange={(v) => {
                                                const p = parts.find((x) => x.id === v);
                                                updateItem(i, v === "custom" ? { part_id: "" } : { part_id: v, description: p?.name || "", unit_cost: p?.cost_price || 0 });
                                            }}
                                        >
                                            <SelectTrigger><SelectValue placeholder="Ricambio a magazzino…" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="custom">— Nuovo articolo —</SelectItem>
                                                {parts.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} · {p.quantity} pz</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <Input className="col-span-4" placeholder="Descrizione" value={it.description} onChange={(e) => updateItem(i, { description: e.target.value })} data-testid={`order-item-desc-${i}`} />
                                    <Input className="col-span-1" type="number" min={1} value={it.quantity} onChange={(e) => updateItem(i, { quantity: e.target.value })} data-testid={`order-item-qty-${i}`} />
                                    <Input className="col-span-2" type="number" step="0.01" value={it.unit_cost} onChange={(e) => updateItem(i, { unit_cost: e.target.value })} data-testid={`order-item-cost-${i}`} />
                                    <Button variant="ghost" size="icon" className="col-span-1 text-red-400" onClick={() => setForm({ ...form, items: form.items.filter((_, idx) => idx !== i) })}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">Le righe collegate a un ricambio incrementano automaticamente la giacenza all'arrivo.</p>
                    </div>

                    <div><Label className="eyebrow">Note</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>

                    <div className="border-t border-border pt-4 flex items-center justify-between">
                        <div className="eyebrow">Totale ordine</div>
                        <div className="font-display text-3xl font-bold text-primary">{currency(total)}</div>
                    </div>
                    <Button className="w-full" onClick={save} disabled={form.items.every((i) => !i.description)} data-testid="save-order-button">Crea ordine</Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
