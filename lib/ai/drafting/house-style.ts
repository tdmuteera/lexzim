/**
 * LexZim AI drafting house style (P10-15).
 * Applies to AI-generated Word exports only (not invoice letterhead).
 */

export const HOUSE_STYLE_FONT = "Trebuchet MS";
export const HOUSE_STYLE_FONT_SIZE_PT = 12;
/** Multiplier for Word line spacing (240 twips = single). */
export const HOUSE_STYLE_LINE_SPACING = 1.5;
export const HOUSE_STYLE_COLOR = "000000";

export type DocxStyleOptions = {
  font: string;
  lineSpacing: number;
  fontSizePt: number;
  color: string;
  justified: boolean;
};

export const DEFAULT_HOUSE_STYLE: DocxStyleOptions = {
  font: HOUSE_STYLE_FONT,
  lineSpacing: HOUSE_STYLE_LINE_SPACING,
  fontSizePt: HOUSE_STYLE_FONT_SIZE_PT,
  color: HOUSE_STYLE_COLOR,
  justified: true,
};

/** Word line spacing value (twips per line when lineRule is AUTO). */
export function houseLineSpacingTwips(lineSpacing: number = HOUSE_STYLE_LINE_SPACING): number {
  return Math.round(lineSpacing * 240);
}

/** Half-points for docx TextRun size. */
export function houseFontSizeHalfPoints(fontSizePt: number = HOUSE_STYLE_FONT_SIZE_PT): number {
  return fontSizePt * 2;
}

export function houseRunOptions(opts?: {
  font?: string;
  fontSizePt?: number;
  color?: string;
  bold?: boolean;
  italics?: boolean;
}): {
  font: string;
  size: number;
  color: string;
  bold?: boolean;
  italics?: boolean;
} {
  const font = opts?.font ?? HOUSE_STYLE_FONT;
  const fontSizePt = opts?.fontSizePt ?? HOUSE_STYLE_FONT_SIZE_PT;
  const color = opts?.color ?? HOUSE_STYLE_COLOR;
  return {
    font,
    size: houseFontSizeHalfPoints(fontSizePt),
    color,
    ...(opts?.bold ? { bold: true } : {}),
    ...(opts?.italics ? { italics: true } : {}),
  };
}

export function houseParagraphSpacing(opts?: {
  lineSpacing?: number;
  after?: number;
}): {
  after: number;
  line: number;
  lineRule: "auto";
} {
  return {
    after: opts?.after ?? 120,
    line: houseLineSpacingTwips(opts?.lineSpacing ?? HOUSE_STYLE_LINE_SPACING),
    lineRule: "auto",
  };
}
