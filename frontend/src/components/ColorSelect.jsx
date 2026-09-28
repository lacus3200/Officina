import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchSelect } from "@/components/SearchSelect";
import { toast } from "sonner";


export function ColorSelect({ brand, model, value, onChange }) {
    const [colors, setColors] = useState([]);
    const [modelId, setModelId] = useState(null);
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState("");

    const load = () =>
        api.get("/catalog/colors", { params: { brand: brand || undefined, model: model || undefined } })
            .then((r) => { setColors(r.data.colors); setModelId(r.data.model_id); })
            .catch(() => {});
    useEffect(() => { load(); // eslint-disable-next-line
    }, [brand, model]);

    const add = async () => {
        const c = draft.trim();
        if (!c) return;
        try {
            if (modelId) await api.post(`/catalog/models/${modelId}/colors`, { color: c });
            setColors((prev) => (prev.includes(c) ? prev : [c, ...prev]));
            onChange(c);
            setOpen(false);
            setDraft("");
            toast.success(modelId ? `Colore aggiunto a ${model}` : "Colore impostato");
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    return (
        <>
            <SearchSelect
                testId="refurb-color-select"
                value={value}
                placeholder="Colore"
                searchPlaceholder="Cerca colore…"
                noneLabel="—"
                options={[...colors.map((c) => ({ value: c, label: c })), ...(value && !colors.includes(value) ? [{ value, label: value }] : [])]}
                onChange={(v) => onChange(v)}
                actions={[{ label: "Aggiungi colore…", testId: "refurb-color-add", onSelect: () => { setDraft(""); setOpen(true); } }]}
            />
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="bg-card border-border max-w-sm" data-testid="color-dialog">
                    <DialogHeader><DialogTitle>Nuovo colore{model ? ` · ${brand} ${model}` : ""}</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                        <div>
                            <Label className="eyebrow">Nome colore *</Label>
                            <Input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Es. Verde alpino" data-testid="color-name-input" />
                        </div>
                        {!modelId && <p className="text-xs text-muted-foreground">Seleziona marca e modello per salvare il colore nel catalogo del modello.</p>}
                        <Button className="w-full" onClick={add} disabled={!draft.trim()} data-testid="color-save-button">Aggiungi</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
