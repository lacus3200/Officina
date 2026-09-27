import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { currency, formatDate, formatDateTime, REPAIR_STATUS, ORDER_STATUS, REFURB_STATUS } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { ExternalLink } from "lucide-react";

const META = {
    repair: { title: "Riparazione", route: "/riparazioni", code: (d) => d.ticket_number },
    sale: { title: "Vendita", route: "/vendite", code: (d) => d.invoice_number },
    order: { title: "Ordine fornitore", route: "/fornitori", code: (d) => d.order_number },
    refurbished: { title: "Dispositivo ricondizionato", route: "/ricondizionati", code: (d) => d.code },
};

function Row({ label, value }) {
    return (
        <div className="flex justify-between gap-4 py-1.5 border-b border-border/50 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className="text-right">{value ?? "—"}</span>
        </div>
    );
}

function Body({ type, data }) {
    if (type === "repair")
        return (
            <>
                <Row label="Stato" value={<StatusBadge map={REPAIR_STATUS} value={data.status} />} />
                <Row label="Cliente" value={data.customer_name || "walk-in"} />
                <Row label="Dispositivo" value={`${data.device_type} · ${data.device_brand || ""} ${data.device_model || ""}`} />
                <Row label="Problema" value={data.problem} />
                <Row label="Ricambi" value={data.parts_used?.map((p) => `${p.part_name} ×${p.quantity}`).join(", ") || "—"} />
                <Row label="Prezzo finale" value={currency(data.final_price)} />
                <Row label="Entrata / Uscita" value={`${formatDate(data.received_at || data.created_at)} → ${data.delivered_at ? formatDate(data.delivered_at) : "—"}`} />
            </>
        );
    if (type === "sale")
        return (
            <>
                <Row label="Cliente" value={data.customer_name || "walk-in"} />
                <Row label="Pagamento" value={data.payment_method} />
                {data.items.map((it, i) => <Row key={i} label={`${it.description} ×${it.quantity}`} value={currency(it.unit_price * it.quantity)} />)}
                <Row label="Totale" value={<b>{currency(data.total)}</b>} />
                <Row label="Margine" value={<span className="text-emerald-400">{currency(data.margin)}</span>} />
            </>
        );
    if (type === "order")
        return (
            <>
                <Row label="Stato" value={<StatusBadge map={ORDER_STATUS} value={data.status} />} />
                <Row label="Fornitore" value={data.supplier_name} />
                {data.items.map((it, i) => <Row key={i} label={`${it.description} · ${it.received_qty || 0}/${it.quantity}`} value={currency(it.unit_cost * it.quantity)} />)}
                <Row label="Totale ordine" value={<b>{currency(data.total)}</b>} />
            </>
        );
    return (
        <>
            <Row label="Stato" value={<StatusBadge map={REFURB_STATUS} value={data.status} />} />
            <Row label="Dispositivo" value={`${data.brand || ""} ${data.model || ""}${data.grade ? ` · Grado ${data.grade}` : ""}`} />
            <Row label="Costo acquisto" value={currency(data.purchase_cost)} />
            <Row label="Costi extra" value={currency(data.extra_costs)} />
            <Row label="Costo totale" value={currency(data.total_cost)} />
            {data.status === "venduto" && <Row label="Venduto / Margine" value={`${currency(data.sale_price)} / ${currency(data.margin)}`} />}
        </>
    );
}

export function CashReferenceDialog({ movement, onOpenChange }) {
    const [ref, setRef] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
        if (!movement) return;
        setRef(null);
        api.get(`/cash/${movement.id}/reference`).then((r) => setRef(r.data)).catch((e) => toast.error(formatApiError(e)));
    }, [movement]);

    if (!movement) return null;
    const meta = ref?.type ? META[ref.type] : null;

    return (
        <Dialog open={!!movement} onOpenChange={onOpenChange}>
            <DialogContent className="bg-card border-border max-w-lg" data-testid="cash-reference-dialog">
                <DialogHeader>
                    <DialogTitle className="flex items-center justify-between gap-3">
                        <span>{meta ? meta.title : "Movimento di cassa"}</span>
                        <span className={`font-mono ${movement.type === "entrata" ? "text-emerald-400" : "text-red-400"}`}>
                            {movement.type === "entrata" ? "+" : "-"}{currency(movement.amount)}
                        </span>
                    </DialogTitle>
                </DialogHeader>
                <div>
                    <Row label="Data" value={formatDateTime(movement.date)} />
                    <Row label="Categoria" value={<span className="capitalize">{movement.category.replace("_", " ")}</span>} />
                    <Row label="Descrizione" value={movement.description} />
                    {meta && <Row label="Riferimento" value={<span className="font-mono text-primary" data-testid="cash-reference-code">{meta.code(ref.data)}</span>} />}
                    {ref?.data && <Body type={ref.type} data={ref.data} />}
                    {ref && !ref.type && <p className="text-xs text-muted-foreground pt-3">Movimento manuale, nessun documento collegato.</p>}
                </div>
                {meta && (
                    <Button className="w-full" onClick={() => navigate(meta.route)} data-testid="cash-reference-open">
                        <ExternalLink className="h-4 w-4 mr-2" /> Apri sezione {meta.title}
                    </Button>
                )}
            </DialogContent>
        </Dialog>
    );
}
