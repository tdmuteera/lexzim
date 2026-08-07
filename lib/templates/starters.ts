import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import {
  TEMPLATE_DISCLAIMER,
  TEMPLATE_MERGE_FIELDS,
  mergeFieldToken,
} from "@/lib/templates/fields";

export type StarterTemplateDef = {
  key: string;
  title: string;
  areaOfLaw: "Family" | "Civil" | "Labour";
  description: string;
  fileName: string;
  paragraphs: string[];
};

function p(text: string, opts?: { bold?: boolean; heading?: boolean }): Paragraph {
  if (opts?.heading) {
    return new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text, bold: true })],
    });
  }
  return new Paragraph({
    spacing: { after: 200 },
    children: [new TextRun({ text, bold: opts?.bold })],
  });
}

export const STARTER_TEMPLATE_DEFS: StarterTemplateDef[] = [
  {
    key: "family_letter_of_demand",
    title: "Family — Letter of Demand (placeholder)",
    areaOfLaw: "Family",
    description:
      "Starter letter of demand for family disputes. Replace merge fields and have a practitioner review before use.",
    fileName: "family-letter-of-demand.docx",
    paragraphs: [
      "{{FIRM_NAME}}",
      "{{LAWYER_NAME}}",
      "{{TODAY}}",
      "",
      "To: {{OPPOSING_PARTY}}",
      "",
      "Re: {{MATTER_TITLE}} — File {{FILE_REF}}",
      "",
      "Dear Sir/Madam,",
      "",
      "We act for {{CLIENT_NAME}} of {{CLIENT_ADDRESS}}.",
      "",
      "We hereby demand that you address the outstanding family-law obligations arising in this matter within fourteen (14) days of receipt of this letter, failing which our client reserves all rights to approach the {{COURT_NAME}} (case reference {{CASE_NUMBER}}) for appropriate relief.",
      "",
      "Yours faithfully,",
      "{{LAWYER_NAME}}",
      "{{FIRM_NAME}}",
      "Date: {{DATE}}",
    ],
  },
  {
    key: "civil_letter_of_demand",
    title: "Civil — Letter of Demand (placeholder)",
    areaOfLaw: "Civil",
    description:
      "Starter civil letter of demand with standard LexZim merge fields. Practitioner review required.",
    fileName: "civil-letter-of-demand.docx",
    paragraphs: [
      "{{FIRM_NAME}}",
      "{{LAWYER_NAME}}",
      "{{TODAY}}",
      "",
      "To: {{OPPOSING_PARTY}}",
      "",
      "Re: {{MATTER_TITLE}} — File {{FILE_REF}} / Case {{CASE_NUMBER}}",
      "",
      "Dear Sir/Madam,",
      "",
      "We confirm that we act for {{CLIENT_NAME}}, whose address for service is {{CLIENT_ADDRESS}}.",
      "",
      "Unless the claim is resolved within fourteen (14) days, our instructions are to institute proceedings in the {{COURT_NAME}} without further notice.",
      "",
      "Yours faithfully,",
      "{{LAWYER_NAME}}",
      "{{FIRM_NAME}}",
      "Date: {{DATE}}",
    ],
  },
  {
    key: "labour_notice_of_referral",
    title: "Labour — Notice / complaint letter (placeholder)",
    areaOfLaw: "Labour",
    description:
      "Starter labour complaint / referral letter. Adapt for the competent forum and have counsel review.",
    fileName: "labour-notice-complaint.docx",
    paragraphs: [
      "{{FIRM_NAME}}",
      "{{LAWYER_NAME}}",
      "{{TODAY}}",
      "",
      "To: {{OPPOSING_PARTY}}",
      "Copied for filing: {{COURT_NAME}}",
      "",
      "Re: {{MATTER_TITLE}} — File {{FILE_REF}} / Reference {{CASE_NUMBER}}",
      "",
      "Dear Sir/Madam,",
      "",
      "We act for {{CLIENT_NAME}} of {{CLIENT_ADDRESS}} in connection with a labour dispute.",
      "",
      "Kindly treat this letter as formal notice of our client's complaint and intention to pursue available remedies before {{COURT_NAME}} if the dispute is not resolved expeditiously.",
      "",
      "Yours faithfully,",
      "{{LAWYER_NAME}}",
      "{{FIRM_NAME}}",
      "Date: {{DATE}}",
    ],
  },
];

export async function buildStarterDocxBuffer(def: StarterTemplateDef): Promise<Buffer> {
  const fieldList = TEMPLATE_MERGE_FIELDS.map((f) => mergeFieldToken(f)).join(", ");

  const children: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [
        new TextRun({
          text: "LEXZIM STARTER — NOT FOR UNREVIEWED USE",
          bold: true,
          color: "A85345",
        }),
      ],
    }),
    p(TEMPLATE_DISCLAIMER),
    p(`Supported merge fields: ${fieldList}`),
    p(""),
    p(def.title, { heading: true }),
    ...def.paragraphs.map((line) =>
      line.trim() === ""
        ? new Paragraph({ spacing: { after: 120 }, children: [] })
        : p(line),
    ),
  ];

  const doc = new Document({
    sections: [{ children }],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
