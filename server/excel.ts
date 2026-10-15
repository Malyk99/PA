import ExcelJS from "exceljs";
import { runLabels } from "../shared/transport.js";

// ---------------------------------------------------------------------------
// Import a cast/contacts directory from an Excel file.
// Works with the "ACTORES" tab used in transport orders (ACRÓNIMO | NOMBRE | DIRECCIÓN)
// and with any sheet that has a header row mentioning code/name/address/phone.

export interface ImportedContact {
  code: string;
  name: string;
  address: string;
  phone: string;
  grp: string;
}

const H = {
  code: /^(acr|c[oó]d|n[ºo°]|num|id\b|ref)/i,
  name: /^(nom|name|persona|actor|personaje)/i,
  address: /^(dir|address|domic|recog)/i,
  phone: /^(tel|tlf|m[oó]v|phone|cel)/i,
  grp: /^(grupo|tipo|dept|depto|categor)/i,
};

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "object") {
    if ("result" in v && (v as any).result != null) return String((v as any).result).trim();
    if ("richText" in v) return (v as any).richText.map((r: any) => r.text).join("").trim();
    if ("text" in v) return String((v as any).text).trim();
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return "";
  }
  return String(v).trim();
}

export async function importContacts(buffer: Buffer): Promise<{ contacts: ImportedContact[]; sheet: string }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  // prefer a sheet called ACTORES / REPARTO / CONTACTOS
  const sheets = [...wb.worksheets].sort((a, b) => score(b.name) - score(a.name));
  for (const ws of sheets) {
    const found = scanSheet(ws);
    if (found.length) return { contacts: found, sheet: ws.name };
  }
  return { contacts: [], sheet: "" };
}

function score(name: string) {
  return /actor|reparto|contact|cast|directorio/i.test(name) ? 1 : 0;
}

function scanSheet(ws: ExcelJS.Worksheet): ImportedContact[] {
  let header = -1;
  let cols: Partial<Record<keyof typeof H, number>> = {};
  const maxScan = Math.min(ws.rowCount, 30);
  for (let r = 1; r <= maxScan && header < 0; r++) {
    const row = ws.getRow(r);
    const found: Partial<Record<keyof typeof H, number>> = {};
    row.eachCell({ includeEmpty: false }, (cell, c) => {
      const t = cellText(cell.value);
      for (const k of Object.keys(H) as (keyof typeof H)[]) if (found[k] == null && H[k].test(t)) found[k] = c;
    });
    if (found.code != null && found.name != null) {
      header = r;
      cols = found;
    }
  }
  if (header < 0) return [];
  const out: ImportedContact[] = [];
  for (let r = header + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (k: keyof typeof H) => (cols[k] != null ? cellText(row.getCell(cols[k]!).value) : "");
    const code = get("code");
    let name = get("name");
    if (!code && !name) continue;
    if (H.code.test(code) && H.name.test(name)) continue; // repeated header
    const address = get("address");
    let phone = get("phone");
    // phone numbers are often written inside the name: "JESUS FONT (670 260 541)".
    // Move a bare "(number)" into the phone field; keep "(Javier 699…)" as written,
    // since it names a different contact person.
    if (!phone) {
      const bare = /\s*\(\s*(\+?\d[\d\s]{7,}\d)\s*\)\s*$/.exec(name);
      if (bare) {
        phone = bare[1].trim();
        name = name.slice(0, bare.index).trim();
      }
    }
    out.push({ code, name, address, phone, grp: get("grp") || guessGroup(code) });
  }
  return out;
}

function guessGroup(code: string) {
  if (/^\d{1,3}$/.test(code)) return "Reparto";
  if (/^\d{4,}$/.test(code)) return "Figuración";
  return "Otro";
}

// ---------------------------------------------------------------------------
// Export the transport order as .xlsx, mirroring the template layout (columns B–H).

interface RunRow {
  vehicle_label: string;
  kind: "REC" | "DEV" | "NOTA";
  time: string;
  code: string;
  passenger: string;
  passenger_phone: string;
  origin: string;
  arrival: string;
  destination: string;
  notes: string;
  joins_prev: number;
}

export interface TransportDoc {
  production: string;
  title: string;
  number: string;
  dateLabel: string;
  hours: string;
  chapter: string;
  contacts: string;
  setName: string;
  mapsUrl: string;
  runs: RunRow[];
}

export async function transportXlsx(doc: TransportDoc): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "PA Assistant";
  const ws = wb.addWorksheet("ORDEN", {
    pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
    views: [{ showGridLines: false }],
  });
  ws.columns = [
    { width: 2 }, // A
    { width: 11 }, // B label
    { width: 9 }, // C h.rec
    { width: 9 }, // D depto/code
    { width: 42 }, // E persona
    { width: 40 }, // F dirección
    { width: 10 }, // G llegada
    { width: 40 }, // H destino
  ];
  const thin = { style: "thin" as const, color: { argb: "FF999999" } };
  const box = { top: thin, left: thin, bottom: thin, right: thin };
  const dark: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF16150F" } };
  const orange: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFF6A1A" } };

  // header block
  ws.mergeCells("B2:H2");
  Object.assign(ws.getCell("B2"), { value: doc.production.toUpperCase() });
  ws.getCell("B2").font = { bold: true, size: 16 };
  ws.getCell("B2").alignment = { horizontal: "center" };

  ws.mergeCells("B4:E7");
  const t = ws.getCell("B4");
  t.value = doc.title;
  t.font = { bold: true, size: 14 };
  t.alignment = { vertical: "middle", horizontal: "left", wrapText: true };

  const meta: [string, string][] = [
    ["ORDEN DE TRANSPORTE:", doc.number],
    ["FECHA:", doc.dateLabel],
    ["HORARIO RODAJE:", doc.hours],
    ["CAPÍTULO:", doc.chapter],
  ];
  meta.forEach(([k, v], i) => {
    const r = 4 + i;
    ws.mergeCells(`F${r}:G${r}`);
    ws.getCell(`F${r}`).value = k;
    ws.getCell(`F${r}`).font = { bold: true, size: 10, color: { argb: "FF555555" } };
    ws.getCell(`F${r}`).alignment = { horizontal: "right" };
    ws.getCell(`H${r}`).value = v;
    ws.getCell(`H${r}`).font = { bold: true, size: 11 };
  });

  let row = 9;
  const infoRow = (label: string, value: string, link?: string) => {
    ws.getCell(`B${row}`).value = label;
    ws.mergeCells(`B${row}:D${row}`);
    ws.getCell(`B${row}`).fill = dark;
    ws.getCell(`B${row}`).font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    if (link) {
      ws.mergeCells(`E${row}:F${row}`);
      ws.getCell(`E${row}`).value = value;
      ws.mergeCells(`G${row}:H${row}`);
      ws.getCell(`G${row}`).value = { text: link, hyperlink: link };
      ws.getCell(`G${row}`).font = { color: { argb: "FF2C5E9E" }, underline: true };
    } else {
      ws.mergeCells(`E${row}:H${row}`);
      ws.getCell(`E${row}`).value = value;
    }
    ws.getCell(`E${row}`).font = { bold: true };
    for (const c of ["B", "E", "G"]) ws.getCell(`${c}${row}`).border = box;
    row++;
  };
  infoRow("PRODUCCIÓN", doc.contacts);
  infoRow("OFICINA / PLATÓ", doc.setName, doc.mapsUrl || undefined);
  row++;

  // vehicles
  const labels = runLabels(doc.runs);
  const groups: { veh: string; items: { r: RunRow; label: string }[] }[] = [];
  doc.runs.forEach((r, i) => {
    const veh = r.vehicle_label || "SIN VEHÍCULO";
    let g = groups.find((x) => x.veh === veh);
    if (!g) groups.push((g = { veh, items: [] }));
    g.items.push({ r, label: labels[i] });
  });

  for (const g of groups) {
    ws.mergeCells(`B${row}:H${row}`);
    const h = ws.getCell(`B${row}`);
    h.value = g.veh.toUpperCase();
    h.fill = orange;
    h.font = { bold: true, size: 12 };
    h.alignment = { horizontal: "center" };
    row++;
    const heads = ["", "H. REC", "DEPTO.", "PERSONA", "DIRECCIÓN", "LLEGADA", "DESTINO"];
    heads.forEach((txt, i) => {
      const c = ws.getRow(row).getCell(2 + i);
      c.value = txt;
      c.font = { bold: true, size: 9, color: { argb: "FFFFFFFF" } };
      c.fill = dark;
      c.alignment = { horizontal: "center" };
    });
    row++;
    for (const { r, label } of g.items) {
      const rr = ws.getRow(row);
      if (r.kind === "NOTA") {
        rr.getCell(2).value = label;
        rr.getCell(2).font = { bold: true, italic: true, color: { argb: "FFB77700" } };
        ws.mergeCells(`C${row}:H${row}`);
        if (r.time) rr.getCell(3).value = r.time;
      } else {
        const person = r.passenger + (r.passenger_phone ? ` (${r.passenger_phone})` : "");
        const vals = [label, r.time, r.code, person, r.origin, r.arrival, r.destination];
        vals.forEach((v, i) => {
          const c = rr.getCell(2 + i);
          c.value = v;
          c.border = box;
          c.alignment = { vertical: "middle", wrapText: true, horizontal: i <= 2 || i === 5 ? "center" : "left" };
        });
        rr.getCell(2).font = { bold: true };
        rr.getCell(5).font = { bold: true };
      }
      rr.height = 30;
      row++;
    }
    row++;
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}
