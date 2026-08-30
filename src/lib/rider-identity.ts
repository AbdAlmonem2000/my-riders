// Shared rider-identity resolution, used by both the monthly report upload
// and the rider-directory (master sheet) upload.
//
// A rider is identified within one company by an Iqama number and/or a
// separate ID number — either one uniquely points at the same person. So an
// upload that carries only ONE of the two numbers still resolves to the
// existing rider (established earlier by the directory sheet, or the first
// time they appeared in any report) instead of creating a duplicate.

export interface RiderIdentity {
  id: string;
  iqama_number: string | null;
  id_number: string | null;
  rider_name: string | null;
}

export interface RiderIndex {
  byIqama: Map<string, RiderIdentity>;
  byId: Map<string, RiderIdentity>;
}

export function indexRiders(riders: RiderIdentity[]): RiderIndex {
  const byIqama = new Map<string, RiderIdentity>();
  const byId = new Map<string, RiderIdentity>();
  for (const r of riders) {
    if (r.iqama_number) byIqama.set(r.iqama_number, r);
    if (r.id_number) byId.set(r.id_number, r);
  }
  return { byIqama, byId };
}

// A raw value can be typed into either column on any given sheet, so each
// incoming number is checked against both indexes before giving up.
export function matchRider(
  index: RiderIndex,
  iqama: string | null,
  idNumber: string | null,
): RiderIdentity | null {
  const candidates = [
    iqama ? index.byIqama.get(iqama) : undefined,
    idNumber ? index.byId.get(idNumber) : undefined,
    iqama ? index.byId.get(iqama) : undefined,
    idNumber ? index.byIqama.get(idNumber) : undefined,
  ];
  for (const c of candidates) if (c) return c;
  return null;
}

export function cellText(row: Record<string, unknown>, col: string | null): string | null {
  if (!col) return null;
  const v = row[col];
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s || null;
}

// A real Iqama / ID number is short and has no separators. A value full of
// commas/tabs or absurdly long almost always means the uploaded file wasn't
// split into columns (a CSV saved as .xlsx, everything landing in column A) —
// treating each whole line as one rider's ID mints hundreds of junk riders.
export function looksLikeIdentifier(value: string): boolean {
  return value.length <= 40 && !/[,\t;|]/.test(value);
}
