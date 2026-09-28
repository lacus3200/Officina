import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X, Check, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { toast } from "sonner";

const NEW = "__new__";
const FREE = "__free__";

export function PartNameSelect({ value, onSelect }) {
    const [templates, setTemplates] = useState([]);
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState({ name: "", category: "" });
    const [free, setFree] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);

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
    const grouped = templates.reduce((acc, t) => { (acc[t.category || "Altro"] = acc[t.category || "Altro"] || []).push(t); return acc; }, {});

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
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                    <Button type="button" variant="outline" role="combobox" className="w-full justify-between font-normal" data-testid="part-name-select">
                        <span className={value ? "" : "text-muted-foreground"}>{value || "Cerca nel catalogo ricambi…"}</span>
                        <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)] bg-card border-border" align="start">
                    <Command>
                        <CommandInput placeholder="Digita per cercare…" data-testid="part-name-search-input" />
                        <CommandList className="max-h-72">
                            <CommandEmpty>Nessun ricambio trovato.</CommandEmpty>
                            {Object.entries(grouped).map(([cat, list]) => (
                                <CommandGroup key={cat} heading={cat}>
                                    {list.map((t) => (
                                        <CommandItem key={t.id} value={`${t.name} ${t.category}`} onSelect={() => { onSelect(t.name, t.category || null); setPickerOpen(false); }} data-testid={`part-name-option-${t.id}`}>
                                            <Check className={`mr-2 h-4 w-4 ${value === t.name ? "opacity-100" : "opacity-0"}`} />
                                            {t.name}
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            ))}
                            <CommandGroup heading="Altro">
                                <CommandItem value="__aggiungi_catalogo__" onSelect={() => { setPickerOpen(false); setDraft({ name: "", category: "" }); setOpen(true); }} className="text-primary" data-testid="part-name-add-option">
                                    <Plus className="mr-2 h-4 w-4" /> Aggiungi al catalogo…
                                </CommandItem>
                                <CommandItem value="__nome_libero__" onSelect={() => { setPickerOpen(false); setFree(true); onSelect("", null); }} data-testid="part-name-free-option">
                                    ✎ Nome libero (una tantum)
                                </CommandItem>
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
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
                <Select value={brand || "none"} onValueChange={(v) => setBrand(v === "none" ? "" : v)}>
                    <SelectTrigger data-testid="compat-brand-select"><SelectValue placeholder="Marca" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {brands.map((b) => <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Select value="" disabled={!brand} onValueChange={(v) => add(v === "__all__" ? `${brand} (tutti i modelli)` : `${brand} ${v}`)}>
                    <SelectTrigger data-testid="compat-model-select"><SelectValue placeholder={brand ? "Aggiungi modello…" : "Scegli la marca"} /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="__all__">Tutti i modelli {brand}</SelectItem>
                        {models.map((m) => <SelectItem key={m.id} value={m.name}>{m.name}{m.code ? ` (${m.code})` : ""}</SelectItem>)}
                    </SelectContent>
                </Select>
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

function CreatableSelect({ value, onChange, options, placeholder, testId, addLabel }) {
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
        <Select value={value || "none"} onValueChange={(v) => { if (v === NEW) { setCustom(true); onChange(""); return; } onChange(v === "none" ? "" : v); }}>
            <SelectTrigger data-testid={testId}><SelectValue placeholder={placeholder} /></SelectTrigger>
            <SelectContent className="max-h-72">
                <SelectItem value="none">—</SelectItem>
                {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                <SelectItem value={NEW} className="text-primary"><span className="flex items-center gap-1"><Plus className="h-3 w-3" /> {addLabel}</span></SelectItem>
            </SelectContent>
        </Select>
    );
}

export function PartCategorySelect({ value, onChange }) {
    const [cats, setCats] = useState([]);
    useEffect(() => { api.get("/catalog/part-categories").then((r) => setCats(r.data.map((c) => c.name))).catch(() => {}); }, []);
    return <CreatableSelect value={value} onChange={onChange} options={cats} placeholder="Categoria" testId="part-category-select" addLabel="Nuova categoria…" />;
}

export function PartBrandSelect({ value, onChange }) {
    const [brands, setBrands] = useState([]);
    useEffect(() => { api.get("/catalog/part-brands").then((r) => setBrands(r.data)).catch(() => {}); }, []);
    return <CreatableSelect value={value} onChange={onChange} options={brands} placeholder="Marca / produttore" testId="part-brand-select" addLabel="Nuova marca…" />;
}
