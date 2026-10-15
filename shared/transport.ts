// REC1 / REC2 / DEV1 numbering per vehicle, like the transport order template.
// Extra stops (joins_prev) get no number; NOTA rows show their text (e.g. "COME").
export interface LabelRun {
  vehicle_label: string;
  kind: "REC" | "DEV" | "NOTA";
  joins_prev: number;
  notes: string;
  passenger: string;
}

export function runLabels(runs: LabelRun[]): string[] {
  const counters = new Map<string, { REC: number; DEV: number }>();
  return runs.map((r) => {
    const key = r.vehicle_label || "-";
    if (!counters.has(key)) counters.set(key, { REC: 0, DEV: 0 });
    const c = counters.get(key)!;
    if (r.kind === "NOTA") return (r.notes || r.passenger || "").toUpperCase();
    if (r.joins_prev) return "";
    c[r.kind] += 1;
    return `${r.kind}${c[r.kind]}`;
  });
}

/** Keep the flat run list but ordered by vehicle (first appearance), so groups stay contiguous. */
export function groupByVehicle<T extends { vehicle_label: string }>(runs: T[]): { veh: string; items: { r: T; i: number }[] }[] {
  const groups: { veh: string; items: { r: T; i: number }[] }[] = [];
  runs.forEach((r, i) => {
    const veh = r.vehicle_label || "SIN VEHÍCULO";
    let g = groups.find((x) => x.veh === veh);
    if (!g) groups.push((g = { veh, items: [] }));
    g.items.push({ r, i });
  });
  return groups;
}
