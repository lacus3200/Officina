import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { currency, formatDate, REFURB_STATUS } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { CustomerSelect } from "@/components/CustomerSelect";
import { SearchSelect } from "@/components/SearchSelect";
import {
    ShoppingBag,
    Wrench,
    Hammer,
    BadgeEuro,
    Plus,
    Trash2,
    Link2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

function Timeline({ item }) {
    const events = [
        {
            icon: ShoppingBag,
            title: "Acquisto",
            sub: `${item.purchase_source || "—"} · ${currency(item.purchase_cost)}`,
            date: item.purchase_date,
        },
        ...(item.repair
            ? [
                  {
                      icon: Wrench,
                      title: `Riparazione ${item.repair.ticket_number}`,
                      sub: `${item.repair.problem} · ricambi ${currency(item.parts_cost)}`,
                      date: null,
                  },
              ]
            : []),
        ...item.refurb_costs.map((c) => ({
            icon: Hammer,
            title: c.description,
            sub: currency(c.amount),
            date: c.date,
            costId: c.id,
        })),
        ...(item.status === "venduto"
            ? [
                  {
                      icon: BadgeEuro,
                      title: "Rivendita",
                      sub: `${currency(item.sale_price)} · margine ${currency(item.margin)}`,
                      date: item.sold_at,
                      accent: true,
                  },
              ]
            : []),
    ];
    return events;
}

export function RefurbDetailDialog({ item, onOpenChange, onChanged }) {
    const [cost, setCost] = useState({ description: "", amount: "" });
    const [sell, setSell] = useState({ sale_price: "", customer_id: "", customer_name: "", payment_method: "contanti", sold_at: new Date().toISOString().slice(0, 10) });
    const [soldEdit, setSoldEdit] = useState(null);
    const [customers, setCustomers] = useState([]);
    const [repairs, setRepairs] = useState([]);
    const [showSell, setShowSell] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        if (!item) return;
        api.get("/customers").then((r) => setCustomers(r.data)).catch(() => {});
        api.get("/repairs").then((r) => setRepairs(r.data)).catch(() => {});
        setSell((s) => ({ ...s, sale_price: item.target_price || "" }));
        setShowSell(false);
    }, [item]);

    if (!item) return null;
    const events = Timeline({ item });

    const run = async (fn, msg) => {
        try {
            await fn();
            toast.success(msg);
            onChanged();
        } catch (e) {
            toast.error(formatApiError(e));
        }
    };

    const addCost = () =>
        run(async () => {
            await api.post(`/refurbished/${item.id}/costs`, {
                description: cost.description,
                amount: Number(cost.amount || 0),
            });
            setCost({ description: "", amount: "" });
        }, "Costo aggiunto");

    const doSell = () =>
        run(
            () =>
                api.post(`/refurbished/${item.id}/sell`, {
                    ...sell,
                    sale_price: Number(sell.sale_price),
                    customer_id: sell.customer_id || null,
                    sold_at: sell.sold_at ? new Date(`${sell.sold_at}T12:00:00`).toISOString() : null,
                }),
            "Dispositivo venduto",
        );

    return (
        <Dialog open={!!item} onOpenChange={onOpenChange}>
            <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="refurb-detail-dialog">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-3">
                        <span className="font-mono text-primary">{item.code}</span>
                        <span>{item.brand} {item.model}</span>
                        <StatusBadge map={REFURB_STATUS} value={item.status} />
                    </DialogTitle>
                </DialogHeader>

                <div className="grid grid-cols-3 gap-3">
                    <Stat label="Costo totale" value={currency(item.total_cost)} testId="refurb-total-cost" />
                    {item.status === "venduto" ? (
                        <Stat label="Margine finale" value={currency(item.margin)} accent={item.margin >= 0 ? "text-emerald-400" : "text-red-400"} testId="refurb-margin" />
                    ) : (
                        <Stat label="Margine previsto" value={currency(item.expected_margin)} accent={item.expected_margin >= 0 ? "text-emerald-400" : "text-red-400"} testId="refurb-expected-margin" />
                    )}
                    <Stat label={item.status === "venduto" ? "Venduto a" : "Prezzo obiettivo"} value={currency(item.status === "venduto" ? item.sale_price : item.target_price)} />
                </div>

                {item.status === "venduto" && (
                    <div className="flex items-center gap-2 text-sm" data-testid="sold-info">
                        <span className="text-muted-foreground">Venduto il</span>
                        {soldEdit ? (
                            <>
                                <Input type="date" className="h-8 w-40" value={soldEdit.sold_at} onChange={(e) => setSoldEdit({ ...soldEdit, sold_at: e.target.value })} data-testid="sold-date-edit-input" />
                                <Input type="number" step="0.01" className="h-8 w-28" value={soldEdit.sale_price} onChange={(e) => setSoldEdit({ ...soldEdit, sale_price: e.target.value })} data-testid="sold-price-edit-input" />
                                <Button size="sm" onClick={() => run(() => api.put(`/refurbished/${item.id}`, { sold_at: new Date(`${soldEdit.sold_at}T12:00:00`).toISOString(), sale_price: Number(soldEdit.sale_price) }).then(() => setSoldEdit(null)), "Vendita aggiornata")} data-testid="sold-edit-save">Salva</Button>
                                <Button size="sm" variant="ghost" onClick={() => setSoldEdit(null)}>Annulla</Button>
                            </>
                        ) : (
                            <button className="font-medium hover:text-primary hover:underline" onClick={() => setSoldEdit({ sold_at: (item.sold_at || "").slice(0, 10), sale_price: item.sale_price })} data-testid="sold-edit-button">
                                {formatDate(item.sold_at)} · {currency(item.sale_price)} (modifica)
                            </button>
                        )}
                    </div>
                )}
                {(item.specs || item.color || item.grade) && (
                    <p className="text-sm text-zinc-300 flex flex-wrap gap-2 items-center">
                        {item.grade && <span className="px-2 py-0.5 rounded-md border border-primary/40 bg-primary/10 text-primary font-mono text-xs" data-testid="refurb-grade">Grado {item.grade}</span>}
                        {item.color && <span className="text-muted-foreground">{item.color}</span>}
                        {item.specs && <span>{item.specs}</span>}
                    </p>
                )}

                <div>
                    <div className="eyebrow mb-3">Storia del dispositivo</div>
                    <ol className="relative border-l border-border ml-3 space-y-4">
                        {events.map((ev, i) => (
                            <li key={i} className="ml-5">
                                <span className={`absolute -left-[13px] mt-0.5 h-6 w-6 rounded-full grid place-items-center border ${ev.accent ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-zinc-400"}`}>
                                    <ev.icon className="h-3 w-3" />
                                </span>
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <div className="text-sm font-medium">{ev.title}</div>
                                        <div className="text-xs text-muted-foreground">{ev.sub}</div>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        {ev.date && formatDate(ev.date)}
                                        {ev.costId && item.status !== "venduto" && (
                                            <button
                                                className="text-red-400 hover:text-red-300"
                                                onClick={() => run(() => api.delete(`/refurbished/${item.id}/costs/${ev.costId}`), "Costo rimosso")}
                                                data-testid={`delete-cost-${ev.costId}`}
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ol>
                </div>

                {item.status !== "venduto" && (
                    <>
                        <div className="border-t border-border pt-4 space-y-3">
                            <div className="flex items-center justify-between gap-2">
                                <div className="eyebrow">Riparazione del dispositivo</div>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    data-testid="open-repair-from-refurb"
                                    onClick={async () => {
                                        try {
                                            const { data } = await api.post(`/refurbished/${item.id}/open-repair`, {});
                                            toast.success(`Ticket ${data.repair.ticket_number} aperto`);
                                            onChanged();
                                            navigate("/riparazioni");
                                        } catch (e) {
                                            toast.error(formatApiError(e));
                                        }
                                    }}
                                >
                                    <Wrench className="h-3.5 w-3.5 mr-1" /> Apri riparazione per {item.code}
                                </Button>
                            </div>
                            <div className="flex gap-2">
                                <SearchSelect
                                    testId="refurb-repair-select"
                                    value={item.repair_id || ""}
                                    placeholder="Nessuna riparazione"
                                    searchPlaceholder="Cerca ticket…"
                                    noneLabel="— nessuna —"
                                    options={repairs.map((r) => ({ value: r.id, label: `${r.ticket_number} · ${r.device_brand || ""} ${r.device_model || ""}`.trim(), keywords: `${r.customer_name || ""} ${r.serial_or_imei || ""}` }))}
                                    onChange={(v) => run(() => api.put(`/refurbished/${item.id}`, { repair_id: v || null }), v ? "Ticket collegato" : "Ticket scollegato")}
                                />
                                <Link2 className="h-4 w-4 mt-3 text-muted-foreground shrink-0" />
                            </div>
                        </div>

                        <div className="border-t border-border pt-4 space-y-2">
                            <div className="eyebrow">Aggiungi costo di ricondizionamento</div>
                            <div className="grid grid-cols-12 gap-2">
                                <Input
                                    className="col-span-7"
                                    placeholder="Es. batteria nuova, pulizia, licenza…"
                                    value={cost.description}
                                    onChange={(e) => setCost({ ...cost, description: e.target.value })}
                                    data-testid="refurb-cost-desc-input"
                                />
                                <Input
                                    className="col-span-3"
                                    type="number"
                                    step="0.01"
                                    placeholder="€"
                                    value={cost.amount}
                                    onChange={(e) => setCost({ ...cost, amount: e.target.value })}
                                    data-testid="refurb-cost-amount-input"
                                />
                                <Button className="col-span-2" variant="outline" onClick={addCost} disabled={!cost.description} data-testid="add-refurb-cost-button">
                                    <Plus className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                        <div className="border-t border-border pt-4 space-y-3">
                            {!showSell ? (
                                <Button className="w-full" onClick={() => setShowSell(true)} data-testid="open-sell-button">
                                    <BadgeEuro className="h-4 w-4 mr-2" /> Registra rivendita
                                </Button>
                            ) : (
                                <div className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-4">
                                    <div className="grid grid-cols-3 gap-3">
                                        <div>
                                            <Label className="eyebrow">Data vendita</Label>
                                            <Input type="date" value={sell.sold_at} onChange={(e) => setSell({ ...sell, sold_at: e.target.value })} data-testid="sell-date-input" />
                                        </div>
                                        <div>
                                            <Label className="eyebrow">Prezzo di vendita €</Label>
                                            <Input type="number" step="0.01" value={sell.sale_price} onChange={(e) => setSell({ ...sell, sale_price: e.target.value })} data-testid="sell-price-input" />
                                        </div>
                                        <div>
                                            <Label className="eyebrow">Pagamento</Label>
                                            <Select value={sell.payment_method} onValueChange={(v) => setSell({ ...sell, payment_method: v })}>
                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="contanti">Contanti</SelectItem>
                                                    <SelectItem value="carta">Carta</SelectItem>
                                                    <SelectItem value="bonifico">Bonifico</SelectItem>
                                                    <SelectItem value="altro">Altro</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <div>
                                        <Label className="eyebrow">Cliente</Label>
                                        <CustomerSelect
                                            customers={customers}
                                            value={sell.customer_id}
                                            testId="sell-customer-select"
                                            noneLabel="— walk-in —"
                                            onCreated={(c, mode) => setCustomers((prev) => (mode === "delete" ? prev.filter((x) => x.id !== c.id) : mode === "update" ? prev.map((x) => (x.id === c.id ? c : x)) : [c, ...prev]))}
                                            onChange={(id, c) => setSell({ ...sell, customer_id: id, customer_name: c?.name || "" })}
                                        />
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-muted-foreground">Margine risultante</span>
                                        <span className={`font-mono font-semibold ${Number(sell.sale_price) - item.total_cost >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                                            {currency(Number(sell.sale_price || 0) - item.total_cost)}
                                        </span>
                                    </div>
                                    <Button className="w-full" onClick={doSell} disabled={!sell.sale_price} data-testid="confirm-sell-button">
                                        Conferma vendita e genera fattura
                                    </Button>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}

function Stat({ label, value, accent, testId }) {
    return (
        <div className="rounded-md border border-border bg-black/30 p-3">
            <div className="eyebrow">{label}</div>
            <div className={`font-mono text-lg font-semibold ${accent || ""}`} data-testid={testId}>{value}</div>
        </div>
    );
}
