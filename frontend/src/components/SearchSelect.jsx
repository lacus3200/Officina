import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown, Plus, Pencil, Trash2 } from "lucide-react";

const sortIt = (a, b) => String(a.label).localeCompare(String(b.label), "it", { numeric: true, sensitivity: "base" });

export function SearchSelect({
    options,
    value,
    onChange,
    placeholder = "Seleziona…",
    searchPlaceholder = "Cerca…",
    emptyLabel = "Nessun risultato.",
    noneLabel,
    testId,
    disabled,
    className = "",
    actions = [],
    sorted = true,
    renderLabel,
    onRename,
    onDelete,
    canEdit = () => true,
}) {
    const [open, setOpen] = useState(false);
    const groups = useMemo(() => {
        const list = sorted ? [...options].sort(sortIt) : options;
        const map = new Map();
        list.forEach((o) => {
            const g = o.group || "";
            if (!map.has(g)) map.set(g, []);
            map.get(g).push(o);
        });
        return [...map.entries()];
    }, [options, sorted]);
    const current = options.find((o) => o.value === value);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    disabled={disabled}
                    className={`w-full justify-between font-normal h-10 ${className}`}
                    data-testid={testId}
                >
                    <span className={`truncate ${current ? "" : "text-muted-foreground"}`}>
                        {current ? (renderLabel ? renderLabel(current) : current.label) : value || placeholder}
                    </span>
                    <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)] min-w-[240px] bg-card border-border" align="start">
                <Command>
                    <CommandInput placeholder={searchPlaceholder} data-testid={testId ? `${testId}-search` : undefined} />
                    <CommandList className="max-h-72">
                        <CommandEmpty>{emptyLabel}</CommandEmpty>
                        {noneLabel && (
                            <CommandGroup>
                                <CommandItem value="__none__" onSelect={() => { onChange("", null); setOpen(false); }} data-testid={testId ? `${testId}-none` : undefined}>
                                    <Check className={`mr-2 h-4 w-4 ${!value ? "opacity-100" : "opacity-0"}`} />
                                    {noneLabel}
                                </CommandItem>
                            </CommandGroup>
                        )}
                        {groups.map(([g, list]) => (
                            <CommandGroup key={g || "_"} heading={g || undefined}>
                                {list.map((o) => (
                                    <CommandItem
                                        key={o.value}
                                        value={`${o.label} ${o.keywords || ""}`}
                                        onSelect={() => { onChange(o.value, o); setOpen(false); }}
                                        data-testid={testId ? `${testId}-opt-${o.value}` : undefined}
                                    >
                                        <Check className={`mr-2 h-4 w-4 shrink-0 ${o.value === value ? "opacity-100" : "opacity-0"}`} />
                                        <span className="truncate flex-1">{renderLabel ? renderLabel(o) : o.label}</span>
                                        {(onRename || onDelete) && canEdit(o) && (
                                            <span className="ml-2 flex items-center gap-1 opacity-40 hover:opacity-100 shrink-0" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                                                {onRename && (
                                                    <button type="button" title="Rinomina" className="p-1 rounded hover:bg-white/10 hover:text-primary" data-testid={testId ? `${testId}-rename-${o.value}` : undefined}
                                                        onClick={(e) => { e.stopPropagation(); const n = window.prompt("Nuovo nome", o.rawLabel ?? o.label); if (n && n.trim() && n.trim() !== (o.rawLabel ?? o.label)) { setOpen(false); onRename(o, n.trim()); } }}>
                                                        <Pencil className="h-3.5 w-3.5" />
                                                    </button>
                                                )}
                                                {onDelete && (
                                                    <button type="button" title="Elimina" className="p-1 rounded hover:bg-white/10 hover:text-red-400" data-testid={testId ? `${testId}-delete-${o.value}` : undefined}
                                                        onClick={(e) => { e.stopPropagation(); if (window.confirm(`Eliminare "${o.rawLabel ?? o.label}" dall'elenco?`)) { setOpen(false); onDelete(o); } }}>
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </button>
                                                )}
                                            </span>
                                        )}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        ))}
                        {actions.length > 0 && (
                            <CommandGroup heading="Altro">
                                {actions.map((a) => (
                                    <CommandItem key={a.label} value={`__action__${a.label}`} onSelect={() => { setOpen(false); a.onSelect(); }} className="text-primary" data-testid={a.testId}>
                                        <Plus className="mr-2 h-4 w-4" /> {a.label}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        )}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
