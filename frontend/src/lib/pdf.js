import jsPDF from "jspdf";
import { currency, formatDate, REPAIR_STATUS } from "./format";

const brand = { r: 217, g: 119, b: 6 };

function header(doc, title, subtitle) {
    doc.setFillColor(10, 10, 10);
    doc.rect(0, 0, 210, 28, "F");
    doc.setTextColor(brand.r, brand.g, brand.b);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("OFFICINA · Gestionale Laboratorio", 14, 14);
    doc.setTextColor(200, 200, 200);
    doc.setFontSize(9);
    doc.text(subtitle, 14, 21);
    doc.setTextColor(20, 20, 20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text(title, 14, 42);
    doc.setDrawColor(217, 119, 6);
    doc.setLineWidth(0.8);
    doc.line(14, 46, 196, 46);
}

export function printRepairReceipt(repair) {
    const doc = new jsPDF();
    header(doc, `Ricevuta Riparazione ${repair.ticket_number}`, `Data: ${formatDate(repair.created_at)}`);
    let y = 58;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(30, 30, 30);

    const rows = [
        ["Cliente", repair.customer_name || "—"],
        ["Dispositivo", `${repair.device_type} ${repair.device_brand || ""} ${repair.device_model || ""}`.trim()],
        ["Seriale / IMEI", repair.serial_or_imei || "—"],
        ["Problema segnalato", repair.problem || "—"],
        ["Diagnosi", repair.diagnosis || "—"],
        ["Stato", REPAIR_STATUS[repair.status]?.label || repair.status],
        ["Preventivo", currency(repair.estimate)],
        ["Manodopera", currency(repair.labor_cost)],
    ];

    rows.forEach(([k, v]) => {
        doc.setFont("helvetica", "bold");
        doc.text(k, 14, y);
        doc.setFont("helvetica", "normal");
        const lines = doc.splitTextToSize(String(v), 130);
        doc.text(lines, 60, y);
        y += 6 + (lines.length - 1) * 5;
    });

    if (repair.parts_used?.length) {
        y += 4;
        doc.setFont("helvetica", "bold");
        doc.text("Ricambi utilizzati", 14, y);
        y += 5;
        doc.setFont("helvetica", "normal");
        repair.parts_used.forEach((p) => {
            doc.text(`• ${p.part_name} × ${p.quantity}`, 18, y);
            doc.text(currency(p.unit_price * p.quantity), 180, y, { align: "right" });
            y += 6;
        });
    }

    y += 6;
    doc.setDrawColor(217, 119, 6);
    doc.line(14, y, 196, y);
    y += 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Totale", 14, y);
    doc.text(currency(repair.final_price), 196, y, { align: "right" });

    y += 10;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text("Firma cliente ______________________________", 14, y + 20);
    doc.text("Firma tecnico ______________________________", 120, y + 20);

    doc.save(`${repair.ticket_number}.pdf`);
}

export function printSaleInvoice(sale) {
    const doc = new jsPDF();
    header(doc, `Fattura ${sale.invoice_number}`, `Data: ${formatDate(sale.created_at)}`);
    let y = 58;
    doc.setFontSize(11);
    doc.setTextColor(30, 30, 30);
    doc.setFont("helvetica", "bold");
    doc.text("Cliente:", 14, y);
    doc.setFont("helvetica", "normal");
    doc.text(sale.customer_name || "—", 40, y);
    y += 10;

    doc.setFillColor(240, 240, 240);
    doc.rect(14, y - 5, 182, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.text("Descrizione", 16, y);
    doc.text("Qty", 130, y);
    doc.text("Prezzo", 150, y);
    doc.text("Totale", 194, y, { align: "right" });
    y += 8;

    doc.setFont("helvetica", "normal");
    sale.items?.forEach((it) => {
        doc.text(String(it.description), 16, y);
        doc.text(String(it.quantity), 130, y);
        doc.text(currency(it.unit_price), 150, y);
        doc.text(currency(it.quantity * it.unit_price), 194, y, { align: "right" });
        y += 7;
    });

    y += 4;
    doc.setDrawColor(217, 119, 6);
    doc.line(14, y, 196, y);
    y += 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Totale", 14, y);
    doc.text(currency(sale.total), 196, y, { align: "right" });
    y += 8;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Pagamento: ${sale.payment_method}`, 14, y);

    doc.save(`${sale.invoice_number}.pdf`);
}

export function printPartLabel(part) {
    const doc = new jsPDF({ unit: "mm", format: [80, 40] });
    doc.setFillColor(10, 10, 10);
    doc.rect(0, 0, 80, 10, "F");
    doc.setTextColor(217, 119, 6);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("OFFICINA · RICAMBIO", 4, 7);
    doc.setTextColor(20, 20, 20);
    doc.setFontSize(11);
    doc.text(part.name?.slice(0, 40) || "Ricambio", 4, 16);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`SKU: ${part.sku || "—"}`, 4, 22);
    doc.text(`Cond.: ${part.condition}  ·  Stato: ${part.status}`, 4, 27);
    doc.text(`Pos.: ${part.location || "—"}`, 4, 32);
    doc.setFont("helvetica", "bold");
    doc.text(currency(part.sell_price), 76, 32, { align: "right" });
    doc.save(`etichetta-${part.sku || part.id.slice(0, 6)}.pdf`);
}
