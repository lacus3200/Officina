import React, { useState } from "react";
import { api, formatApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchSelect } from "@/components/SearchSelect";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";

export function CustomerSelect({ customers, value, onChange, onCreated, placeholder = "Seleziona cliente", noneLabel = "— nessuno / walk-in —", testId = "customer-select" }) {
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState({ name: "", phone: "", email: "" });

    const create = async () => {
        try {
            const { data } = await api.post("/customers", form);
            toast.success("Cliente creato");
            setOpen(false);
            setForm({ name: "", phone: "", email: "" });
            onCreated?.(data);
            onChange(data.id, data);
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    return (
        <>
            <div className="flex gap-2">
                <SearchSelect
                    testId={testId}
                    value={value}
                    placeholder={placeholder}
                    searchPlaceholder="Cerca cliente per nome o telefono…"
                    noneLabel={noneLabel}
                    options={customers.map((c) => ({ value: c.id, label: c.name, keywords: c.phone || "" }))}
                    renderLabel={(o) => { const c = customers.find((x) => x.id === o.value); return c?.phone ? `${c.name} · ${c.phone}` : o.label; }}
                    onChange={(id) => onChange(id, customers.find((c) => c.id === id))}
                    onRename={async (o, n) => {
                        const c = customers.find((x) => x.id === o.value);
                        try {
                            const { data } = await api.put(`/customers/${o.value}`, { ...c, name: n });
                            toast.success("Cliente rinominato");
                            onCreated?.(data, "update");
                            if (value === o.value) onChange(o.value, data);
                        } catch (e) { toast.error(formatApiError(e)); }
                    }}
                    onDelete={async (o) => {
                        try {
                            await api.delete(`/customers/${o.value}`);
                            toast.success("Cliente eliminato");
                            onCreated?.({ id: o.value }, "delete");
                            if (value === o.value) onChange("", null);
                        } catch (e) { toast.error(formatApiError(e)); }
                    }}
                />
                <Button type="button" variant="outline" size="icon" className="shrink-0" title="Nuovo cliente" onClick={() => setOpen(true)} data-testid="quick-new-customer-button">
                    <UserPlus className="h-4 w-4" />
                </Button>
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="bg-card border-border max-w-md" data-testid="quick-customer-dialog">
                    <DialogHeader><DialogTitle>Nuovo cliente al volo</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                        <div>
                            <Label className="eyebrow">Nome *</Label>
                            <Input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="quick-customer-name" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label className="eyebrow">Telefono</Label>
                                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="quick-customer-phone" />
                            </div>
                            <div>
                                <Label className="eyebrow">Email</Label>
                                <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                            </div>
                        </div>
                        <Button className="w-full" onClick={create} disabled={!form.name} data-testid="quick-customer-save">Crea e seleziona</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
