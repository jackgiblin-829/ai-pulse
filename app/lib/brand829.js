/**
 * 829 deliverable design tokens.
 *
 * Ported from the approved 829 workbook kit (internal-link-optimizer-bulk
 * lib/brand.js) — fills/fonts from its xl/styles.xml, the logo its own
 * xl/media/image1.png. Nothing here is an approximation of the brand;
 * it *is* the brand as shipped. Single source of the look: change a
 * colour here and the export follows.
 */
import { readFile } from "fs/promises";
import { join } from "path";

/** ARGB strings, in the form ExcelJS wants them. */
export const COLORS = {
  /** Deep 829 indigo. Band/header fill; always carries white bold type. */
  indigo: "FF342A5B",
  /** Periwinkle grey. Logo-banner fill. */
  periwinkle: "FFCACAE0",
  /** Near-white lavender. Body cell fill. */
  paper: "FFF1F1F7",
  white: "FFFFFFFF",
  /** Classic hyperlink blue, as used for URL cells. */
  linkBlue: "FF0000FF",
  ink: "FF000000",
};

/** The brand typeface. The source workbook sets Onest on every styled cell. */
export const FONT_FAMILY = "Onest";

export const FONTS = {
  /** White bold 12 — text sitting on an indigo band. */
  bandTitle: { name: FONT_FAMILY, size: 12, bold: true, color: { argb: COLORS.white } },
  /** Bold 12 black — row labels. */
  label: { name: FONT_FAMILY, size: 12, bold: true, color: { argb: COLORS.ink } },
  /** Regular 9 — all prose cells. */
  body: { name: FONT_FAMILY, size: 9, color: { argb: COLORS.ink } },
  /** Underlined blue 9 — URL cells. */
  link: { name: FONT_FAMILY, size: 9, underline: true, color: { argb: COLORS.linkBlue } },
};

export const FILLS = {
  indigo: { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.indigo } },
  periwinkle: { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.periwinkle } },
  paper: { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.paper } },
};

/**
 * The banner row's border treatment: medium white on the outer edges, a
 * thin black rule underneath. Left/right edges only on the first and last
 * banner column.
 */
export const BANNER_BORDERS = {
  first: {
    left: { style: "medium", color: { argb: COLORS.white } },
    top: { style: "medium", color: { argb: COLORS.white } },
    bottom: { style: "thin", color: { argb: COLORS.ink } },
  },
  middle: {
    top: { style: "medium", color: { argb: COLORS.white } },
    bottom: { style: "thin", color: { argb: COLORS.ink } },
  },
  last: {
    right: { style: "medium", color: { argb: COLORS.white } },
    top: { style: "medium", color: { argb: COLORS.white } },
    bottom: { style: "thin", color: { argb: COLORS.ink } },
  },
};

export const BANNER_ROW_HEIGHT = 69.75;
/** Logo draw size lifted from the source workbook's summary tab. */
export const LOGO_SIZE = { width: 101, height: 57 };

let logoCache = null;

/**
 * The 829 logo as a Buffer, read once per process. Lifted verbatim from
 * the approved workbook so the mark is pixel-identical to what clients
 * have already signed off on.
 */
export async function logoBuffer() {
  if (!logoCache) {
    logoCache = await readFile(join(process.cwd(), "assets", "829-logo.png"));
  }
  return logoCache;
}
