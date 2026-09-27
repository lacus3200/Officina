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
import { useColumnWidths, ResizableTh, ScrollTable } from "@/components/ResizableTable";

const COLS = ["Cliente", "Telefono", "Email", "Indirizzo", "Note", "Dal", "Azioni"];
const COL_DEFAULTS = [220, 140, 220, 220, 260, 110, 110];

const EMPTY = { name: "", phone: "", email: "", address: "", notes: "" };

export default function CustomersPage() {
    const [items, setItems] = useState([]);
    const [q, setQ] = useState("");
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState(EMPTY);
    const [editingId, setEditingId] = useState(null);
    const [widths, setWidths, resetWidths] = useColumnWidths("customers", COL_DEFAULTS);

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

            <div className="flex justify-end">
                <button className="text-xs text-muted-foreground hover:text-primary" onClick={resetWidths} data-testid="reset-columns-customers">
                    Ripristina larghezza colonne
                </button>
            </div>
            <Card>
                <CardContent className="p-0">
                    <ScrollTable widths={widths} testId="customers-table-scroll">
                        <thead>
                            <tr className="text-left text-muted-foreground border-b border-border">
                                {COLS.map((c, i) => (
                                    <ResizableTh key={c} index={i} widths={widths} setWidths={setWidths} testId={`customers-th-${i}`} className={i === 6 ? "text-right" : ""}>
                                        {c}
                                    </ResizableTh>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {items.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="text-center py-14 text-muted-foreground">Nessun cliente registrato.</td>
                                </tr>
                            )}
                            {items.map((c, idx) => (
                                <tr key={c.id} className={`border-b border-border/50 hover:bg-white/5 ${idx % 2 ? "bg-white/[0.02]" : ""}`}>
                                    <td className="px-4 py-3 font-medium truncate" data-testid={`customer-name-${c.id}`} title={c.name}>{c.name}</td>
                                    <td className="px-4 py-3 truncate">
                                        {c.phone ? <span className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-muted-foreground" />{c.phone}</span> : "—"}
                                    </td>
                                    <td className="px-4 py-3 truncate" title={c.email}>
                                        {c.email ? <span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-muted-foreground" />{c.email}</span> : "—"}
                                    </td>
                                    <td className="px-4 py-3 truncate text-muted-foreground" title={c.address}>{c.address || "—"}</td>
                                    <td className="px-4 py-3 truncate text-xs text-muted-foreground" title={c.notes}>{c.notes || "—"}</td>
                                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatDate(c.created_at)}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex gap-1 justify-end">
                                            <Button variant="ghost" size="icon" data-testid={`edit-customer-${c.id}`} onClick={() => edit(c)}>
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="ghost" size="icon" data-testid={`delete-customer-${c.id}`} className="text-red-400 hover:text-red-300">
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent className="bg-card border-border">
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Eliminare {c.name}?</AlertDialogTitle>
                                                        <AlertDialogDescription>L'operazione non può essere annullata.</AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Annulla</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => remove(c.id)}>Elimina</AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </ScrollTable>
                </CardContent>
            </Card>
        </div>
    );
}
