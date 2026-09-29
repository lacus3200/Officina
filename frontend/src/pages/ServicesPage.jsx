import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchSelect } from "@/components/SearchSelect";
import { Plus, Search, Pencil, Trash2, Check, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { currency, DEVICE_TYPES } from "@/lib/format";

const EMPTY = { name: "", category: "", device_type: "", price: 0, duration_minutes: "" };

export default function ServicesPage() {
    const [items, setItems] = useState([]);
    const [q, setQ] = useState("");
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState(EMPTY);
    const [editingId, setEditingId] = useState(null);
    const [priceEdit, setPriceEdit] = useState({});

    const load = async () => {
        try {
            const { data } = await api.get("/services", { params: { q: q || undefined } });
            setItems(data);
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };
    useEffect(() => { load(); // eslint-disable-next-line
    }, [q]);

    const payload = () => ({
        ...form,
        device_type: form.device_type || null,
        price: Number(form.price || 0),
        duration_minutes: form.duration_minutes ? Number(form.duration_minutes) : null,
    });

    const save = async () => {
        try {
            if (editingId) await api.put(`/services/${editingId}`, payload());
            else await api.post("/services", payload());
            toast.success(editingId ? "Intervento aggiornato" : "Intervento aggiunto");
            setOpen(false);
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    const savePrice = async (s) => {
        const v = Number(priceEdit[s.id]);
        if (Number.isNaN(v)) return;
        try {
            await api.put(`/services/${s.id}`, { name: s.name, category: s.category, device_type: s.device_type, price: v, duration_minutes: s.duration_minutes });
            toast.success("Prezzo aggiornato");
            setPriceEdit((p) => { const n = { ...p }; delete n[s.id]; return n; });
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    const remove = async (id) => {
        if (!window.confirm("Eliminare l'intervento dal listino?")) return;
        try {
            await api.delete(`/services/${id}`);
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    const grouped = items.reduce((acc, s) => {
        const k = s.category || "Altro";
        (acc[k] = acc[k] || []).push(s);
        return acc;
    }, {});

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                    <div className="eyebrow mb-2">Prezzario</div>
                    <h1 className="font-display text-4xl font-black tracking-tight">Listino interventi</h1>
                    <p className="text-muted-foreground mt-2">Interventi standard da inserire con un click nel preventivo. Clicca sul prezzo per modificarlo.</p>
                </div>
                <Button onClick={() => { setForm(EMPTY); setEditingId(null); setOpen(true); }} data-testid="new-service-button">
                    <Plus className="h-4 w-4 mr-2" /> Nuovo intervento
                </Button>
            </div>

            <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="Cerca intervento o categoria…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="service-search" />
            </div>

            {items.length === 0 && (
                <Card><CardContent className="p-12 text-center text-muted-foreground"><ListChecks className="h-8 w-8 mx-auto mb-2 opacity-40" />Nessun intervento nel listino.</CardContent></Card>
            )}
            {Object.entries(grouped).map(([cat, list]) => (
                <Card key={cat}>
                    <CardContent className="p-0">
                        <div className="px-4 py-2 eyebrow border-b border-border bg-black/20">{cat}</div>
                        <div className="overflow-x-auto scroll-table"><table className="w-full text-sm min-w-[560px]">
                            <tbody>
                                {list.map((s) => (
                                    <tr key={s.id} className="border-b border-border/50 hover:bg-white/5" data-testid={`service-row-${s.id}`}>
                                        <td className="px-4 py-3">
                                            <div className="font-medium">{s.name}</div>
                                            <div className="text-xs text-muted-foreground">{s.device_type || "Tutti i dispositivi"}{s.duration_minutes ? ` · ~${s.duration_minutes} min` : ""}</div>
                                        </td>
                                        <td className="px-4 py-3 text-right w-48">
                                            {priceEdit[s.id] !== undefined ? (
                                                <div className="flex items-center gap-1 justify-end">
                                                    <Input type="number" step="0.01" autoFocus className="h-8 w-24 text-right font-mono" value={priceEdit[s.id]}
                                                        onChange={(e) => setPriceEdit({ ...priceEdit, [s.id]: e.target.value })}
                                                        onKeyDown={(e) => e.key === "Enter" && savePrice(s)}
                                                        data-testid={`service-price-input-${s.id}`} />
                                                    <Button size="icon" className="h-8 w-8" onClick={() => savePrice(s)} data-testid={`service-price-save-${s.id}`}><Check className="h-4 w-4" /></Button>
                                                </div>
                                            ) : (
                                                <button className="font-mono text-primary font-semibold hover:underline" onClick={() => setPriceEdit({ ...priceEdit, [s.id]: s.price })} data-testid={`service-price-${s.id}`}>
                                                    {currency(s.price)}
                                                </button>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 w-24">
                                            <div className="flex gap-1 justify-end">
                                                <Button variant="ghost" size="icon" onClick={() => { setForm({ ...EMPTY, ...s, device_type: s.device_type || "", duration_minutes: s.duration_minutes || "" }); setEditingId(s.id); setOpen(true); }} data-testid={`edit-service-${s.id}`}><Pencil className="h-4 w-4" /></Button>
                                                <Button variant="ghost" size="icon" className="text-red-400" onClick={() => remove(s.id)} data-testid={`delete-service-${s.id}`}><Trash2 className="h-4 w-4" /></Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table></div>
                    </CardContent>
                </Card>
            ))}

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="bg-card border-border">
                    <DialogHeader><DialogTitle>{editingId ? "Modifica intervento" : "Nuovo intervento"}</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                        <div><Label className="eyebrow">Nome *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="service-name-input" /></div>
                        <div className="grid grid-cols-2 gap-3">
                            <div><Label className="eyebrow">Categoria</Label><Input value={form.category || ""} placeholder="Schermo, Batteria, Software…" onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
                            <div>
                                <Label className="eyebrow">Dispositivo</Label>
                                <SearchSelect
                                    testId="service-device-type-select"
                                    value={form.device_type || ""}
                                    placeholder="Tutti"
                                    noneLabel="Tutti"
                                    options={DEVICE_TYPES.map((d) => ({ value: d, label: d }))}
                                    onChange={(v) => setForm({ ...form, device_type: v })}
                                />
                            </div>
                            <div><Label className="eyebrow">Prezzo €</Label><Input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} data-testid="service-price-form-input" /></div>
                            <div><Label className="eyebrow">Durata (min)</Label><Input type="number" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} /></div>
                        </div>
                        <Button className="w-full" onClick={save} disabled={!form.name} data-testid="save-service-button">{editingId ? "Aggiorna" : "Aggiungi al listino"}</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
