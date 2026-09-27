import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { currency, formatDate, ORDER_STATUS } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { SuppliersTab } from "@/components/suppliers/SuppliersTab";
import { OrderFormDialog } from "@/components/suppliers/OrderFormDialog";
import { ReceiveOrderDialog } from "@/components/suppliers/ReceiveOrderDialog";

export default function SuppliersPage() {
    const [suppliers, setSuppliers] = useState([]);
    const [orders, setOrders] = useState([]);
    const [orderOpen, setOrderOpen] = useState(false);
    const [detail, setDetail] = useState(null);

    const load = async () => {
        try {
            const [s, o] = await Promise.all([api.get("/suppliers"), api.get("/purchase-orders")]);
            setSuppliers(s.data);
            setOrders(o.data);
            if (detail) setDetail(o.data.find((x) => x.id === detail.id) || null);
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };
    useEffect(() => {
        load();
        // eslint-disable-next-line
    }, []);

    const removeOrder = async (id) => {
        if (!window.confirm("Eliminare l'ordine e i relativi movimenti di cassa?")) return;
        try {
            await api.delete(`/purchase-orders/${id}`);
            toast.success("Ordine eliminato");
            load();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    const pending = orders.filter((o) => ["ordinato", "parziale"].includes(o.status));

    return (
        <div className="space-y-6">
            <div>
                <div className="eyebrow mb-2">Approvvigionamento</div>
                <h1 className="font-display text-4xl font-black tracking-tight">Fornitori & Ordini</h1>
            </div>

            <Tabs defaultValue="orders">
                <TabsList>
                    <TabsTrigger value="orders" data-testid="tab-orders">
                        Ordini {pending.length > 0 && <span className="ml-2 px-1.5 rounded bg-primary/20 text-primary text-xs">{pending.length}</span>}
                    </TabsTrigger>
                    <TabsTrigger value="suppliers" data-testid="tab-suppliers">Fornitori ({suppliers.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="orders" className="space-y-4 mt-4">
                    <div className="flex justify-end">
                        <Button onClick={() => setOrderOpen(true)} data-testid="new-order-button">
                            <Plus className="h-4 w-4 mr-2" /> Nuovo ordine
                        </Button>
                    </div>
                    <Card>
                        <CardContent className="p-0 overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-muted-foreground border-b border-border">
                                        <th className="px-4 py-3 font-medium">Ordine</th>
                                        <th className="px-4 py-3 font-medium">Fornitore</th>
                                        <th className="px-4 py-3 font-medium">Stato</th>
                                        <th className="px-4 py-3 font-medium">Arrivo</th>
                                        <th className="px-4 py-3 font-medium">Righe</th>
                                        <th className="px-4 py-3 font-medium text-right">Totale</th>
                                        <th className="px-4 py-3 font-medium text-right">Azioni</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {orders.length === 0 && (
                                        <tr>
                                            <td colSpan={7} className="text-center py-14 text-muted-foreground">
                                                <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-40" />
                                                Nessun ordine di riacquisto.
                                            </td>
                                        </tr>
                                    )}
                                    {orders.map((o, idx) => {
                                        const recv = o.items.reduce((s, i) => s + (i.received_qty || 0), 0);
                                        const tot = o.items.reduce((s, i) => s + i.quantity, 0);
                                        return (
                                            <tr
                                                key={o.id}
                                                className={`border-b border-border/50 hover:bg-white/5 cursor-pointer ${idx % 2 ? "bg-white/[0.02]" : ""}`}
                                                onClick={() => setDetail(o)}
                                                data-testid={`order-row-${o.id}`}
                                            >
                                                <td className="px-4 py-3 font-mono text-primary font-semibold">{o.order_number}</td>
                                                <td className="px-4 py-3">{o.supplier_name || "—"}</td>
                                                <td className="px-4 py-3"><StatusBadge map={ORDER_STATUS} value={o.status} testId={`order-status-${o.id}`} /></td>
                                                <td className="px-4 py-3 text-xs text-muted-foreground">
                                                    {o.received_at ? `Arrivato ${formatDate(o.received_at)}` : o.expected_date ? `Previsto ${formatDate(o.expected_date)}` : "—"}
                                                </td>
                                                <td className="px-4 py-3 font-mono text-muted-foreground">{recv}/{tot} pz</td>
                                                <td className="px-4 py-3 text-right font-mono">{currency(o.total)}</td>
                                                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                                    <div className="flex justify-end">
                                                        <Button variant="ghost" size="icon" className="text-red-400" onClick={() => removeOrder(o.id)} data-testid={`delete-order-${o.id}`}>
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="suppliers" className="mt-4">
                    <SuppliersTab suppliers={suppliers} reload={load} />
                </TabsContent>
            </Tabs>

            <OrderFormDialog open={orderOpen} onOpenChange={setOrderOpen} suppliers={suppliers} onSaved={load} />
            <ReceiveOrderDialog order={detail} onOpenChange={(v) => !v && setDetail(null)} onChanged={load} />
        </div>
    );
}
