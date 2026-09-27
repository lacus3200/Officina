import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Wrench, ArrowRight } from "lucide-react";

export default function LoginPage() {
    const { login, error } = useAuth();
    const [email, setEmail] = useState("admin@lab.local");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setLoading(true);
        await login(email, password);
        setLoading(false);
    };

    return (
        <div className="min-h-screen grid lg:grid-cols-2 relative overflow-hidden">
            <div className="hidden lg:block relative">
                <img
                    src="https://images.unsplash.com/photo-1742989667140-c69adadf556b?crop=entropy&cs=srgb&fm=jpg&q=85"
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover opacity-70"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-black via-black/60 to-transparent" />
                <div className="absolute bottom-10 left-10 right-10 z-10">
                    <div className="eyebrow mb-4 text-amber-500">Gestionale · v1.0</div>
                    <h1 className="font-display text-5xl xl:text-6xl font-black text-white tracking-tight leading-[0.95]">
                        Il tuo <span className="text-amber-500">laboratorio</span>,
                        <br />sotto controllo.
                    </h1>
                    <p className="mt-6 text-zinc-300 max-w-md text-base leading-relaxed">
                        Riparazioni, clienti, magazzino ricambi, vendite e
                        cassa: tutto in un'unica officina digitale.
                    </p>
                </div>
            </div>

            <div className="flex items-center justify-center p-6 sm:p-12 relative noise">
                <div className="w-full max-w-md">
                    <div className="flex items-center gap-3 mb-10">
                        <div className="h-11 w-11 rounded-md bg-primary flex items-center justify-center">
                            <Wrench className="h-5 w-5 text-primary-foreground" />
                        </div>
                        <div>
                            <div className="font-display font-bold text-lg leading-tight">
                                OFFICINA
                            </div>
                            <div className="eyebrow">Gestionale Laboratorio</div>
                        </div>
                    </div>

                    <h2 className="font-display text-3xl font-bold mb-2">
                        Accedi al pannello
                    </h2>
                    <p className="text-muted-foreground mb-8 text-sm">
                        Inserisci le tue credenziali per continuare.
                    </p>

                    <Card className="border-border bg-card/60 backdrop-blur">
                        <CardContent className="p-6">
                            <form className="space-y-5" onSubmit={submit}>
                                <div className="space-y-2">
                                    <Label htmlFor="email" className="eyebrow">
                                        Email
                                    </Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        data-testid="login-email-input"
                                        value={email}
                                        onChange={(e) =>
                                            setEmail(e.target.value)
                                        }
                                        placeholder="admin@lab.local"
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label
                                        htmlFor="password"
                                        className="eyebrow"
                                    >
                                        Password
                                    </Label>
                                    <Input
                                        id="password"
                                        type="password"
                                        data-testid="login-password-input"
                                        value={password}
                                        onChange={(e) =>
                                            setPassword(e.target.value)
                                        }
                                        placeholder="••••••••"
                                        required
                                    />
                                </div>
                                {error && (
                                    <div
                                        data-testid="login-error"
                                        className="text-sm text-red-400 border border-red-900/50 bg-red-950/40 px-3 py-2 rounded-md"
                                    >
                                        {error}
                                    </div>
                                )}
                                <Button
                                    type="submit"
                                    data-testid="login-submit-button"
                                    disabled={loading}
                                    className="w-full group"
                                >
                                    {loading ? "Attendere…" : "Entra"}
                                    <ArrowRight className="h-4 w-4 ml-2 transition-transform group-hover:translate-x-1" />
                                </Button>
                            </form>
                        </CardContent>
                    </Card>

                    <div className="mt-6 text-xs text-muted-foreground font-mono">
                        default · admin@lab.local / admin123
                    </div>
                </div>
            </div>
        </div>
    );
}
