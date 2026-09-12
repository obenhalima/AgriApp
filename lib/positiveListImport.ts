import * as XLSX from "xlsx";

export type PositiveListRow = {
  source_page?: number;
  source_row: number;
  section: string;
  target_label: string;
  commercial_name: string;
  active_substances: string;
  risk_class: string;
  phi_days: number | null;
  dose_text: string;
  treatment_mode: string;
  min_interval_text: string;
  supplier_name: string;
  eu_uk_mrl_text: string;
  swiss_mrl_text: string;
  max_repetitions: number | null;
  resistance_group: string;
};
export type PositiveListPreview = {
  document_code: string;
  version: string;
  document_date: string;
  validated_at: string;
  validated_by_label: string;
  rows: PositiveListRow[];
  warnings: string[];
};
const clean = (v: any) =>
  String(v ?? "")
    .replace(/\s+/g, " ")
    .trim();
const plausibleTarget = (value: string) => {
  const target = clean(value);
  if (target.length < 2 || target.length > 160) return false;
  if (/^(?:n\.?a\.?|n\/a|non applicable)$/i.test(target)) return false;
  if (/^[\d.,% /-]+$/.test(target)) return false;
  if (/préventif|preventif|apparition|premières attaques|premieres attaques|application|pulvérisation|pulverisation|traitement/i.test(target)) return false;
  if (/(?:^|\W)(?:ml|cl|dl|l|g|kg)\s*\/?\s*(?:ha|hl|100\s*l|1000\s*m2)(?:$|\W)/i.test(target)) return false;
  return true;
};
const find = (row: any, names: string[]) => {
  const key = Object.keys(row).find((k) =>
    names.some((n) => clean(k).toLowerCase().includes(n)),
  );
  return key ? clean(row[key]) : "";
};
const numberOrNull = (v: string) => {
  const n = Number(
    v
      .replace(",", ".")
      .match(/\d+(?:[.,]\d+)?/)?.[0]
      ?.replace(",", "."),
  );
  return Number.isFinite(n) ? n : null;
};

export async function parsePositiveList(
  file: File,
): Promise<PositiveListPreview> {
  if (/\.pdf$/i.test(file.name) || file.type === "application/pdf")
    return parsePdf(file);
  const workbook = XLSX.read(await file.arrayBuffer(), {
    type: "array",
    cellDates: true,
  });
  const rows: PositiveListRow[] = [];
  let section = "";
  let ignoredWithoutTarget = 0;
  workbook.SheetNames.forEach((sheetName) => {
    let currentTarget = "";
    const raw = XLSX.utils.sheet_to_json<any>(workbook.Sheets[sheetName], {
      defval: "",
    });
    raw.forEach((r, index) => {
      const commercial = find(r, ["nom commercial", "produit"]);
      const heading = Object.values(r).map(clean).join(" ");
      if (/insecticide/i.test(heading)) section = "Insecticides";
      if (/fongicide/i.test(heading)) section = "Fongicides";
      if (/nématicide|nematicide/i.test(heading)) section = "Nématicides";
      if (!commercial) return;
      const target = find(r, ["cible"]);
      if (target && !plausibleTarget(target)) {
        ignoredWithoutTarget++;
        return;
      }
      if (target) currentTarget = target;
      if (!currentTarget) {
        ignoredWithoutTarget++;
        return;
      }
      rows.push({
        source_row: index + 2,
        section,
        target_label: currentTarget,
        commercial_name: commercial,
        active_substances: find(r, ["matière active", "matiere active"]),
        risk_class: find(r, ["classe"]),
        phi_days: numberOrNull(find(r, ["dar"])),
        dose_text: find(r, ["dose"]),
        treatment_mode: find(r, ["mode"]),
        min_interval_text: find(r, ["intervalle"]),
        supplier_name: find(r, ["fournisseur"]),
        eu_uk_mrl_text: find(r, ["lmr ue", "ue /uk", "ue/uk"]),
        swiss_mrl_text: find(r, ["lmr suisse"]),
        max_repetitions: numberOrNull(find(r, ["répétition", "repetition"])),
        resistance_group: find(r, ["groupe"]),
      });
    });
  });
  return {
    document_code: "",
    version: "",
    document_date: "",
    validated_at: "",
    validated_by_label: "",
    rows,
    warnings: [
      ...(!rows.length ? ["Aucune ligne reconnue. Vérifiez les en-têtes du fichier Excel/CSV."] : []),
      ...(ignoredWithoutTarget ? [`${ignoredWithoutTarget} ligne(s) ignorée(s), car aucune cible n’a pu être déterminée.`] : []),
    ],
  };
}

async function parsePdf(file: File): Promise<PositiveListPreview> {
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  }).promise;
  let text = "";
  const rows: PositiveListRow[] = [];
  let section = "";
  let currentTarget = "";
  let ignoredWithoutTarget = 0;
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    const items = (content.items as any[]).filter((i) => i.str);
    text += " " + items.map((i) => i.str).join(" ");
    const lines = new Map<number, any[]>();
    for (const item of items) {
      const y = Math.round(item.transform[5]);
      const key =
        Array.from(lines.keys()).find((k) => Math.abs(k - y) <= 2) ?? y;
      (lines.get(key) ?? (lines.set(key, []), lines.get(key)!)).push(item);
    }
    for (const [y, lineItems] of Array.from(lines.entries()).sort(
      (a, b) => b[0] - a[0],
    )) {
      const cells = lineItems.sort((a, b) => a.transform[4] - b.transform[4]);
      const at = (min: number, max: number) =>
        clean(
          cells
            .filter((i) => i.transform[4] >= min && i.transform[4] < max)
            .map((i) => i.str)
            .join(" "),
        );
      const target = at(15, 75),
        commercial = at(75, 205),
        active = at(205, 360),
        risk = at(360, 390),
        dar = at(390, 415),
        dose = at(415, 465);
      const whole = clean(cells.map((i) => i.str).join(" "));
      if (/SECTION 1/i.test(whole)) section = "Insecticides";
      if (/SECTION 2/i.test(whole)) section = "Fongicides";
      if (/SECTION 3/i.test(whole)) section = "Nématicides";
      const invalidTarget = Boolean(target && !/cible/i.test(target) && !plausibleTarget(target));
      if (target && !/cible/i.test(target) && plausibleTarget(target)) currentTarget = target;
      if (
        !commercial ||
        /nom commercial|liste positive|section/i.test(commercial) ||
        !/^(V|O|R\*?|R)$/i.test(risk)
      )
        continue;
      if (invalidTarget || !currentTarget) {
        ignoredWithoutTarget++;
        continue;
      }
      rows.push({
        source_page: pageNo,
        source_row: Math.round(y),
        section,
        target_label: currentTarget,
        commercial_name: commercial,
        active_substances: active,
        risk_class: risk,
        phi_days: numberOrNull(dar),
        dose_text: dose,
        treatment_mode: at(465, 520),
        min_interval_text: at(520, 585),
        supplier_name: at(585, 650),
        eu_uk_mrl_text: at(650, 715),
        swiss_mrl_text: at(715, 760),
        max_repetitions: numberOrNull(at(760, 800)),
        resistance_group: at(800, 850),
      });
    }
  }
  const version = text.match(/Version\s*:?\s*(\d+)/i)?.[1] || "";
  const code = text.match(/Code\s*:?\s*([A-Z0-9-]+)/i)?.[1] || "";
  const date = text.match(/Date\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i)?.[1] || "";
  return {
    document_code: code,
    version,
    document_date: date.split("/").reverse().join("-"),
    validated_at: "",
    validated_by_label: "",
    rows,
    warnings: [
      "Import PDF assisté : contrôlez les lignes extraites avant validation. Le fichier Excel source reste préférable.",
      ...(ignoredWithoutTarget ? [`${ignoredWithoutTarget} ligne(s) produit ignorée(s), car leur cible n’a pas été reconnue.`] : []),
    ],
  };
}
