import React, { useRef, useState } from "react";
import { api, formatApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Download, Upload, DatabaseBackup, AlertTriangle } from "lucide-react";
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
            const { data } = await api.post("/backup/import", { collections: preview.collections, mode });
            toast.success(`Backup ripristinato: ${Object.values(data.imported).reduce((a, b) => a + b, 0)} record`);
            setPreview(null);
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
                            <div className="flex flex-wrap gap-2 items-center">
                                <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="radio" checked={mode === "replace"} onChange={() => setMode("replace")} data-testid="mode-replace" /> Sostituisci tutto</label>
                                <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="radio" checked={mode === "merge"} onChange={() => setMode("merge")} data-testid="mode-merge" /> Unisci ai dati attuali</label>
                            </div>
                            {mode === "replace" && (
                                <div className="flex items-center gap-2 text-xs text-amber-300"><AlertTriangle className="h-4 w-4" /> I dati attuali saranno cancellati e sostituiti. Esporta prima un backup di sicurezza.</div>
                            )}
                            <div className="flex gap-2">
                                <Button onClick={doImport} disabled={busy} data-testid="confirm-import-button"><DatabaseBackup className="h-4 w-4 mr-2" /> Ripristina</Button>
                                <Button variant="ghost" onClick={() => setPreview(null)}>Annulla</Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
