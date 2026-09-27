import React, { useState } from "react";
import { api, formatApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
                <Select
                    value={value || "none"}
                    onValueChange={(v) => onChange(v === "none" ? "" : v, customers.find((c) => c.id === v))}
                >
                    <SelectTrigger data-testid={testId}>
                        <SelectValue placeholder={placeholder} />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="none">{noneLabel}</SelectItem>
                        {customers.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                                {c.name}{c.phone ? ` · ${c.phone}` : ""}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
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
