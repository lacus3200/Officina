import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchSelect } from "@/components/SearchSelect";
import { X } from "lucide-react";
import { toast } from "sonner";

const FREE = "__free__";

export function PartNameSelect({ value, onSelect }) {
    const [templates, setTemplates] = useState([]);
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState({ name: "", category: "" });
    const [free, setFree] = useState(false);

    const load = () => api.get("/catalog/parts").then((r) => setTemplates(r.data)).catch(() => {});
    useEffect(() => { load(); }, []);

    useEffect(() => {
        if (draft.name.length < 3) return;
        const t = setTimeout(() => {
            api.get("/catalog/parts/guess-category", { params: { name: draft.name } })
                .then((r) => r.data.category && setDraft((d) => (d.category ? d : { ...d, category: r.data.category })))
                .catch(() => {});
        }, 350);
        return () => clearTimeout(t);
    }, [draft.name]);

    const known = templates.find((t) => t.name === value);

    const add = async () => {
        try {
            const { data } = await api.post("/catalog/parts", draft);
            await load();
            onSelect(data.name, data.category);
            setOpen(false);
            setDraft({ name: "", category: "" });
            toast.success("Ricambio aggiunto al catalogo");
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    if (free || (value && !known)) {
        return (
            <div className="flex gap-2">
                <Input autoFocus data-testid="part-name-input" value={value} placeholder="Nome ricambio" onChange={(e) => onSelect(e.target.value, null)} />
                <Button type="button" variant="outline" size="sm" onClick={() => { setFree(false); onSelect("", null); }}>Catalogo</Button>
            </div>
        );
    }

    return (
        <>
            <SearchSelect
                testId="part-name-select"
                value={value}
                placeholder="Cerca nel catalogo ricambi…"
                searchPlaceholder="Digita per cercare…"
                emptyLabel="Nessun ricambio trovato."
                options={templates.map((t) => ({ value: t.name, label: t.name, group: t.category || "Altro", keywords: t.category || "", id: t.id, category: t.category }))}
                onChange={(v, o) => onSelect(v, o?.category || null)}
                actions={[
                    { label: "Aggiungi al catalogo…", testId: "part-name-add-option", onSelect: () => { setDraft({ name: "", category: "" }); setOpen(true); } },
                    { label: "Nome libero (una tantum)", testId: "part-name-free-option", onSelect: () => { setFree(true); onSelect("", null); } },
                ]}
                onRename={(o, n) => api.put(`/catalog/parts/${o.id}`, { name: n, category: o.category }).then(() => { toast.success("Ricambio rinominato"); load(); if (value === o.value) onSelect(n, o.category); }).catch((e) => toast.error(formatApiError(e)))}
                onDelete={(o) => api.delete(`/catalog/parts/${o.id}`).then(() => { toast.success("Ricambio eliminato dal catalogo"); load(); if (value === o.value) onSelect("", null); }).catch((e) => toast.error(formatApiError(e)))}
            />
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="bg-card border-border max-w-sm" data-testid="part-template-dialog">
                    <DialogHeader><DialogTitle>Nuovo ricambio nel catalogo</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                        <div>
                            <Label className="eyebrow">Nome *</Label>
                            <Input autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Es. Schermo OLED completo" data-testid="part-template-name" />
                        </div>
                        <div>
                            <Label className="eyebrow">Categoria (auto-assegnata dal nome)</Label>
                            <Input value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} placeholder="Schermo, Batteria…" data-testid="part-template-category" />
                        </div>
                        <Button className="w-full" onClick={add} disabled={!draft.name.trim()} data-testid="part-template-save">Aggiungi e seleziona</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}

export function CompatibleModelsField({ value, onChange }) {
    const [brands, setBrands] = useState([]);
    const [models, setModels] = useState([]);
    const [brand, setBrand] = useState("");

    useEffect(() => { api.get("/catalog/brands").then((r) => setBrands(r.data)).catch(() => {}); }, []);
    useEffect(() => { brand ? api.get("/catalog/models", { params: { brand } }).then((r) => setModels(r.data)).catch(() => {}) : setModels([]); }, [brand]);

    const add = (label) => { if (label && !value.includes(label)) onChange([...value, label]); };

    return (
        <div className="col-span-2">
            <Label className="eyebrow">Compatibile con i modelli</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
                <SearchSelect
                    testId="compat-brand-select"
                    value={brand}
                    placeholder="Marca"
                    searchPlaceholder="Cerca marca…"
                    noneLabel="—"
                    options={brands.map((b) => ({ value: b.name, label: b.name }))}
                    onChange={(v) => setBrand(v)}
                />
                <SearchSelect
                    testId="compat-model-select"
                    value=""
                    disabled={!brand}
                    placeholder={brand ? "Aggiungi modello…" : "Scegli la marca"}
                    searchPlaceholder="Cerca modello…"
                    sorted={false}
                    options={[{ value: "__all__", label: `Tutti i modelli ${brand}` }, ...[...models].sort((a, b) => a.name.localeCompare(b.name, "it", { numeric: true })).map((m) => ({ value: m.name, label: m.code ? `${m.name} (${m.code})` : m.name, keywords: m.code || "" }))]}
                    onChange={(v) => add(v === "__all__" ? `${brand} (tutti i modelli)` : `${brand} ${v}`)}
                />
            </div>
            {value.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2" data-testid="compat-chips">
                    {value.map((m) => (
                        <span key={m} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs border border-primary/30 bg-primary/10 text-primary">
                            {m}
                            <button type="button" onClick={() => onChange(value.filter((x) => x !== m))} className="hover:text-white" data-testid={`compat-remove-${m}`}><X className="h-3 w-3" /></button>
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

function CreatableSelect({ value, onChange, options, placeholder, testId, addLabel, onRename, onDelete }) {
    const [custom, setCustom] = useState(false);
    if (custom || (value && !options.includes(value))) {
        return (
            <div className="flex gap-2">
                <Input autoFocus value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} data-testid={`${testId}-input`} />
                <Button type="button" variant="outline" size="sm" onClick={() => { setCustom(false); onChange(""); }}>Lista</Button>
            </div>
        );
    }
    return (
        <SearchSelect
            testId={testId}
            value={value}
            placeholder={placeholder}
            searchPlaceholder="Cerca…"
            noneLabel="—"
            options={options.map((o) => ({ value: o, label: o }))}
            onChange={(v) => onChange(v)}
            actions={[{ label: addLabel, testId: `${testId}-add`, onSelect: () => { setCustom(true); onChange(""); } }]}
            onRename={onRename ? (o, n) => onRename(o.value, n) : undefined}
            onDelete={onDelete ? (o) => onDelete(o.value) : undefined}
        />
    );
}

const run = (p, msg, after) => p.then(() => { toast.success(msg); after?.(); }).catch((e) => toast.error(formatApiError(e)));

export function PartCategorySelect({ value, onChange }) {
    const [cats, setCats] = useState([]);
    const load = () => api.get("/catalog/part-categories").then((r) => setCats(r.data.map((c) => c.name))).catch(() => {});
    useEffect(() => { load(); }, []);
    return (
        <CreatableSelect value={value} onChange={onChange} options={cats} placeholder="Categoria" testId="part-category-select" addLabel="Nuova categoria…"
            onRename={(old, n) => run(api.put("/catalog/part-categories/rename", { old, new: n }), "Categoria rinominata", () => { load(); if (value === old) onChange(n); })}
            onDelete={(old) => run(api.put("/catalog/part-categories/delete", { name: old }), "Categoria eliminata", () => { load(); if (value === old) onChange(""); })}
        />
    );
}

export function PartBrandSelect({ value, onChange }) {
    const [brands, setBrands] = useState([]);
    const load = () => api.get("/catalog/part-brands").then((r) => setBrands(r.data)).catch(() => {});
    useEffect(() => { load(); }, []);
    return (
        <CreatableSelect value={value} onChange={onChange} options={brands} placeholder="Marca / produttore" testId="part-brand-select" addLabel="Nuova marca…"
            onRename={(old, n) => run(api.put("/catalog/part-brands/rename", { old, new: n }), "Marca rinominata", () => { load(); if (value === old) onChange(n); })}
            onDelete={(old) => run(api.put("/catalog/part-brands/rename", { old, new: "" }), "Marca eliminata", () => { load(); if (value === old) onChange(""); })}
        />
    );
}
