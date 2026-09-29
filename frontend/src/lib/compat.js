export const isCompatible = (p, brand, model) => {
    if (!brand || !p.compatible_models?.length) return false;
    const b = brand.toLowerCase();
    const full = `${brand} ${model || ""}`.trim().toLowerCase();
    return p.compatible_models.some((m) => {
        const ml = m.toLowerCase();
        if (ml.startsWith(b) && ml.includes("tutti i modelli")) return true;
        if (!model) return ml.startsWith(b + " ") || ml === b;
        return ml === full;
    });
};
