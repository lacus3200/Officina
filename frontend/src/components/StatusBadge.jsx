import React from "react";

export const StatusBadge = ({ map, value, testId }) => (
    <span
        data-testid={testId}
        className={`inline-block px-2 py-0.5 rounded-md text-xs border whitespace-nowrap ${map[value]?.color || "bg-zinc-800 text-zinc-300 border-zinc-700"}`}
    >
        {map[value]?.label || value}
    </span>
);
