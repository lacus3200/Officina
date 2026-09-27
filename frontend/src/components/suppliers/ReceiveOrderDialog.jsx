import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { currency, formatDate, ORDER_STATUS } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { PackageCheck, Ban } from "lucide-react";

export function ReceiveOrderDialog({ order, onOpenChange, onChanged }) {
    const [qty, setQty] = useState({});

    useEffect(() => {
        if (!order) return;
        const init = {};
        order.items.forEach((it, i) => { init[i] = Math.max(0, it.quantity - (it.received_qty || 0)); });
        setQty(init);
    }, [order]);

    if (!order) return null;
    const editable = !["ricevuto", "annullato"].includes(order.status);

    const receive = async () => {
        try {
            const items = Object.entries(qty).map(([i, q]) => ({ index: Number(i), quantity: Number(q) })).filter((x) => x.quantity > 0);
            if (items.length === 0) return toast.error("Inserisci le quantità arrivate");
            await api.post(`/purchase-orders/${order.id}/receive`, { items });
            toast.success("Arrivo registrato: magazzino e cassa aggiornati");
            onChanged();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    const cancel = async () => {
        if (!window.confirm("Annullare l'ordine?")) return;
        try {
            await api.put(`/purchase-orders/${order.id}`, { status: "annullato" });
            toast.success("Ordine annullato");
            onChanged();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    return (
        <Dialog open={!!order} onOpenChange={onOpenChange}>
            <DialogContent className="bg-card border-border max-w-2xl" data-testid="order-detail-dialog">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-3">
                        <span className="font-mono text-primary">{order.order_number}</span>
                        <span>{order.supplier_name || "—"}</span>
                        <StatusBadge map={ORDER_STATUS} value={order.status} testId="order-detail-status" />
                    </DialogTitle>
                </DialogHeader>
                <div className="grid grid-cols-3 gap-3 text-sm">
                    <Info label="Creato" value={formatDate(order.created_at)} />
                    <Info label="Arrivo previsto" value={order.expected_date ? formatDate(order.expected_date) : "—"} />
                    <Info label="Tracking" value={order.tracking_code || "—"} />
                </div>
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-muted-foreground border-b border-border">
                            <th className="py-2 font-medium">Articolo</th>
                            <th className="py-2 font-medium text-right">Ordinati</th>
                            <th className="py-2 font-medium text-right">Arrivati</th>
                            <th className="py-2 font-medium text-right">Costo</th>
                            {editable && <th className="py-2 font-medium text-right w-28">In arrivo ora</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {order.items.map((it, i) => {
                            const done = (it.received_qty || 0) >= it.quantity;
                            return (
                                <tr key={i} className="border-b border-border/50">
                                    <td className="py-2">
                                        {it.description}
                                        {it.part_id && <span className="ml-2 text-[10px] uppercase tracking-wide text-primary">magazzino</span>}
                                    </td>
                                    <td className="py-2 text-right font-mono">{it.quantity}</td>
                                    <td className={`py-2 text-right font-mono ${done ? "text-emerald-400" : ""}`}>{it.received_qty || 0}</td>
                                    <td className="py-2 text-right font-mono">{currency(it.unit_cost)}</td>
                                    {editable && (
                                        <td className="py-2 text-right">
                                            <Input
                                                type="number"
                                                min={0}
                                                max={it.quantity - (it.received_qty || 0)}
                                                disabled={done}
                                                className="h-8 text-right"
                                                value={qty[i] ?? 0}
                                                onChange={(e) => setQty({ ...qty, [i]: e.target.value })}
                                                data-testid={`receive-qty-${i}`}
                                            />
                                        </td>
                                    )}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                <div className="flex items-center justify-between">
                    <div className="eyebrow">Totale ordine</div>
                    <div className="font-display text-2xl font-bold text-primary">{currency(order.total)}</div>
                </div>
                {order.notes && <p className="text-xs text-muted-foreground">{order.notes}</p>}
                {editable && (
                    <div className="flex gap-2 pt-2">
                        <Button className="flex-1" onClick={receive} data-testid="confirm-receive-button">
                            <PackageCheck className="h-4 w-4 mr-2" /> Registra arrivo
                        </Button>
                        <Button variant="outline" className="text-red-400" onClick={cancel} data-testid="cancel-order-button">
                            <Ban className="h-4 w-4 mr-2" /> Annulla ordine
                        </Button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

function Info({ label, value }) {
    return (
        <div className="rounded-md border border-border bg-black/30 p-3">
            <div className="eyebrow">{label}</div>
            <div className="font-medium truncate">{value}</div>
        </div>
    );
}
