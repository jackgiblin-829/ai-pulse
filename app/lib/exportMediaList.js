import ExcelJS from "exceljs";
import {
  BANNER_BORDERS, BANNER_ROW_HEIGHT, COLORS, FILLS, FONTS, LOGO_SIZE, logoBuffer,
} from "./brand829";

const COLUMNS = [
  { header: "Journalist", key: "name", width: 24 },
  { header: "Outlet", key: "outlet", width: 24 },
  { header: "Domain", key: "domain", width: 24 },
  { header: "DA", key: "da", width: 8 },
  { header: "Beat", key: "beat", width: 20 },
  { header: "Email", key: "email", width: 28 },
  { header: "Citations", key: "citations", width: 11 },
  { header: "Example Articles", key: "examples", width: 60 },
  { header: "Added", key: "added_at", width: 12 },
  { header: "Added by", key: "added_by", width: 24 },
];

/**
 * 829-branded media-list workbook. `rows` come from queries.mediaList().
 * Returns an xlsx Buffer.
 */
export async function buildMediaListWorkbook({ client, rows }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "829 Studios — AI Pulse";
  const ws = wb.addWorksheet("Media List", {
    views: [{ state: "frozen", ySplit: 2 }],
  });
  ws.columns = COLUMNS.map(({ key, width }) => ({ key, width }));

  // Row 1 — periwinkle logo banner across all columns.
  const last = COLUMNS.length;
  ws.mergeCells(1, 1, 1, last);
  ws.getRow(1).height = BANNER_ROW_HEIGHT;
  for (let c = 1; c <= last; c++) {
    const cell = ws.getRow(1).getCell(c);
    cell.fill = FILLS.periwinkle;
    cell.border = c === 1 ? BANNER_BORDERS.first
      : c === last ? BANNER_BORDERS.last
      : BANNER_BORDERS.middle;
  }
  const logoId = wb.addImage({ buffer: await logoBuffer(), extension: "png" });
  ws.addImage(logoId, {
    tl: { col: 0.15, row: 0.2 },
    ext: LOGO_SIZE,
    editAs: "oneCell",
  });

  // Row 2 — indigo header band.
  const header = ws.getRow(2);
  COLUMNS.forEach(({ header: label }, i) => {
    const cell = header.getCell(i + 1);
    cell.value = label;
    cell.font = FONTS.bandTitle;
    cell.fill = FILLS.indigo;
    cell.alignment = { vertical: "middle" };
  });
  header.height = 22;
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: last } };

  // Body rows — paper fill, Onest body, hyperlinked article cells.
  for (const r of rows) {
    const row = ws.addRow({
      name: r.name,
      outlet: r.outlet ?? "",
      domain: r.domain ?? "",
      da: r.da ?? "",
      beat: r.beat ?? "",
      email: r.email ?? "",
      citations: r.citations,
      examples: (r.examples ?? []).join("\n"),
      added_at: r.added_at ?? "",
      added_by: r.added_by ?? "",
    });
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.fill = FILLS.paper;
      cell.font = FONTS.body;
      cell.alignment = { vertical: "top", wrapText: col === 8 };
    });
    const domainCell = row.getCell(3);
    if (r.domain) {
      domainCell.value = { text: r.domain, hyperlink: `https://${r.domain}` };
      domainCell.font = FONTS.link;
    }
    const examples = r.examples ?? [];
    if (examples.length) {
      const cell = row.getCell(8);
      if (examples.length === 1) {
        cell.value = { text: examples[0], hyperlink: examples[0] };
      }
      cell.font = FONTS.link;
    }
    if (examples.length > 1) row.height = 12 * examples.length + 4;
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
