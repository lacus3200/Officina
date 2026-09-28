import React, { useRef, useState } from "react";
import { api, formatApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Download, Upload, DatabaseBackup, AlertTriangle, ShieldCheck, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/format";

const LABELS = {
    customers: "Clienti", parts: "Ricambi", repairs: "Riparazioni", sales: "Vendite", cash_movements: "Movimenti cassa",
    suppliers: "Fornitori", purchase_orders: "Ordini", refurbished: "Ricondizionati", device_brands: "Marche", device_models: "Modelli",
    services: "Listino interventi", part_templates: "Catalogo ricambi", counters: "Contatori numerazione",
};

export default function SettingsPage() {
    const [busy, setBusy] = useState(false);
    const [preview, setPreview] = useState(null);
    const [mode, setMode] = useState("replace");
    const [review, setReview] = useState(null);
    const [excluded, setExcluded] = useState(new Set());
    const [editing, setEditing] = useState(null);
    const [wipeText, setWipeText] = useState("");
    const [wipeCatalogs, setWipeCatalogs] = useState(false);

    const doWipe = async () => {
        if (!window.confirm("Questa operazione cancella definitivamente i dati. Continuare?")) return;
        setBusy(true);
        try {
            const { data } = await api.post("/backup/wipe", { confirm: wipeText, include_catalogs: wipeCatalogs });
            toast.success(`Dati cancellati: ${Object.values(data.deleted).reduce((a, b) => a + b, 0)} record`);
            setWipeText("");
        } catch (e) {
            toast.error(formatApiError(e));
        } finally {
            setBusy(false);
        }
    };

    const validate = async (collections) => {
        try {
            const { data } = await api.post("/backup/validate", { collections, mode: "merge" });
            setReview(data);
            const errKeys = new Set(data.issues.filter((i) => i.severity === "error" && i.index !== null).map((i) => `${i.collection}:${i.index}`));
            setExcluded(errKeys);
            return data;
        } catch (e) {
            toast.error(formatApiError(e));
            return null;
        }
    };

    const applyEdit = () => {
        try {
            const doc = JSON.parse(editing.text);
            const cols = { ...preview.collections, [editing.collection]: preview.collections[editing.collection].map((d, i) => (i === editing.index ? doc : d)) };
            setPreview({ ...preview, collections: cols });
            setEditing(null);
            validate(cols);
            toast.success("Record aggiornato, dati ricontrollati");
        } catch {
            toast.error("JSON non valido");
        }
    };

    const cleanedCollections = () => {
        const out = {};
        Object.entries(preview.collections).forEach(([k, docs]) => {
            if (!Array.isArray(docs) || !LABELS[k]) return;
            out[k] = docs.filter((_, i) => !excluded.has(`${k}:${i}`));
        });
        return out;
    };
    const fileRef = useRef();

    const exportBackup = async () => {
        setBusy(true);
        try {
            const { data } = await api.get("/backup/export");
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `backup-officina-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success("Backup esportato");
        } catch (e) {
            toast.error(formatApiError(e));
        } finally {
            setBusy(false);
        }
    };

    const onFile = async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        try {
            const json = JSON.parse(await f.text());
            if (!json.collections) throw new Error("File non valido: manca 'collections'");
            setPreview({ name: f.name, exported_at: json.exported_at, collections: json.collections });
            await validate(json.collections);
        } catch (err) {
            toast.error(err.message || "File non valido");
        }
        e.target.value = "";
    };

    const doImport = async () => {
        if (!window.confirm(mode === "replace"
            ? "ATTENZIONE: i dati attuali verranno SOSTITUITI con quelli del backup. Continuare?"
            : "I dati del backup verranno uniti a quelli attuali (sovrascrivendo gli stessi ID). Continuare?")) return;
        setBusy(true);
        try {
            const { data } = await api.post("/backup/import", { collections: cleanedCollections(), mode });
            toast.success(`Backup ripristinato: ${Object.values(data.imported).reduce((a, b) => a + b, 0)} record${excluded.size ? ` (${excluded.size} esclusi)` : ""}`);
            setPreview(null);
            setReview(null);
            setExcluded(new Set());
        } catch (e) {
            toast.error(formatApiError(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-6 max-w-3xl">
            <div>
                <div className="eyebrow mb-2">Impostazioni</div>
                <h1 className="font-display text-4xl font-black tracking-tight">Backup e ripristino</h1>
                <p className="text-muted-foreground mt-2">Esporta tutti i dati in un file JSON e ripristinali quando serve.</p>
            </div>

            <Card>
                <CardContent className="p-6 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
                    <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-md bg-primary/15 border border-primary/30 grid place-items-center shrink-0"><Download className="h-5 w-5 text-primary" /></div>
                        <div>
                            <div className="font-display font-semibold">Esporta backup completo</div>
                            <div className="text-sm text-muted-foreground">Clienti, riparazioni, magazzino, vendite, cassa, ricondizionati, cataloghi e listino.</div>
                        </div>
                    </div>
                    <Button onClick={exportBackup} disabled={busy} data-testid="export-backup-button"><Download className="h-4 w-4 mr-2" /> Scarica JSON</Button>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="p-6 space-y-4">
                    <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-md bg-sky-950 border border-sky-800 grid place-items-center shrink-0"><Upload className="h-5 w-5 text-sky-300" /></div>
                        <div className="flex-1">
                            <div className="font-display font-semibold">Ripristina da backup</div>
                            <div className="text-sm text-muted-foreground">Seleziona un file JSON esportato da questa applicazione.</div>
                        </div>
                        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onFile} data-testid="import-file-input" />
                        <Button variant="outline" onClick={() => fileRef.current.click()} disabled={busy} data-testid="choose-backup-button"><Upload className="h-4 w-4 mr-2" /> Scegli file</Button>
                    </div>

                    {preview && (
                        <div className="rounded-md border border-border bg-black/30 p-4 space-y-3" data-testid="import-preview">
                            <div className="text-sm"><span className="font-mono text-primary">{preview.name}</span>{preview.exported_at && <span className="text-muted-foreground"> · esportato il {formatDateTime(preview.exported_at)}</span>}</div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                                {Object.entries(preview.collections).map(([k, v]) => (
                                    <div key={k} className="flex justify-between border-b border-border/40 py-1"><span className="text-muted-foreground">{LABELS[k] || k}</span><span className="font-mono">{Array.isArray(v) ? v.length : "?"}</span></div>
                                ))}
                            </div>
                            {review && (
                                <div className={`rounded-md border p-3 space-y-2 ${review.errors ? "border-red-800 bg-red-950/30" : review.warnings ? "border-amber-800 bg-amber-950/30" : "border-emerald-800 bg-emerald-950/30"}`} data-testid="backup-review">
                                    <div className="flex items-center gap-2 text-sm font-medium" data-testid="backup-review-summary">
                                        {review.errors ? <AlertTriangle className="h-4 w-4 text-red-400" /> : <ShieldCheck className="h-4 w-4 text-emerald-400" />}
                                        {review.errors === 0 && review.warnings === 0
                                            ? "Nessuna incompatibilità rilevata"
                                            : `${review.errors} errori · ${review.warnings} avvisi — i record con errori sono esclusi dall'importazione, puoi revisionarli`}
                                    </div>
                                    {review.issues.length > 0 && (
                                        <div className="max-h-64 overflow-auto divide-y divide-border/40 text-xs">
                                            {review.issues.map((it, n) => {
                                                const key = `${it.collection}:${it.index}`;
                                                const hasDoc = it.index !== null && it.index !== undefined;
                                                return (
                                                    <div key={n} className="flex items-center gap-2 py-1.5" data-testid={`backup-issue-${n}`}>
                                                        <span className={`px-1.5 rounded ${it.severity === "error" ? "bg-red-900/60 text-red-200" : "bg-amber-900/60 text-amber-200"}`}>{it.severity === "error" ? "errore" : "avviso"}</span>
                                                        <span className="text-muted-foreground shrink-0">{LABELS[it.collection] || it.collection}{hasDoc ? ` #${it.index + 1}` : ""}{it.id ? ` (${it.id.slice(0, 8)})` : ""}</span>
                                                        <span className="flex-1 truncate" title={it.message}>{it.field ? <b>{it.field}: </b> : null}{it.message}</span>
                                                        {hasDoc && (
                                                            <>
                                                                <label className="flex items-center gap-1 cursor-pointer shrink-0">
                                                                    <input type="checkbox" checked={excluded.has(key)} onChange={() => setExcluded((p) => { const n2 = new Set(p); n2.has(key) ? n2.delete(key) : n2.add(key); return n2; })} data-testid={`backup-exclude-${it.collection}-${it.index}`} />
                                                                    escludi
                                                                </label>
                                                                <button className="text-primary hover:underline shrink-0" onClick={() => setEditing({ collection: it.collection, index: it.index, text: JSON.stringify(preview.collections[it.collection][it.index], null, 2) })} data-testid={`backup-edit-${it.collection}-${it.index}`}>
                                                                    modifica
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}
                            <div className="flex flex-wrap gap-2 items-center">
                                <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="radio" checked={mode === "replace"} onChange={() => setMode("replace")} data-testid="mode-replace" /> Sostituisci tutto</label>
                                <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="radio" checked={mode === "merge"} onChange={() => setMode("merge")} data-testid="mode-merge" /> Unisci ai dati attuali</label>
                            </div>
                            {mode === "replace" && (
                                <div className="flex items-center gap-2 text-xs text-amber-300"><AlertTriangle className="h-4 w-4" /> I dati attuali saranno cancellati e sostituiti. Esporta prima un backup di sicurezza.</div>
                            )}
                            <div className="flex gap-2">
                                <Button onClick={doImport} disabled={busy} data-testid="confirm-import-button"><DatabaseBackup className="h-4 w-4 mr-2" /> Ripristina</Button>
                                <Button variant="ghost" onClick={() => { setPreview(null); setReview(null); }}>Annulla</Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
            <Card className="border-red-900/60">
                <CardContent className="p-6 space-y-4">
                    <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-md bg-red-950 border border-red-800 grid place-items-center shrink-0"><Trash2 className="h-5 w-5 text-red-300" /></div>
                        <div>
                            <div className="font-display font-semibold">Cancella tutti i dati</div>
                            <div className="text-sm text-muted-foreground">Elimina clienti, riparazioni, magazzino, vendite, cassa e ricondizionati. Azione irreversibile: esporta prima un backup.</div>
                        </div>
                    </div>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={wipeCatalogs} onChange={(e) => setWipeCatalogs(e.target.checked)} data-testid="wipe-catalogs-checkbox" />
                        Azzera anche i cataloghi (marche/modelli, listino, catalogo ricambi verranno ripristinati ai valori iniziali)
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <Input placeholder='Digita ELIMINA per confermare' value={wipeText} onChange={(e) => setWipeText(e.target.value)} className="sm:max-w-xs" data-testid="wipe-confirm-input" />
                        <Button variant="destructive" onClick={doWipe} disabled={busy || wipeText !== "ELIMINA"} data-testid="wipe-button">
                            <Trash2 className="h-4 w-4 mr-2" /> Cancella tutti i dati
                        </Button>
                    </div>
                </CardContent>
            </Card>
            <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
                <DialogContent className="bg-card border-border max-w-2xl" data-testid="backup-edit-dialog">
                    <DialogHeader><DialogTitle>Revisiona record {editing ? `${LABELS[editing.collection] || editing.collection} #${editing.index + 1}` : ""}</DialogTitle></DialogHeader>
                    <Textarea className="font-mono text-xs min-h-[320px]" value={editing?.text || ""} onChange={(e) => setEditing({ ...editing, text: e.target.value })} data-testid="backup-edit-textarea" />
                    <div className="flex gap-2 justify-end">
                        <Button variant="ghost" onClick={() => setEditing(null)}>Annulla</Button>
                        <Button onClick={applyEdit} data-testid="backup-edit-save">Applica e ricontrolla</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
