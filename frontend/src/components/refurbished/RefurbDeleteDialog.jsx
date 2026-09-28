import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

const Opt = ({ id, checked, onChange, label, hint, disabled }) => (
    <label htmlFor={id} className={`flex items-start gap-3 rounded-md border border-border px-3 py-2 ${disabled ? "opacity-50" : "cursor-pointer hover:bg-white/5"}`}>
        <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(!!v)} disabled={disabled} data-testid={id} className="mt-0.5" />
        <div className="text-sm">
            <div className="font-medium">{label}</div>
            {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
        </div>
    </label>
);

export function RefurbDeleteDialog({ items, open, onClose, onConfirm, busy }) {
    const [cancelCash, setCancelCash] = useState(true);
    const [deleteSale, setDeleteSale] = useState(true);
    const [deleteRepair, setDeleteRepair] = useState(true);
    const [restoreParts, setRestoreParts] = useState(true);
    useEffect(() => { if (open) { setCancelCash(true); setDeleteSale(true); setDeleteRepair(true); setRestoreParts(true); } }, [open]);

    const list = items || [];
    const hasSale = list.some((i) => i.sale_id);
    const hasRepair = list.some((i) => i.repair_id);
    const hasParts = list.some((i) => (i.repair?.parts_used || []).some((p) => p.part_id));
    const many = list.length > 1;

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-md" data-testid="refurb-delete-dialog">
                <DialogHeader>
                    <DialogTitle>{many ? `Eliminare ${list.length} dispositivi?` : `Eliminare ${list[0]?.code || "il dispositivo"}?`}</DialogTitle>
                    <DialogDescription>Scegli cosa fare con i dati collegati.</DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                    <Opt id="opt-cancel-cash" checked={cancelCash} onChange={setCancelCash} label="Annulla i movimenti di cassa collegati"
                        hint="Acquisto, costi extra e incassi. Se disattivato restano in cassa come movimenti scollegati." />
                    {hasSale && (
                        <Opt id="opt-delete-sale" checked={deleteSale} onChange={setDeleteSale} label="Elimina la vendita collegata"
                            hint="Rimuove la fattura VEN dalla sezione Vendite." />
                    )}
                    {hasRepair && (
                        <Opt id="opt-delete-repair" checked={deleteRepair} onChange={setDeleteRepair} label="Elimina la riparazione associata"
                            hint="Rimuove il ticket RIP dalla sezione Riparazioni." />
                    )}
                    {hasRepair && hasParts && (
                        <Opt id="opt-restore-parts" checked={deleteRepair && restoreParts} onChange={setRestoreParts} disabled={!deleteRepair}
                            label="Ripristina in magazzino i ricambi usati nella riparazione"
                            hint="Le quantità tornano disponibili senza generare uscite di cassa." />
                    )}
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={onClose} data-testid="refurb-delete-cancel">Annulla</Button>
                    <Button variant="destructive" disabled={busy} data-testid="refurb-delete-confirm"
                        onClick={() => onConfirm({ cancel_cash: cancelCash, delete_sale: hasSale && deleteSale, delete_repair: hasRepair && deleteRepair, restore_parts: hasRepair && deleteRepair && restoreParts })}>
                        Elimina
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
