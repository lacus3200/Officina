import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import RepairsPage from "@/pages/RepairsPage";
import CustomersPage from "@/pages/CustomersPage";
import InventoryPage from "@/pages/InventoryPage";
import SalesPage from "@/pages/SalesPage";
import CashPage from "@/pages/CashPage";
import ReportsPage from "@/pages/ReportsPage";
import RefurbishedPage from "@/pages/RefurbishedPage";
import ServicesPage from "@/pages/ServicesPage";
import SettingsPage from "@/pages/SettingsPage";
import Layout from "@/components/Layout";
import { Toaster } from "@/components/ui/sonner";

function Protected({ children }) {
    const { user } = useAuth();
    if (user === null) {
        return (
            <div className="min-h-screen grid place-items-center text-muted-foreground">
                Caricamento…
            </div>
        );
    }
    if (!user) return <Navigate to="/login" replace />;
    return <Layout>{children}</Layout>;
}

function GuestOnly({ children }) {
    const { user } = useAuth();
    if (user) return <Navigate to="/" replace />;
    return children;
}

function AppRoutes() {
    return (
        <Routes>
            <Route
                path="/login"
                element={
                    <GuestOnly>
                        <LoginPage />
                    </GuestOnly>
                }
            />
            <Route
                path="/"
                element={
                    <Protected>
                        <DashboardPage />
                    </Protected>
                }
            />
            <Route
                path="/riparazioni"
                element={
                    <Protected>
                        <RepairsPage />
                    </Protected>
                }
            />
            <Route
                path="/clienti"
                element={
                    <Protected>
                        <CustomersPage />
                    </Protected>
                }
            />
            <Route
                path="/magazzino"
                element={
                    <Protected>
                        <InventoryPage />
                    </Protected>
                }
            />
            <Route
                path="/vendite"
                element={
                    <Protected>
                        <SalesPage />
                    </Protected>
                }
            />
            <Route
                path="/cassa"
                element={
                    <Protected>
                        <CashPage />
                    </Protected>
                }
            />
            <Route
                path="/report"
                element={
                    <Protected>
                        <ReportsPage />
                    </Protected>
                }
            />
            <Route
                path="/ricondizionati"
                element={
                    <Protected>
                        <RefurbishedPage />
                    </Protected>
                }
            />
            <Route
                path="/listino"
                element={
                    <Protected>
                        <ServicesPage />
                    </Protected>
                }
            />
            <Route
                path="/impostazioni"
                element={
                    <Protected>
                        <SettingsPage />
                    </Protected>
                }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}

export default function App() {
    return (
        <div className="App">
            <BrowserRouter>
                <AuthProvider>
                    <AppRoutes />
                    <Toaster
                        position="top-right"
                        theme="dark"
                        toastOptions={{
                            classNames: {
                                toast: "!bg-card !border !border-border !text-foreground",
                            },
                        }}
                    />
                </AuthProvider>
            </BrowserRouter>
        </div>
    );
}
