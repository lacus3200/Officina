import React, { useEffect, useState } from "react";
import { api } from "@/api/client";
import { Card, CardContent } from "@/components/ui/card";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid,
    PieChart,
    Pie,
    Cell,
    Legend,
} from "recharts";
import { currency } from "@/lib/format";

export default function ReportsPage() {
    const [data, setData] = useState(null);
    const [sales, setSales] = useState([]);
    const [repairs, setRepairs] = useState([]);

    useEffect(() => {
        (async () => {
            const [d, s, r] = await Promise.all([
                api.get("/reports/dashboard"),
                api.get("/sales"),
                api.get("/repairs"),
            ]);
            setData(d.data);
            setSales(s.data);
            setRepairs(r.data);
        })();
    }, []);

    if (!data) return <div className="text-muted-foreground">Caricamento…</div>;

    const statusData = Object.entries(
        repairs.reduce((acc, r) => {
            acc[r.status] = (acc[r.status] || 0) + 1;
            return acc;
        }, {}),
    ).map(([name, value]) => ({ name, value }));

    const COLORS = ["#d97706", "#ea580c", "#10b981", "#0ea5e9", "#ef4444"];

    const salesMargin = sales.slice(0, 20).map((s) => ({
        name: s.invoice_number,
        totale: s.total,
        margine: s.margin,
    }));

    return (
        <div className="space-y-6">
            <div>
                <div className="eyebrow mb-2">Analytics</div>
                <h1 className="font-display text-4xl font-black tracking-tight">
                    Report economici
                </h1>
                <p className="text-muted-foreground mt-2">
                    Analisi delle performance del laboratorio.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                    <CardContent className="p-5">
                        <div className="eyebrow">Fatturato mese</div>
                        <div className="kpi-value text-3xl mt-3 text-primary">
                            {currency(data.month.entrate)}
                        </div>
                        <div className="text-xs text-muted-foreground mt-2">
                            Netto {currency(data.month.netto)}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-5">
                        <div className="eyebrow">Valore magazzino</div>
                        <div className="kpi-value text-3xl mt-3">
                            {currency(data.inventory_value)}
                        </div>
                        <div className="text-xs text-muted-foreground mt-2">
                            {data.low_stock_count} sotto scorta
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-5">
                        <div className="eyebrow">Clienti totali</div>
                        <div className="kpi-value text-3xl mt-3">
                            {data.total_customers}
                        </div>
                        <div className="text-xs text-muted-foreground mt-2">
                            {data.open_repairs} riparazioni aperte
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Card className="lg:col-span-2">
                    <CardContent className="p-5">
                        <div className="eyebrow mb-1">Ultime vendite</div>
                        <div className="font-display text-xl font-bold mb-4">
                            Totale vs Margine
                        </div>
                        <div className="h-72">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={salesMargin}>
                                    <CartesianGrid stroke="#262626" vertical={false} />
                                    <XAxis dataKey="name" stroke="#666" tick={{ fill: "#a3a3a3", fontSize: 11 }} />
                                    <YAxis stroke="#666" tick={{ fill: "#a3a3a3", fontSize: 11 }} />
                                    <Tooltip
                                        contentStyle={{
                                            background: "#0a0a0a",
                                            border: "1px solid #262626",
                                            borderRadius: 8,
                                        }}
                                    />
                                    <Legend wrapperStyle={{ color: "#a3a3a3" }} />
                                    <Bar dataKey="totale" fill="#d97706" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="margine" fill="#10b981" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-5">
                        <div className="eyebrow mb-1">Ripartizione</div>
                        <div className="font-display text-xl font-bold mb-4">
                            Riparazioni per stato
                        </div>
                        <div className="h-72">
                            {statusData.length === 0 ? (
                                <div className="text-center text-muted-foreground pt-16">
                                    Nessun dato disponibile.
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={statusData}
                                            dataKey="value"
                                            nameKey="name"
                                            innerRadius={50}
                                            outerRadius={90}
                                            paddingAngle={3}
                                        >
                                            {statusData.map((_, i) => (
                                                <Cell
                                                    key={i}
                                                    fill={COLORS[i % COLORS.length]}
                                                />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            contentStyle={{
                                                background: "#0a0a0a",
                                                border: "1px solid #262626",
                                                borderRadius: 8,
                                            }}
                                        />
                                        <Legend wrapperStyle={{ color: "#a3a3a3", fontSize: 11 }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
