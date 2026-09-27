import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";

export function PartCatalogManager({ open, onOpenChange, onChanged }) {
    const [cats, setCats] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [catEdit, setCatEdit] = useState(null);
    const [tplEdit, setTplEdit] = useState(null);

    const load = async () => {
        try {
            const [c, t] = await Promise.all([api.get("/catalog/part-categories"), api.get("/catalog/parts")]);
            setCats(c.data);
            setTemplates(t.data);
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };
    useEffect(() => { if (open) load(); }, [open]);

    const run = async (fn, msg) => {
        try {
            await fn();
            toast.success(msg);
            setCatEdit(null);
            setTplEdit(null);
            load();
            onChanged?.();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="catalog-manager-dialog">
                <DialogHeader><DialogTitle>Categorie e catalogo ricambi</DialogTitle></DialogHeader>
                <Tabs defaultValue="categories">
                    <TabsList>
                        <TabsTrigger value="categories" data-testid="tab-categories">Categorie ({cats.length})</TabsTrigger>
                        <TabsTrigger value="templates" data-testid="tab-templates">Tipologie ricambi ({templates.length})</TabsTrigger>
                    </TabsList>
                    <TabsContent value="categories" className="mt-3">
                        <p className="text-xs text-muted-foreground mb-3">Rinominando una categoria vengono aggiornati tutti i ricambi e le tipologie che la usano.</p>
                        <div className="divide-y divide-border/50">
                            {cats.map((c) => (
                                <div key={c.name} className="flex items-center justify-between gap-2 py-2 text-sm" data-testid={`category-row-${c.name}`}>
                                    {catEdit?.old === c.name ? (
                                        <>
                                            <Input autoFocus className="h-8" value={catEdit.new} onChange={(e) => setCatEdit({ ...catEdit, new: e.target.value })}
                                                onKeyDown={(e) => e.key === "Enter" && run(() => api.put("/catalog/part-categories/rename", catEdit), "Categoria rinominata")}
                                                data-testid="category-rename-input" />
                                            <Button size="icon" className="h-8 w-8" onClick={() => run(() => api.put("/catalog/part-categories/rename", catEdit), "Categoria rinominata")} data-testid="category-rename-save"><Check className="h-4 w-4" /></Button>
                                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setCatEdit(null)}><X className="h-4 w-4" /></Button>
                                        </>
                                    ) : (
                                        <>
                                            <span>{c.name} <span className="text-muted-foreground text-xs">· {c.parts} ricambi</span></span>
                                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setCatEdit({ old: c.name, new: c.name })} data-testid={`category-edit-${c.name}`}><Pencil className="h-4 w-4" /></Button>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                    </TabsContent>
                    <TabsContent value="templates" className="mt-3">
                        <div className="divide-y divide-border/50">
                            {templates.map((t) => (
                                <div key={t.id} className="flex items-center gap-2 py-2 text-sm" data-testid={`template-row-${t.id}`}>
                                    {tplEdit?.id === t.id ? (
                                        <>
                                            <Input autoFocus className="h-8 flex-1" value={tplEdit.name} onChange={(e) => setTplEdit({ ...tplEdit, name: e.target.value })} data-testid="template-name-input" />
                                            <Input className="h-8 w-40" value={tplEdit.category} onChange={(e) => setTplEdit({ ...tplEdit, category: e.target.value })} data-testid="template-category-input" />
                                            <Button size="icon" className="h-8 w-8" onClick={() => run(() => api.put(`/catalog/parts/${t.id}`, { name: tplEdit.name, category: tplEdit.category }), "Tipologia aggiornata")} data-testid="template-save"><Check className="h-4 w-4" /></Button>
                                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setTplEdit(null)}><X className="h-4 w-4" /></Button>
                                        </>
                                    ) : (
                                        <>
                                            <span className="flex-1 truncate">{t.name}</span>
                                            <span className="text-xs text-muted-foreground w-40 truncate">{t.category}</span>
                                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setTplEdit({ id: t.id, name: t.name, category: t.category || "" })} data-testid={`template-edit-${t.id}`}><Pencil className="h-4 w-4" /></Button>
                                            <Button size="icon" variant="ghost" className="h-8 w-8 text-red-400" onClick={() => window.confirm("Eliminare la tipologia dal catalogo?") && run(() => api.delete(`/catalog/parts/${t.id}`), "Tipologia eliminata")} data-testid={`template-delete-${t.id}`}><Trash2 className="h-4 w-4" /></Button>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}
