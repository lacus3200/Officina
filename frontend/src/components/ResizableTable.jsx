import React, { useEffect, useRef, useState } from "react";

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

export function ResizableTh({ index, widths, setWidths, className = "", children, testId }) {
    const startX = useRef(0);
    const startW = useRef(0);

    const onMouseDown = (e) => {
        e.preventDefault();
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

    return (
        <th
            style={{ width: widths[index], minWidth: widths[index], maxWidth: widths[index] }}
            className={`relative px-4 py-3 font-medium select-none group/th ${className}`}
            data-testid={testId}
        >
            {children}
            <span
                onMouseDown={onMouseDown}
                onDoubleClick={() => setWidths((prev) => prev.map((x, i) => (i === index ? Math.max(x, 160) : x)))}
                className="absolute top-0 right-0 h-full w-2 cursor-col-resize opacity-0 group-hover/th:opacity-100 hover:opacity-100 transition-opacity"
                data-testid={`${testId}-resizer`}
            >
                <span className="absolute right-0 top-1/4 h-1/2 w-px bg-primary/70" />
            </span>
        </th>
    );
}

export function ScrollTable({ children, widths, testId }) {
    const total = widths.reduce((a, b) => a + b, 0);
    return (
        <div className="overflow-auto max-h-[calc(100vh-280px)] scroll-table" data-testid={testId}>
            <table className="text-sm table-fixed" style={{ width: total, minWidth: "100%" }}>
                {children}
            </table>
        </div>
    );
}
