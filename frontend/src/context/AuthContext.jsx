import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, formatApiError } from "@/api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null); // null=loading, false=guest, obj=user
    const [error, setError] = useState("");

    const refresh = useCallback(async () => {
        try {
            const { data } = await api.get("/auth/me");
            setUser(data);
        } catch {
            setUser(false);
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const login = async (email, password) => {
        setError("");
        try {
            const { data } = await api.post("/auth/login", { email, password });
            if (data.token) localStorage.setItem("auth_token", data.token);
            setUser(data);
            return true;
        } catch (e) {
            setError(formatApiError(e));
            return false;
        }
    };

    const logout = async () => {
        try {
            await api.post("/auth/logout");
        } catch {
            // ignore
        }
        localStorage.removeItem("auth_token");
        setUser(false);
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, error, refresh }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
