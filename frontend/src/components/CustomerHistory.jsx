import React, { useEffect, useState } from "react";
import { api } from "@/api/client";
import { currency, formatDate, REPAIR_STATUS } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { Link } from "react-router-dom";

const Stat = ({ label, value, testId }) => (
    <div className="rounded-md border border-border bg-black/30 px-3 py-2">
        <div className="eyebrow">{label}</div>
        <div className="font-display text-lg font-bold" data-testid={testId}>{value}</div>
    </div>
);

export function CustomerHistory({ customerId }) {
    const [data, setData] = useState(null);
    useEffect(() => {
        setData(null);
        if (customerId) api.get(`/customers/${customerId}/summary`).then((r) => setData(r.data)).catch(() => setData({ repairs: [], sales: [], repairs_total: 0, repairs_open: 0, repairs_spent: 0, sales_spent: 0 }));
    }, [customerId]);
    if (!data) return <div className="text-xs text-muted-foreground animate-pulse">Caricamento storico…</div>;
    return (
        <div className="space-y-3" data-testid="customer-history">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Stat label="Riparazioni" value={data.repairs_total} testId="customer-repairs-total" />
                <Stat label="Aperte" value={data.repairs_open} testId="customer-repairs-open" />
                <Stat label="Speso riparazioni" value={currency(data.repairs_spent)} testId="customer-repairs-spent" />
                <Stat label="Speso acquisti" value={currency(data.sales_spent)} testId="customer-sales-spent" />
            </div>
            <div>
                <div className="eyebrow mb-1">Riparazioni effettuate</div>
                {data.repairs.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-2">Nessuna riparazione per questo cliente.</div>
                ) : (
                    <div className="overflow-x-auto max-h-56 overflow-y-auto border border-border rounded-md">
                        <table className="w-full text-sm min-w-[520px]">
                            <tbody>
                                {data.repairs.map((r) => (
                                    <tr key={r.id} className="border-b border-border/50" data-testid={`customer-repair-${r.id}`}>
                                        <td className="px-3 py-2 font-mono text-primary text-xs whitespace-nowrap"><Link to="/riparazioni" className="hover:underline">{r.ticket_number}</Link></td>
                                        <td className="px-3 py-2 truncate">
                                            <div className="truncate">{[r.device_brand, r.device_model].filter(Boolean).join(" ") || r.device_type}</div>
                                            <div className="text-xs text-muted-foreground truncate">{r.problem}</div>
                                        </td>
                                        <td className="px-3 py-2"><StatusBadge map={REPAIR_STATUS} value={r.status} /></td>
                                        <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{formatDate(r.received_at || r.created_at)}</td>
                                        <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{currency(r.final_price || r.estimate)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
            {data.sales.length > 0 && (
                <div>
                    <div className="eyebrow mb-1">Acquisti</div>
                    <div className="overflow-x-auto max-h-40 overflow-y-auto border border-border rounded-md">
                        <table className="w-full text-sm min-w-[420px]">
                            <tbody>
                                {data.sales.map((s) => (
                                    <tr key={s.id} className="border-b border-border/50" data-testid={`customer-sale-${s.id}`}>
                                        <td className="px-3 py-2 font-mono text-primary text-xs whitespace-nowrap"><Link to="/vendite" className="hover:underline">{s.invoice_number}</Link></td>
                                        <td className="px-3 py-2 truncate text-muted-foreground">{(s.items || []).map((i) => i.description).join(", ")}</td>
                                        <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{formatDate(s.created_at)}</td>
                                        <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{currency(s.total)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
