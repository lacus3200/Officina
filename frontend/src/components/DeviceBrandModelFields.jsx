import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchSelect } from "@/components/SearchSelect";
import { toast } from "sonner";


export function DeviceBrandModelFields({ brand, model, onChange, deviceType }) {
    const [brands, setBrands] = useState([]);
    const [models, setModels] = useState([]);
    const [dialog, setDialog] = useState(null);
    const [draft, setDraft] = useState({ name: "", code: "" });

    const loadBrands = () => api.get("/catalog/brands").then((r) => setBrands(r.data)).catch(() => {});
    const loadModels = (b) => (b ? api.get("/catalog/models", { params: { brand: b } }).then((r) => setModels(r.data)).catch(() => {}) : setModels([]));

    useEffect(() => { loadBrands(); }, []);
    useEffect(() => { loadModels(brand); }, [brand]);

    const mutate = async (fn, msg, after) => {
        try {
            await fn();
            toast.success(msg);
            await after?.();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    const brandKnown = !brand || brands.some((b) => b.name === brand);
    const modelKnown = !model || models.some((m) => m.name === model);

    const submit = async () => {
        try {
            if (dialog === "brand") {
                const { data } = await api.post("/catalog/brands", { name: draft.name });
                await loadBrands();
                onChange({ brand: data.name, model: "" });
            } else {
                const { data } = await api.post("/catalog/models", { brand, name: draft.name, code: draft.code, device_type: deviceType });
                await loadModels(brand);
                onChange({ brand, model: data.name });
            }
            toast.success(dialog === "brand" ? "Marca aggiunta" : "Modello aggiunto");
            setDialog(null);
            setDraft({ name: "", code: "" });
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    return (
        <>
            <div>
                <Label className="eyebrow">Marca</Label>
                <SearchSelect
                    testId="device-brand-select"
                    value={brand}
                    placeholder="Marca"
                    searchPlaceholder="Cerca marca…"
                    noneLabel="—"
                    options={[...brands.map((b) => ({ value: b.name, label: b.name, id: b.id })), ...(!brandKnown ? [{ value: brand, label: brand }] : [])]}
                    onChange={(v) => onChange({ brand: v, model: "" })}
                    canEdit={(o) => !!o.id}
                    onRename={(o, n) => mutate(() => api.put(`/catalog/brands/${o.id}`, { name: n }), "Marca rinominata", () => { loadBrands(); if (brand === o.value) onChange({ brand: n, model }); })}
                    onDelete={(o) => mutate(() => api.delete(`/catalog/brands/${o.id}`), "Marca eliminata", () => { loadBrands(); if (brand === o.value) onChange({ brand: "", model: "" }); })}
                    actions={[{ label: "Aggiungi marca…", testId: "device-brand-add", onSelect: () => { setDraft({ name: "", code: "" }); setDialog("brand"); } }]}
                />
            </div>
            <div>
                <Label className="eyebrow">Modello</Label>
                <SearchSelect
                    testId="device-model-select"
                    value={model}
                    disabled={!brand}
                    placeholder={brand ? "Modello" : "Scegli prima la marca"}
                    searchPlaceholder="Cerca modello o codice…"
                    noneLabel="—"
                    options={[...models.map((m) => ({ value: m.name, label: m.code ? `${m.name} (${m.code})` : m.name, rawLabel: m.name, keywords: m.code || "", id: m.id, code: m.code })), ...(!modelKnown ? [{ value: model, label: model }] : [])]}
                    onChange={(v) => onChange({ brand, model: v })}
                    canEdit={(o) => !!o.id}
                    onRename={(o, n) => mutate(() => api.put(`/catalog/models/${o.id}`, { brand, name: n, code: o.code }), "Modello rinominato", () => { loadModels(brand); if (model === o.value) onChange({ brand, model: n }); })}
                    onDelete={(o) => mutate(() => api.delete(`/catalog/models/${o.id}`), "Modello eliminato", () => { loadModels(brand); if (model === o.value) onChange({ brand, model: "" }); })}
                    actions={brand ? [{ label: "Aggiungi modello…", testId: "device-model-add", onSelect: () => { setDraft({ name: "", code: "" }); setDialog("model"); } }] : []}
                />
            </div>

            <Dialog open={!!dialog} onOpenChange={(v) => !v && setDialog(null)}>
                <DialogContent className="bg-card border-border max-w-sm" data-testid="catalog-dialog">
                    <DialogHeader><DialogTitle>{dialog === "brand" ? "Nuova marca" : `Nuovo modello ${brand}`}</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                        <div>
                            <Label className="eyebrow">{dialog === "brand" ? "Nome marca *" : "Nome commerciale *"}</Label>
                            <Input autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} data-testid="catalog-name-input" placeholder={dialog === "brand" ? "Es. Honor" : "Es. Galaxy A15"} />
                        </div>
                        {dialog === "model" && (
                            <div>
                                <Label className="eyebrow">Codice tecnico (non commerciale)</Label>
                                <Input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} data-testid="catalog-code-input" placeholder="Es. SM-A155F, A2633" />
                            </div>
                        )}
                        <Button className="w-full" onClick={submit} disabled={!draft.name.trim()} data-testid="catalog-save-button">Aggiungi</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
