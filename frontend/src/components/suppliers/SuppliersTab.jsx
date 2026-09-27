import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Phone, Mail, Globe, Truck } from "lucide-react";
import { toast } from "sonner";

const EMPTY = { name: "", contact_name: "", phone: "", email: "", website: "", vat_number: "", address: "", notes: "" };

export function SuppliersTab({ suppliers, reload }) {
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState(EMPTY);
    const [editingId, setEditingId] = useState(null);

    useEffect(() => {
        if (!open) { setForm(EMPTY); setEditingId(null); }
    }, [open]);

    const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

    const save = async () => {
        try {
            if (editingId) await api.put(`/suppliers/${editingId}`, form);
            else await api.post("/suppliers", form);
            toast.success(editingId ? "Fornitore aggiornato" : "Fornitore creato");
            setOpen(false);
            reload();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    const edit = (s) => {
        setForm(Object.fromEntries(Object.keys(EMPTY).map((k) => [k, s[k] || ""])));
        setEditingId(s.id);
        setOpen(true);
    };

    const remove = async (id) => {
        if (!window.confirm("Eliminare il fornitore?")) return;
        try {
            await api.delete(`/suppliers/${id}`);
            toast.success("Fornitore eliminato");
            reload();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <Button onClick={() => setOpen(true)} data-testid="new-supplier-button">
                    <Plus className="h-4 w-4 mr-2" /> Nuovo fornitore
                </Button>
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="bg-card border-border">
                    <DialogHeader>
                        <DialogTitle>{editingId ? "Modifica fornitore" : "Nuovo fornitore"}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div>
                            <Label className="eyebrow">Ragione sociale *</Label>
                            <Input value={form.name} onChange={set("name")} data-testid="supplier-name-input" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div><Label className="eyebrow">Referente</Label><Input value={form.contact_name} onChange={set("contact_name")} /></div>
                            <div><Label className="eyebrow">P. IVA</Label><Input value={form.vat_number} onChange={set("vat_number")} /></div>
                            <div><Label className="eyebrow">Telefono</Label><Input value={form.phone} onChange={set("phone")} data-testid="supplier-phone-input" /></div>
                            <div><Label className="eyebrow">Email</Label><Input value={form.email} onChange={set("email")} /></div>
                        </div>
                        <div><Label className="eyebrow">Sito web</Label><Input value={form.website} onChange={set("website")} placeholder="https://" /></div>
                        <div><Label className="eyebrow">Indirizzo</Label><Input value={form.address} onChange={set("address")} /></div>
                        <div><Label className="eyebrow">Note</Label><Textarea value={form.notes} onChange={set("notes")} /></div>
                        <Button className="w-full" onClick={save} disabled={!form.name} data-testid="save-supplier-button">
                            {editingId ? "Aggiorna" : "Crea"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {suppliers.length === 0 && (
                    <Card className="col-span-full">
                        <CardContent className="p-10 text-center text-muted-foreground">
                            <Truck className="h-8 w-8 mx-auto mb-2 opacity-40" />
                            Nessun fornitore registrato.
                        </CardContent>
                    </Card>
                )}
                {suppliers.map((s) => (
                    <Card key={s.id} className="hover:border-primary/40 transition-colors" data-testid={`supplier-card-${s.id}`}>
                        <CardContent className="p-5">
                            <div className="flex justify-between items-start gap-2">
                                <div className="min-w-0">
                                    <div className="font-display font-semibold text-lg truncate">{s.name}</div>
                                    {s.contact_name && <div className="text-xs text-muted-foreground">{s.contact_name}</div>}
                                </div>
                                <div className="flex gap-1">
                                    <Button variant="ghost" size="icon" onClick={() => edit(s)} data-testid={`edit-supplier-${s.id}`}><Pencil className="h-4 w-4" /></Button>
                                    <Button variant="ghost" size="icon" className="text-red-400" onClick={() => remove(s.id)} data-testid={`delete-supplier-${s.id}`}><Trash2 className="h-4 w-4" /></Button>
                                </div>
                            </div>
                            <div className="mt-4 space-y-1.5 text-sm text-zinc-300">
                                {s.phone && <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-muted-foreground" />{s.phone}</div>}
                                {s.email && <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-muted-foreground" /><span className="truncate">{s.email}</span></div>}
                                {s.website && <div className="flex items-center gap-2"><Globe className="h-3.5 w-3.5 text-muted-foreground" /><a href={s.website} target="_blank" rel="noreferrer" className="truncate hover:text-primary">{s.website}</a></div>}
                                {s.notes && <div className="text-xs text-muted-foreground pt-2 border-t border-border mt-2">{s.notes}</div>}
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}
