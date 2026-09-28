import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import {
    LayoutDashboard,
    Wrench,
    Users,
    Package,
    ShoppingCart,
    Wallet,
    BarChart3,
    LogOut,
    Menu,
    RefreshCw,
    Settings,
    ListChecks,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const NAV = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true, testId: "nav-dashboard" },
    { to: "/riparazioni", label: "Riparazioni", icon: Wrench, testId: "nav-repairs" },
    { to: "/listino", label: "Listino interventi", icon: ListChecks, testId: "nav-services" },
    { to: "/clienti", label: "Clienti", icon: Users, testId: "nav-customers" },
    { to: "/magazzino", label: "Magazzino", icon: Package, testId: "nav-inventory" },
    { to: "/vendite", label: "Vendite", icon: ShoppingCart, testId: "nav-sales" },
    { to: "/ricondizionati", label: "Ricondizionati", icon: RefreshCw, testId: "nav-refurbished" },
    { to: "/cassa", label: "Cassa", icon: Wallet, testId: "nav-cash" },
    { to: "/report", label: "Report", icon: BarChart3, testId: "nav-reports" },
    { to: "/impostazioni", label: "Backup", icon: Settings, testId: "nav-settings" },
];

function NavItems({ onNavigate }) {
    return (
        <nav className="flex flex-col gap-1 p-3">
            {NAV.map((it) => (
                <NavLink
                    key={it.to}
                    to={it.to}
                    end={it.end}
                    onClick={onNavigate}
                    data-testid={it.testId}
                    className={({ isActive }) =>
                        cn(
                            "group flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                            isActive
                                ? "bg-primary/15 text-primary border border-primary/30"
                                : "text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent",
                        )
                    }
                >
                    <it.icon className="h-4 w-4" />
                    <span>{it.label}</span>
                </NavLink>
            ))}
        </nav>
    );
}

export default function Layout({ children }) {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [open, setOpen] = React.useState(false);

    return (
        <div className="min-h-screen flex">
            {/* Sidebar desktop */}
            <aside className="hidden lg:flex w-64 shrink-0 border-r border-border bg-card/40 flex-col">
                <div className="p-5 border-b border-border">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-md bg-primary flex items-center justify-center">
                            <Wrench className="h-5 w-5 text-primary-foreground" />
                        </div>
                        <div>
                            <div className="font-display font-bold leading-tight">
                                OFFICINA
                            </div>
                            <div className="eyebrow">v1.0</div>
                        </div>
                    </div>
                </div>
                <div className="flex-1 overflow-auto">
                    <NavItems />
                </div>
                <div className="p-3 border-t border-border">
                    <div className="px-3 py-2 mb-2 rounded-md bg-black/30 border border-border">
                        <div className="text-xs text-muted-foreground">
                            Connesso come
                        </div>
                        <div
                            className="text-sm font-medium truncate"
                            data-testid="current-user-email"
                        >
                            {user?.email || "—"}
                        </div>
                    </div>
                    <Button
                        variant="ghost"
                        className="w-full justify-start text-zinc-400 hover:text-white"
                        data-testid="logout-button"
                        onClick={async () => {
                            await logout();
                            navigate("/login");
                        }}
                    >
                        <LogOut className="h-4 w-4 mr-2" /> Esci
                    </Button>
                </div>
            </aside>

            {/* Main */}
            <div className="flex-1 min-w-0 flex flex-col">
                {/* Top bar (mobile) */}
                <header className="lg:hidden sticky top-0 z-40 glass-nav border-b flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-2">
                        <Sheet open={open} onOpenChange={setOpen}>
                            <SheetTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    data-testid="mobile-menu-button"
                                >
                                    <Menu className="h-5 w-5" />
                                </Button>
                            </SheetTrigger>
                            <SheetContent
                                side="left"
                                className="w-72 bg-card border-border p-0 flex flex-col overflow-y-auto"
                            >
                                <div className="p-5 border-b border-border">
                                    <div className="font-display font-bold">
                                        OFFICINA
                                    </div>
                                    <div className="eyebrow">Menu</div>
                                </div>
                                <div className="flex-1 overflow-y-auto">
                                    <NavItems onNavigate={() => setOpen(false)} />
                                </div>
                                <div className="p-3 border-t border-border shrink-0">
                                    <Button
                                        variant="ghost"
                                        className="w-full justify-start"
                                        onClick={async () => {
                                            setOpen(false);
                                            await logout();
                                            navigate("/login");
                                        }}
                                    >
                                        <LogOut className="h-4 w-4 mr-2" /> Esci
                                    </Button>
                                </div>
                            </SheetContent>
                        </Sheet>
                        <span className="font-display font-bold">OFFICINA</span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate max-w-[40%]">
                        {user?.email}
                    </div>
                </header>

                <main className="flex-1 p-4 sm:p-6 lg:p-10">{children}</main>
            </div>
        </div>
    );
}
