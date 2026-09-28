import axios from "axios";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API_BASE = `${BACKEND_URL}/api`;

export const api = axios.create({
    baseURL: API_BASE,
    withCredentials: true,
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem("auth_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

api.interceptors.response.use((res) => {
    const w = res?.data?.warnings;
    if (Array.isArray(w) && w.length) {
        w.forEach((msg) => toast.warning("Dati collegati non aggiornati", { description: msg, duration: 8000 }));
    }
    return res;
});

export function formatApiError(err) {
    const detail = err?.response?.data?.detail;
    if (!detail) return err?.message || "Errore imprevisto";
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail))
        return detail.map((e) => e?.msg || JSON.stringify(e)).join(" · ");
    return String(detail);
}
