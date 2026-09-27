import React, { useEffect, useState } from "react";
import { api } from "@/api/client";
import { Card, CardContent } from "@/components/ui/card";
import { currency, formatDateTime, REPAIR_STATUS } from "@/lib/format";
import {
    Wrench,
    Package,
    Users,
    TrendingUp,
    ArrowUpRight,
    ArrowDownRight,
    AlertTriangle,
} from "lucide-react";
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
} from "recharts";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const Kpi = ({ label, value, icon: Icon, tint = "amber", testId, sub }) => (
    <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
    >
        <Card className="relative overflow-hidden">
            <CardContent className="p-5">
                <div className="flex items-start justify-between">
                    <div className="eyebrow">{label}</div>
                    <div
                        className={`h-8 w-8 rounded-md grid place-items-center bg-${tint}-500/10 text-${tint}-400`}
                    >
                        <Icon className="h-4 w-4" />
                    </div>
                </div>
                <div
                    className="kpi-value text-3xl mt-4"
                    data-testid={testId}
                >
                    {value}
                </div>
                {sub && (
                    <div className="text-xs text-muted-foreground mt-2">
                        {sub}
                    </div>
                )}
                <div
                    className={`absolute -bottom-8 -right-8 h-24 w-24 rounded-full bg-${tint}-500/5 blur-2xl`}
                />
            </CardContent>
        </Card>
    </motion.div>
);

export default function DashboardPage() {
    const [data, setData] = useState(null);
    const [repairs, setRepairs] = useState([]);

    useEffect(() => {
        (async () => {
            const [d, r] = await Promise.all([
                api.get("/reports/dashboard"),
                api.get("/repairs"),
            ]);
            setData(d.data);
            setRepairs(r.data.slice(0, 6));
        })();
    }, []);

    if (!data) {
        return (
            <div className="animate-pulse text-muted-foreground">
                Caricamento…
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                    <div className="eyebrow mb-2">Panoramica</div>
                    <h1 className="font-display text-4xl sm:text-5xl font-black tracking-tight">
                        Ciao, <span className="text-primary">Titolare</span>.
                    </h1>
                    <p className="text-muted-foreground mt-2">
                        Ecco cosa succede in laboratorio oggi.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Link to="/riparazioni">
                        <Button data-testid="quick-new-repair-button">
                            <Wrench className="h-4 w-4 mr-2" /> Nuova riparazione
                        </Button>
                    </Link>
                    <Link to="/vendite">
                        <Button variant="outline" data-testid="quick-new-sale-button">
                            <TrendingUp className="h-4 w-4 mr-2" /> Nuova vendita
                        </Button>
                    </Link>
                </div>
            </div>

            {/* KPI grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Kpi
                    label="Incasso oggi"
                    testId="kpi-today-income"
                    value={currency(data.today.entrate)}
                    sub={`Netto ${currency(data.today.netto)}`}
                    icon={ArrowUpRight}
                    tint="emerald"
                />
                <Kpi
                    label="Incasso mese"
                    testId="kpi-month-income"
                    value={currency(data.month.entrate)}
                    sub={`Uscite ${currency(data.month.uscite)}`}
                    icon={TrendingUp}
                    tint="amber"
                />
                <Kpi
                    label="Riparazioni aperte"
                    testId="kpi-open-repairs"
                    value={data.open_repairs}
                    sub={`Completate: ${data.completed_repairs}`}
                    icon={Wrench}
                    tint="sky"
                />
                <Kpi
                    label="Valore magazzino"
                    testId="kpi-inventory-value"
                    value={currency(data.inventory_value)}
                    sub={`${data.low_stock_count} sotto scorta`}
                    icon={Package}
                    tint="orange"
                />
            </div>

            {/* Chart + Lists */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Card className="lg:col-span-2">
                    <CardContent className="p-5">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <div className="eyebrow">Andamento 14 giorni</div>
                                <div className="font-display text-xl font-bold">
                                    Entrate vs Uscite
                                </div>
                            </div>
                            <Badge
                                variant="outline"
                                className="border-amber-800 text-amber-400"
                            >
                                EUR
                            </Badge>
                        </div>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart
                                    data={data.daily_series}
                                    margin={{ left: -10, right: 0, top: 5, bottom: 0 }}
                                >
                                    <defs>
                                        <linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#d97706" stopOpacity={0.5} />
                                            <stop offset="100%" stopColor="#d97706" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#ef4444" stopOpacity={0.35} />
                                            <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid stroke="#262626" vertical={false} />
                                    <XAxis dataKey="date" stroke="#666" tick={{ fill: "#a3a3a3", fontSize: 11 }} />
                                    <YAxis stroke="#666" tick={{ fill: "#a3a3a3", fontSize: 11 }} />
                                    <Tooltip
                                        contentStyle={{
                                            background: "#0a0a0a",
                                            border: "1px solid #262626",
                                            borderRadius: 8,
                                        }}
                                        labelStyle={{ color: "#a3a3a3" }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="entrate"
                                        stroke="#d97706"
                                        strokeWidth={2}
                                        fill="url(#gIn)"
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="uscite"
                                        stroke="#ef4444"
                                        strokeWidth={2}
                                        fill="url(#gOut)"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-5">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <div className="eyebrow">Attenzione</div>
                                <div className="font-display text-xl font-bold">
                                    Sotto scorta
                                </div>
                            </div>
                            <AlertTriangle className="h-5 w-5 text-amber-500" />
                        </div>
                        {data.low_stock_items.length === 0 ? (
                            <div className="text-sm text-muted-foreground py-8 text-center">
                                Nessun ricambio sotto la soglia minima.
                            </div>
                        ) : (
                            <ul className="space-y-2">
                                {data.low_stock_items.map((p) => (
                                    <li
                                        key={p.id}
                                        className="flex items-center justify-between border border-border rounded-md px-3 py-2 bg-black/30"
                                    >
                                        <div className="min-w-0">
                                            <div className="text-sm font-medium truncate">
                                                {p.name}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {p.category || "—"}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-sm font-mono text-amber-400">
                                                {p.quantity}
                                            </div>
                                            <div className="text-[10px] text-muted-foreground">
                                                min {p.min_quantity}
                                            </div>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Recent repairs */}
            <Card>
                <CardContent className="p-0">
                    <div className="flex items-center justify-between p-5 border-b border-border">
                        <div>
                            <div className="eyebrow">Recenti</div>
                            <div className="font-display text-xl font-bold">
                                Ultime riparazioni
                            </div>
                        </div>
                        <Link
                            to="/riparazioni"
                            className="text-sm text-primary hover:underline"
                        >
                            Vedi tutte →
                        </Link>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-muted-foreground border-b border-border">
                                    <th className="px-5 py-3 font-medium">Ticket</th>
                                    <th className="px-5 py-3 font-medium">Cliente</th>
                                    <th className="px-5 py-3 font-medium">Dispositivo</th>
                                    <th className="px-5 py-3 font-medium">Stato</th>
                                    <th className="px-5 py-3 font-medium text-right">Prezzo</th>
                                    <th className="px-5 py-3 font-medium text-right">Aperto il</th>
                                </tr>
                            </thead>
                            <tbody>
                                {repairs.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="text-center py-10 text-muted-foreground">
                                            Nessuna riparazione ancora.
                                        </td>
                                    </tr>
                                )}
                                {repairs.map((r) => (
                                    <tr
                                        key={r.id}
                                        className="border-b border-border/50 hover:bg-white/5"
                                    >
                                        <td className="px-5 py-3 font-mono text-primary">
                                            {r.ticket_number}
                                        </td>
                                        <td className="px-5 py-3">{r.customer_name || "—"}</td>
                                        <td className="px-5 py-3 text-muted-foreground">
                                            {r.device_type}{" "}
                                            {r.device_brand || ""}
                                        </td>
                                        <td className="px-5 py-3">
                                            <span
                                                className={`inline-block px-2 py-0.5 rounded-md text-xs border ${REPAIR_STATUS[r.status]?.color}`}
                                            >
                                                {REPAIR_STATUS[r.status]?.label}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 text-right font-mono">
                                            {currency(r.final_price || r.estimate)}
                                        </td>
                                        <td className="px-5 py-3 text-right text-muted-foreground text-xs">
                                            {formatDateTime(r.created_at)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
