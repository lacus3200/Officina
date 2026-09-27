import React, { useEffect, useState } from "react";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Calculator } from "lucide-react";
import { currency } from "@/lib/format";

export function RepairServicesField({ services, deviceType, partsTotal, onChange, onUseAsEstimate }) {
    const [list, setList] = useState([]);

    useEffect(() => {
        api.get("/services", { params: { device_type: deviceType || undefined } }).then((r) => setList(r.data)).catch(() => {});
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
                <Select value="" onValueChange={(v) => {
                    const s = list.find((x) => x.id === v);
                    if (s) onChange([...services, { service_id: s.id, name: s.name, price: s.price }]);
                }}>
                    <SelectTrigger className="w-64 h-8" data-testid="add-service-select">
                        <span className="flex items-center gap-1 text-sm"><Plus className="h-3 w-3" /> Aggiungi intervento</span>
                    </SelectTrigger>
                    <SelectContent>
                        {list.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                                {s.name} <span className="text-muted-foreground">· {currency(s.price)}</span>
                            </SelectItem>
                        ))}
                        {list.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">Listino vuoto</div>}
                    </SelectContent>
                </Select>
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
