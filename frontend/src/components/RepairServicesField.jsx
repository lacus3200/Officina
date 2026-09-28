import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/api/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchSelect } from "@/components/SearchSelect";
import { Trash2, Calculator } from "lucide-react";
import { currency } from "@/lib/format";

export function RepairServicesField({ services, deviceType, partsTotal, onChange, onUseAsEstimate }) {
    const [list, setList] = useState([]);

    const reload = () => api.get("/services", { params: { device_type: deviceType || undefined } }).then((r) => setList(r.data)).catch(() => {});
    useEffect(() => { reload(); // eslint-disable-next-line
    }, [deviceType]);

    const total = services.reduce((s, x) => s + Number(x.price || 0), 0);
    const update = (i, patch) => {
        const arr = [...services];
        arr[i] = { ...arr[i], ...patch };
        onChange(arr);
    };

    return (
        <div className="col-span-2 pt-2">
            <div className="flex items-center justify-between mb-2 gap-2">
                <Label className="eyebrow">Interventi da listino</Label>
                <div className="w-72">
                    <SearchSelect
                        testId="add-service-select"
                        value=""
                        placeholder="+ Aggiungi intervento"
                        searchPlaceholder="Cerca intervento…"
                        emptyLabel="Nessun intervento nel listino."
                        options={list.map((s) => ({ value: s.id, label: `${s.name} · ${currency(s.price)}`, rawLabel: s.name, group: s.category || "Altro", keywords: s.category || "", svc: s }))}
                        onRename={(o, n) => api.put(`/services/${o.value}`, { ...o.svc, name: n }).then(() => { toast.success("Intervento rinominato"); reload(); }).catch((e) => toast.error(formatApiError(e)))}
                        onDelete={(o) => api.delete(`/services/${o.value}`).then(() => { toast.success("Intervento eliminato"); reload(); }).catch((e) => toast.error(formatApiError(e)))}
                        onChange={(v) => {
                            const s = list.find((x) => x.id === v);
                            if (s) onChange([...services, { service_id: s.id, name: s.name, price: s.price }]);
                        }}
                    />
                </div>
            </div>
            <div className="space-y-2">
                {services.map((s, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-center" data-testid={`repair-service-row-${i}`}>
                        <Input className="col-span-8" value={s.name} onChange={(e) => update(i, { name: e.target.value })} />
                        <Input className="col-span-3" type="number" step="0.01" value={s.price} onChange={(e) => update(i, { price: Number(e.target.value) })} data-testid={`repair-service-price-${i}`} />
                        <Button type="button" variant="ghost" size="icon" className="col-span-1 text-red-400" onClick={() => onChange(services.filter((_, idx) => idx !== i))}>
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                ))}
            </div>
            {(services.length > 0 || partsTotal > 0) && (
                <div className="flex items-center justify-between mt-3 text-sm rounded-md border border-border bg-black/20 px-3 py-2">
                    <span className="text-muted-foreground">
                        Interventi {currency(total)} + ricambi {currency(partsTotal)} = <b className="text-foreground" data-testid="repair-suggested-total">{currency(total + partsTotal)}</b>
                    </span>
                    <Button type="button" size="sm" variant="outline" onClick={() => onUseAsEstimate(total + partsTotal)} data-testid="use-as-estimate-button">
                        <Calculator className="h-3.5 w-3.5 mr-1" /> Usa come preventivo
                    </Button>
                </div>
            )}
        </div>
    );
}
