import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { toast } from "sonner";

const NEW = "__new__";

export function DeviceBrandModelFields({ brand, model, onChange, deviceType }) {
    const [brands, setBrands] = useState([]);
    const [models, setModels] = useState([]);
    const [dialog, setDialog] = useState(null);
    const [draft, setDraft] = useState({ name: "", code: "" });

    const loadBrands = () => api.get("/catalog/brands").then((r) => setBrands(r.data)).catch(() => {});
    const loadModels = (b) => (b ? api.get("/catalog/models", { params: { brand: b } }).then((r) => setModels(r.data)).catch(() => {}) : setModels([]));

    useEffect(() => { loadBrands(); }, []);
    useEffect(() => { loadModels(brand); }, [brand]);

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
                <Select
                    value={brand || "none"}
                    onValueChange={(v) => {
                        if (v === NEW) { setDraft({ name: "", code: "" }); setDialog("brand"); return; }
                        onChange({ brand: v === "none" ? "" : v, model: "" });
                    }}
                >
                    <SelectTrigger data-testid="device-brand-select"><SelectValue placeholder="Marca" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {!brandKnown && <SelectItem value={brand}>{brand}</SelectItem>}
                        {brands.map((b) => <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>)}
                        <SelectItem value={NEW} className="text-primary"><span className="flex items-center gap-1"><Plus className="h-3 w-3" /> Aggiungi marca…</span></SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div>
                <Label className="eyebrow">Modello</Label>
                <Select
                    value={model || "none"}
                    disabled={!brand}
                    onValueChange={(v) => {
                        if (v === NEW) { setDraft({ name: "", code: "" }); setDialog("model"); return; }
                        onChange({ brand, model: v === "none" ? "" : v });
                    }}
                >
                    <SelectTrigger data-testid="device-model-select"><SelectValue placeholder={brand ? "Modello" : "Scegli prima la marca"} /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {!modelKnown && <SelectItem value={model}>{model}</SelectItem>}
                        {models.map((m) => (
                            <SelectItem key={m.id} value={m.name}>
                                {m.name}{m.code ? <span className="text-muted-foreground"> ({m.code})</span> : null}
                            </SelectItem>
                        ))}
                        <SelectItem value={NEW} className="text-primary"><span className="flex items-center gap-1"><Plus className="h-3 w-3" /> Aggiungi modello…</span></SelectItem>
                    </SelectContent>
                </Select>
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
