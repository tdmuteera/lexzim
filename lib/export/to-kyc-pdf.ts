import "server-only";

import PDFDocument from "pdfkit";
import {
  clientTypeLabel,
  normalizeClientType,
  SOURCE_OF_FUNDS_OPTIONS,
  KYC_STATUS_OPTIONS,
  type UboRow,
  type KycDocumentsChecklist,
} from "@/lib/clients/kyc-types";
import type { FirmExportBranding } from "@/lib/export/types";

const MARGIN = 48;

export type KycPdfClient = {
  clientNumber: string;
  clientType: string;
  displayName: string;
  firstName?: string | null;
  surname?: string | null;
  otherNames?: string | null;
  maidenName?: string | null;
  dateOfBirth?: string | null;
  nationality?: string | null;
  idNumber?: string | null;
  registeredName?: string | null;
  tradingName?: string | null;
  regTaxNumber?: string | null;
  taxNumber?: string | null;
  incorporationDate?: string | null;
  incorporationCountry?: string | null;
  registeredAddress?: string | null;
  businessAddress?: string | null;
  industry?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  altPhone?: string | null;
  residentialAddress?: string | null;
  postalAddress?: string | null;
  occupation?: string | null;
  employer?: string | null;
  pepStatus?: boolean;
  pepDetails?: string | null;
  uboJson?: UboRow[];
  matterScopePurpose?: string | null;
  sourceOfFunds?: string | null;
  sourceOfFundsOther?: string | null;
  kycDocumentsJson?: KycDocumentsChecklist | Record<string, unknown>;
  declarationSignedAt?: string | null;
  declarationSignatory?: string | null;
  kycStatus?: string | null;
  kycNotes?: string | null;
};

function dash(value: string | null | undefined): string {
  const t = value?.trim();
  return t ? t : "—";
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 10);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function sourceLabel(code: string | null | undefined, other?: string | null): string {
  if (!code) return dash(other);
  const found = SOURCE_OF_FUNDS_OPTIONS.find((o) => o.value === code);
  if (code === "other") return dash(other) !== "—" ? `Other: ${other}` : "Other";
  return found?.label ?? code;
}

function statusLabel(code: string | null | undefined): string {
  if (!code) return "—";
  return KYC_STATUS_OPTIONS.find((o) => o.value === code)?.label ?? code;
}

function drawField(
  doc: PDFKit.PDFDocument,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
): number {
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#555555").text(label, x, y, {
    width,
    lineBreak: false,
  });
  const labelBottom = y + 10;
  doc.font("Helvetica").fontSize(10).fillColor("#000000").text(value, x, labelBottom, {
    width,
  });
  return Math.max(doc.y, labelBottom + 12) + 6;
}

function ensureSpace(doc: PDFKit.PDFDocument, y: number, need: number): number {
  if (y + need > doc.page.height - MARGIN) {
    doc.addPage();
    return MARGIN;
  }
  return y;
}

function sectionTitle(doc: PDFKit.PDFDocument, title: string, y: number, pageWidth: number): number {
  y = ensureSpace(doc, y, 28);
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#000000").text(title, MARGIN, y, {
    width: pageWidth,
  });
  y = doc.y + 2;
  doc
    .moveTo(MARGIN, y)
    .lineTo(MARGIN + pageWidth, y)
    .strokeColor("#cccccc")
    .lineWidth(0.5)
    .stroke();
  doc.strokeColor("#000000");
  return y + 8;
}

/** Client KYC intake PDF (pdfkit), matching wizard sections. */
export async function exportKycPdf(
  branding: FirmExportBranding,
  client: KycPdfClient,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: MARGIN });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width - MARGIN * 2;
    const colW = (pageWidth - 16) / 2;
    const rightX = MARGIN + colW + 16;
    let y = MARGIN;

    doc.font("Helvetica-Bold").fontSize(14).text(branding.firmName, MARGIN, y, {
      width: pageWidth * 0.65,
    });
    doc.font("Helvetica-Bold").fontSize(14).text("KYC FORM", MARGIN, y, {
      width: pageWidth,
      align: "right",
    });
    y = Math.max(doc.y, y + 16) + 4;

    doc.font("Helvetica").fontSize(8).fillColor("#444444");
    for (const line of branding.addressLines) {
      doc.text(line, MARGIN, y, { width: pageWidth * 0.65 });
      y = doc.y;
    }
    if (branding.contactEmail) {
      doc.text(branding.contactEmail, MARGIN, y);
      y = doc.y;
    }
    if (branding.contactPhone) {
      doc.text(branding.contactPhone, MARGIN, y);
      y = doc.y;
    }
    doc.fillColor("#000000");
    y += 10;

    doc.font("Helvetica-Bold").fontSize(12).text(client.displayName, MARGIN, y, {
      width: pageWidth,
    });
    y = doc.y + 2;
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#333333")
      .text(
        `${client.clientNumber} · ${clientTypeLabel(client.clientType)} · KYC ${statusLabel(client.kycStatus)}`,
        MARGIN,
        y,
        { width: pageWidth },
      );
    doc.fillColor("#000000");
    y = doc.y + 14;

    const type = normalizeClientType(client.clientType);
    const isIndividual = type === "individual";

    y = sectionTitle(doc, isIndividual ? "Individual details" : "Entity details", y, pageWidth);

    if (isIndividual) {
      let leftY = y;
      let rightY = y;
      leftY = drawField(doc, "First name", dash(client.firstName), MARGIN, leftY, colW);
      rightY = drawField(doc, "Surname", dash(client.surname), rightX, rightY, colW);
      leftY = drawField(doc, "Other names", dash(client.otherNames), MARGIN, leftY, colW);
      rightY = drawField(doc, "Maiden name", dash(client.maidenName), rightX, rightY, colW);
      leftY = drawField(doc, "Date of birth", formatDate(client.dateOfBirth), MARGIN, leftY, colW);
      rightY = drawField(doc, "Nationality", dash(client.nationality), rightX, rightY, colW);
      leftY = drawField(doc, "ID number", dash(client.idNumber), MARGIN, leftY, colW);
      rightY = drawField(doc, "Occupation", dash(client.occupation), rightX, rightY, colW);
      leftY = drawField(doc, "Employer", dash(client.employer), MARGIN, leftY, colW);
      y = Math.max(leftY, rightY);
    } else {
      let leftY = y;
      let rightY = y;
      leftY = drawField(doc, "Registered name", dash(client.registeredName), MARGIN, leftY, colW);
      rightY = drawField(doc, "Trading name", dash(client.tradingName), rightX, rightY, colW);
      leftY = drawField(
        doc,
        "Reg / tax number",
        dash(client.regTaxNumber || client.taxNumber),
        MARGIN,
        leftY,
        colW,
      );
      rightY = drawField(doc, "Industry", dash(client.industry), rightX, rightY, colW);
      leftY = drawField(
        doc,
        "Incorporation date",
        formatDate(client.incorporationDate),
        MARGIN,
        leftY,
        colW,
      );
      rightY = drawField(
        doc,
        "Incorporation country",
        dash(client.incorporationCountry),
        rightX,
        rightY,
        colW,
      );
      y = Math.max(leftY, rightY);
      y = drawField(doc, "Registered address", dash(client.registeredAddress), MARGIN, y, pageWidth);
      y = drawField(doc, "Business address", dash(client.businessAddress), MARGIN, y, pageWidth);
    }

    y = sectionTitle(doc, "Contact", y, pageWidth);
    {
      let leftY = y;
      let rightY = y;
      leftY = drawField(doc, "Email", dash(client.email), MARGIN, leftY, colW);
      rightY = drawField(doc, "Phone", dash(client.phone), rightX, rightY, colW);
      leftY = drawField(doc, "WhatsApp", dash(client.whatsapp), MARGIN, leftY, colW);
      rightY = drawField(doc, "Alt phone", dash(client.altPhone), rightX, rightY, colW);
      y = Math.max(leftY, rightY);
      if (isIndividual) {
        y = drawField(
          doc,
          "Residential address",
          dash(client.residentialAddress),
          MARGIN,
          y,
          pageWidth,
        );
        y = drawField(doc, "Postal address", dash(client.postalAddress), MARGIN, y, pageWidth);
      }
    }

    y = sectionTitle(doc, "Matter and funds", y, pageWidth);
    y = drawField(doc, "Purpose / scope", dash(client.matterScopePurpose), MARGIN, y, pageWidth);
    y = drawField(
      doc,
      "Source of funds",
      sourceLabel(client.sourceOfFunds, client.sourceOfFundsOther),
      MARGIN,
      y,
      pageWidth,
    );
    y = drawField(
      doc,
      "PEP",
      client.pepStatus ? dash(client.pepDetails) || "Yes" : "No",
      MARGIN,
      y,
      pageWidth,
    );

    const ubos = client.uboJson ?? [];
    if (!isIndividual || ubos.length > 0) {
      y = sectionTitle(doc, "Ultimate beneficial owners", y, pageWidth);
      if (!ubos.length) {
        y = drawField(doc, "UBOs", "None recorded", MARGIN, y, pageWidth);
      } else {
        for (const ubo of ubos) {
          y = ensureSpace(doc, y, 48);
          const line = [
            ubo.fullName,
            ubo.nationality ? `Nationality: ${ubo.nationality}` : null,
            ubo.controlPct != null ? `Control: ${ubo.controlPct}%` : null,
            ubo.dob ? `DOB: ${formatDate(ubo.dob)}` : null,
          ]
            .filter(Boolean)
            .join(" · ");
          y = drawField(doc, "UBO", line || "—", MARGIN, y, pageWidth);
          if (ubo.address) {
            y = drawField(doc, "Address", ubo.address, MARGIN, y, pageWidth);
          }
        }
      }
    }

    y = sectionTitle(doc, "Documents checklist", y, pageWidth);
    const docs = (client.kycDocumentsJson ?? {}) as KycDocumentsChecklist;
    const checks: Array<[string, boolean | undefined]> = [
      ["ID document", docs.idDocument],
      ["Proof of address", docs.proofOfAddress],
      ["Company registration", docs.companyRegistration],
      ["Tax clearance", docs.taxClearance],
      ["Trust deed", docs.trustDeed],
    ];
    for (const [label, on] of checks) {
      y = drawField(doc, label, on ? "Yes" : "No", MARGIN, y, pageWidth);
    }
    if (docs.otherNotes) {
      y = drawField(doc, "Other notes", docs.otherNotes, MARGIN, y, pageWidth);
    }

    y = sectionTitle(doc, "Declaration", y, pageWidth);
    {
      let leftY = y;
      let rightY = y;
      leftY = drawField(doc, "Signatory", dash(client.declarationSignatory), MARGIN, leftY, colW);
      rightY = drawField(
        doc,
        "Signed",
        formatDate(client.declarationSignedAt),
        rightX,
        rightY,
        colW,
      );
      y = Math.max(leftY, rightY);
    }
    y = drawField(doc, "Internal KYC notes", dash(client.kycNotes), MARGIN, y, pageWidth);

    y = ensureSpace(doc, y, 40);
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#777777")
      .text(branding.footerNote, MARGIN, doc.page.height - MARGIN + 8, {
        width: pageWidth,
        align: "center",
      });

    doc.end();
  });
}
