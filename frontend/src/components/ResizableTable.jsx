import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const MIN = 60;

export function useColumnWidths(storageKey, defaults) {
    const [widths, setWidths] = useState(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(`colw:${storageKey}`) || "null");
            return saved && saved.length === defaults.length ? saved : defaults;
        } catch {
            return defaults;
        }
    });
    useEffect(() => {
        localStorage.setItem(`colw:${storageKey}`, JSON.stringify(widths));
    }, [widths, storageKey]);
    const reset = () => setWidths(defaults);
    return [widths, setWidths, reset];
}

const cmp = (a, b) => {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    if (typeof a === "number" && typeof b === "number") return a - b;
    return String(a).localeCompare(String(b), "it", { numeric: true, sensitivity: "base" });
};

export function useTableSort(items, accessors, defaultKey = null, defaultDir = "desc") {
    const [sort, setSort] = useState({ key: defaultKey, dir: defaultDir });
    const toggle = (key) =>
        setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
    const sorted = useMemo(() => {
        if (!sort.key || !accessors[sort.key]) return items;
        const acc = accessors[sort.key];
        const arr = [...items].sort((a, b) => cmp(acc(a), acc(b)));
        return sort.dir === "asc" ? arr : arr.reverse();
    }, [items, sort, accessors]);
    return { sorted, sort, toggle };
}

export function useSelection(items) {
    const [selected, setSelected] = useState(() => new Set());
    useEffect(() => {
        const ids = new Set(items.map((i) => i.id));
        setSelected((prev) => new Set([...prev].filter((id) => ids.has(id))));
    }, [items]);
    const toggle = (id) =>
        setSelected((prev) => {
            const n = new Set(prev);
            n.has(id) ? n.delete(id) : n.add(id);
            return n;
        });
    const allSelected = items.length > 0 && items.every((i) => selected.has(i.id));
    const toggleAll = () => setSelected(allSelected ? new Set() : new Set(items.map((i) => i.id)));
    const clear = () => setSelected(new Set());
    return { selected, toggle, toggleAll, allSelected, clear };
}

export function SelectAllCheckbox({ checked, onChange, testId }) {
    return (
        <input
            type="checkbox"
            className="h-4 w-4 accent-[hsl(var(--primary))] cursor-pointer"
            checked={checked}
            onChange={onChange}
            data-testid={testId}
            aria-label="Seleziona tutti"
        />
    );
}

export function RowCheckbox({ checked, onChange, testId }) {
    return (
        <td className="px-3 py-3 w-10" onClick={(e) => e.stopPropagation()}>
            <input
                type="checkbox"
                className="h-4 w-4 accent-[hsl(var(--primary))] cursor-pointer"
                checked={checked}
                onChange={onChange}
                data-testid={testId}
                aria-label="Seleziona riga"
            />
        </td>
    );
}

export function BulkBar({ count, onDelete, onClear, label = "elementi", busy }) {
    if (!count) return null;
    return (
        <div className="flex items-center gap-3 rounded-md border border-primary/40 bg-primary/10 px-4 py-2 text-sm" data-testid="bulk-bar">
            <span className="font-medium" data-testid="bulk-count">{count} {label} selezionati</span>
            <Button size="sm" variant="destructive" onClick={onDelete} disabled={busy} data-testid="bulk-delete-button">
                <Trash2 className="h-4 w-4 mr-1" /> Elimina selezionati
            </Button>
            <Button size="sm" variant="ghost" onClick={onClear} data-testid="bulk-clear-button">
                <X className="h-4 w-4 mr-1" /> Annulla
            </Button>
        </div>
    );
}

export function ResizableTh({ index, widths, setWidths, className = "", children, testId, sortKey, sort, onSort }) {
    const startX = useRef(0);
    const startW = useRef(0);

    const onMouseDown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        startX.current = e.clientX;
        startW.current = widths[index];
        const move = (ev) => {
            const w = Math.max(MIN, startW.current + ev.clientX - startX.current);
            setWidths((prev) => prev.map((x, i) => (i === index ? w : x)));
        };
        const up = () => {
            window.removeEventListener("mousemove", move);
            window.removeEventListener("mouseup", up);
            document.body.style.cursor = "";
        };
        document.body.style.cursor = "col-resize";
        window.addEventListener("mousemove", move);
        window.addEventListener("mouseup", up);
    };

    const sortable = !!(sortKey && onSort);
    const active = sortable && sort?.key === sortKey;
    const SortIcon = active ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;

    return (
        <th
            style={{ width: widths[index], minWidth: widths[index], maxWidth: widths[index] }}
            className={`relative px-4 py-3 font-medium select-none group/th ${sortable ? "cursor-pointer hover:text-foreground" : ""} ${className}`}
            data-testid={testId}
            onClick={sortable ? () => onSort(sortKey) : undefined}
            aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
        >
            <span className="inline-flex items-center gap-1">
                {children}
                {sortable && <SortIcon className={`h-3 w-3 ${active ? "text-primary" : "opacity-40"}`} data-testid={`${testId}-sort-icon`} />}
            </span>
            <span
                onMouseDown={onMouseDown}
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={() => setWidths((prev) => prev.map((x, i) => (i === index ? Math.max(x, 160) : x)))}
                className="absolute top-0 right-0 h-full w-2 cursor-col-resize opacity-0 group-hover/th:opacity-100 hover:opacity-100 transition-opacity"
                data-testid={`${testId}-resizer`}
            >
                <span className="absolute right-0 top-1/4 h-1/2 w-px bg-primary/70" />
            </span>
        </th>
    );
}

export function ScrollTable({ children, widths, testId, withSelect }) {
    const total = widths.reduce((a, b) => a + b, 0) + (withSelect ? 40 : 0);
    return (
        <div className="overflow-auto max-h-[calc(100vh-280px)] scroll-table" data-testid={testId}>
            <table className="text-sm table-fixed" style={{ width: total, minWidth: "100%" }}>
                {children}
            </table>
        </div>
    );
}

export async function bulkDelete(ids, fn) {
    const results = await Promise.allSettled(ids.map((id) => fn(id)));
    const failed = results.filter((r) => r.status === "rejected").length;
    return { ok: ids.length - failed, failed };
}
