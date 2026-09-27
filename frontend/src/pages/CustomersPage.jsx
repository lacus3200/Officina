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
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Search, Pencil, Trash2, Phone, Mail } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";

const EMPTY = { name: "", phone: "", email: "", address: "", notes: "" };

export default function CustomersPage() {
    const [items, setItems] = useState([]);
    const [q, setQ] = useState("");
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState(EMPTY);
    const [editingId, setEditingId] = useState(null);

    const load = async () => {
        try {
            const { data } = await api.get("/customers", { params: { q } });
            setItems(data);
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };
    useEffect(() => {
        load();
        // eslint-disable-next-line
    }, [q]);

    const save = async () => {
        try {
            if (editingId) {
                await api.put(`/customers/${editingId}`, form);
                toast.success("Cliente aggiornato");
            } else {
                await api.post("/customers", form);
                toast.success("Cliente creato");
            }
            setOpen(false);
            setForm(EMPTY);
            setEditingId(null);
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    const edit = (c) => {
        setForm({
            name: c.name || "",
            phone: c.phone || "",
            email: c.email || "",
            address: c.address || "",
            notes: c.notes || "",
        });
        setEditingId(c.id);
        setOpen(true);
    };

    const remove = async (id) => {
        try {
            await api.delete(`/customers/${id}`);
            toast.success("Cliente eliminato");
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                <div>
                    <div className="eyebrow mb-2">Anagrafica</div>
                    <h1 className="font-display text-4xl font-black tracking-tight">
                        Clienti
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
                        <Button data-testid="new-customer-button">
                            <Plus className="h-4 w-4 mr-2" /> Nuovo cliente
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-card border-border">
                        <DialogHeader>
                            <DialogTitle>
                                {editingId ? "Modifica cliente" : "Nuovo cliente"}
                            </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                            <div>
                                <Label className="eyebrow">Nome *</Label>
                                <Input
                                    data-testid="customer-name-input"
                                    value={form.name}
                                    onChange={(e) =>
                                        setForm({ ...form, name: e.target.value })
                                    }
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label className="eyebrow">Telefono</Label>
                                    <Input
                                        data-testid="customer-phone-input"
                                        value={form.phone}
                                        onChange={(e) =>
                                            setForm({ ...form, phone: e.target.value })
                                        }
                                    />
                                </div>
                                <div>
                                    <Label className="eyebrow">Email</Label>
                                    <Input
                                        data-testid="customer-email-input"
                                        value={form.email}
                                        onChange={(e) =>
                                            setForm({ ...form, email: e.target.value })
                                        }
                                    />
                                </div>
                            </div>
                            <div>
                                <Label className="eyebrow">Indirizzo</Label>
                                <Input
                                    value={form.address}
                                    onChange={(e) =>
                                        setForm({ ...form, address: e.target.value })
                                    }
                                />
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
                            <Button
                                data-testid="save-customer-button"
                                onClick={save}
                                disabled={!form.name}
                                className="w-full"
                            >
                                {editingId ? "Aggiorna" : "Crea"}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    data-testid="customer-search"
                    className="pl-9"
                    placeholder="Cerca per nome, email, telefono…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.length === 0 && (
                    <Card className="col-span-full">
                        <CardContent className="p-10 text-center text-muted-foreground">
                            Nessun cliente registrato.
                        </CardContent>
                    </Card>
                )}
                {items.map((c) => (
                    <Card key={c.id} className="hover:border-primary/40 transition-colors">
                        <CardContent className="p-5">
                            <div className="flex justify-between items-start gap-2">
                                <div className="min-w-0">
                                    <div
                                        className="font-display font-semibold text-lg truncate"
                                        data-testid={`customer-name-${c.id}`}
                                    >
                                        {c.name}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-1">
                                        Cliente dal {formatDate(c.created_at)}
                                    </div>
                                </div>
                                <div className="flex gap-1">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        data-testid={`edit-customer-${c.id}`}
                                        onClick={() => edit(c)}
                                    >
                                        <Pencil className="h-4 w-4" />
                                    </Button>
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                data-testid={`delete-customer-${c.id}`}
                                                className="text-red-400 hover:text-red-300"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent className="bg-card border-border">
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>
                                                    Eliminare {c.name}?
                                                </AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    L'operazione non può essere annullata.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Annulla</AlertDialogCancel>
                                                <AlertDialogAction
                                                    onClick={() => remove(c.id)}
                                                >
                                                    Elimina
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </div>
                            </div>
                            <div className="mt-4 space-y-1.5 text-sm text-zinc-300">
                                {c.phone && (
                                    <div className="flex items-center gap-2">
                                        <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                                        <span>{c.phone}</span>
                                    </div>
                                )}
                                {c.email && (
                                    <div className="flex items-center gap-2">
                                        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                                        <span className="truncate">{c.email}</span>
                                    </div>
                                )}
                                {c.notes && (
                                    <div className="text-xs text-muted-foreground pt-2 border-t border-border mt-2">
                                        {c.notes}
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}
