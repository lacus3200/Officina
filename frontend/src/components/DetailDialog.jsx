import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function DetailDialog({ open, onOpenChange, title, subtitle, rows = [], children, testId = "row-detail-dialog" }) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto" data-testid={testId}>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-3 flex-wrap">
                        {title}
                        {subtitle && <span className="text-sm text-muted-foreground font-normal">{subtitle}</span>}
                    </DialogTitle>
                </DialogHeader>
                <div>
                    {rows.filter((r) => r && r.value !== undefined && r.value !== null && r.value !== "").map((r) => (
                        <div key={r.label} className="flex justify-between gap-4 py-1.5 border-b border-border/50 text-sm" data-testid={`detail-row-${r.label}`}>
                            <span className="text-muted-foreground shrink-0">{r.label}</span>
                            <span className="text-right break-words">{r.value}</span>
                        </div>
                    ))}
                </div>
                {children}
            </DialogContent>
        </Dialog>
    );
}
