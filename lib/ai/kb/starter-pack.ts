/**
 * LexZim Zimbabwe starter knowledge pack (P2-04).
 *
 * DEMO / STARTER QUALITY ONLY.
 * Short educational excerpts and structural summaries for RAG plumbing tests.
 * Not a substitute for ZimLII, Veritas, or official gazetted text.
 * Always verify against the cited primary source before relying on any answer.
 */

export const STARTER_PACK_VERSION = "lexzim-starter-pack-v3";

export type StarterChunkDef = {
  headingPath: string;
  text: string;
};

export type StarterSourceDef = {
  key: string;
  title: string;
  sourceType: "constitution" | "statute" | "rules" | "commentary" | "other";
  citationLabel: string;
  publisher: string;
  sourceUrl: string;
  licenseNote: string;
  effectiveDate: string;
  chunks: StarterChunkDef[];
};

export const STARTER_KB_SOURCES: StarterSourceDef[] = [
  {
    key: "constitution_2013_excerpts",
    title: "Constitution of Zimbabwe (2013) — starter excerpts",
    sourceType: "constitution",
    citationLabel: "Constitution of Zimbabwe, 2013 (as amended) — starter pack",
    publisher: "Government of Zimbabwe / Veritas / ZimLII (attribution)",
    sourceUrl: "https://www.veritaszim.net/search/node/Constitution%20of%20Zimbabwe",
    licenseNote:
      "Starter educational excerpts only. Confirm against the official Constitution text (Veritas / ZimLII / Government Printer).",
    effectiveDate: "2013",
    chunks: [
      {
        headingPath: "Chapter 4 / Declaration of Rights — overview",
        text: "The Constitution of Zimbabwe (2013) includes a Declaration of Rights. Starter note: fundamental rights and freedoms are entrenched and must be respected, protected, promoted and fulfilled by the State and all persons and institutions as provided in the Constitution. Always cite the specific section when advising. Quality: starter_demo.",
      },
      {
        headingPath: "Supremacy of the Constitution",
        text: "Starter note: the Constitution is the supreme law of Zimbabwe. Any law, custom, conduct or practice inconsistent with it is invalid to the extent of the inconsistency. Courts must interpret legislation consistently with the Constitution where reasonably possible. Verify exact wording in the official text before court use.",
      },
      {
        headingPath: "Judiciary — high-level",
        text: "Starter note: judicial authority is vested in the courts. The judiciary is independent and subject only to the Constitution and the law. Hierarchy and jurisdiction details are found in the Constitution and court-specific statutes/rules. Do not invent case names in answers.",
      },
    ],
  },
  {
    key: "labour_act_excerpts",
    title: "Labour Act [Chapter 28:01] — starter excerpts",
    sourceType: "statute",
    citationLabel: "Labour Act [Chapter 28:01] — starter pack",
    publisher: "Government of Zimbabwe / ZimLII (attribution)",
    sourceUrl: "https://zimlii.org/search?q=Labour%20Act%20Chapter%2028%3A01",
    licenseNote:
      "Structural starter summary only. Confirm current consolidated Act on ZimLII or official publication.",
    effectiveDate: "Chapter 28:01 (check amendments)",
    chunks: [
      {
        headingPath: "Unfair labour practice / dismissal — orientation",
        text: "Starter note (Zimbabwe labour): disputes about unfair dismissal and unfair labour practices are commonly processed through labour dispute resolution channels provided under the Labour Act framework (including designated officers/tribunals as amended). Procedure, timelines, and remedies are statute-specific. Always check the current Act and regulations. Quality: starter_demo.",
      },
      {
        headingPath: "Contracts and termination — caution",
        text: "Starter note: written contracts, notice, severance, and summary dismissal rules depend on the Labour Act provisions in force and any applicable codes/collective bargaining agreements. Do not invent notice periods; quote the Act section after retrieval of current text.",
      },
    ],
  },
  {
    key: "criminal_law_code_excerpts",
    title: "Criminal Law (Codification and Reform) Act — starter excerpts",
    sourceType: "statute",
    citationLabel: "Criminal Law (Codification and Reform) Act [Chapter 9:23] — starter pack",
    publisher: "Government of Zimbabwe / ZimLII (attribution)",
    sourceUrl:
      "https://zimlii.org/search?q=Criminal%20Law%20Codification%20and%20Reform%20Act%20Chapter%209%3A23",
    licenseNote:
      "Orientation excerpts only. Elements of offences must be taken from the Code sections as currently in force.",
    effectiveDate: "Chapter 9:23 (check amendments)",
    chunks: [
      {
        headingPath: "Code structure — orientation",
        text: "Starter note: Zimbabwe's principal criminal offences are largely set out in the Criminal Law (Codification and Reform) Act [Chapter 9:23]. Answers about elements of crime, defences, and penalties must cite Code sections after retrieving authoritative text. Never invent offence numbers. Quality: starter_demo.",
      },
      {
        headingPath: "Incest — s.75 (verify current text)",
        text: "Starter note (Criminal Law Code): incest is expressly addressed in the Criminal Law (Codification and Reform) Act [Chapter 9:23]. Consolidated texts and professional sources commonly identify s.75 as the incest offence (sexual intercourse within prohibited degrees of relationship). Do NOT say the Code does not explicitly address incest, or that incest is only prosecuted under generic sexual-offence labels, without checking s.75 and related provisions. Confirm the exact elements, degrees of relationship, and penalties in the current Code text on ZimLII or Veritas before advising. Quality: starter_demo. Verify section numbering against the consolidated Act.",
      },
      {
        headingPath: "General principles — caution",
        text: "Starter note: general principles (e.g. intention, negligence, parties to offences, and selected defences) are defined in the Code. Procedural matters often sit in the Criminal Procedure and Evidence Act and court practice. Separate substantive law from procedure when answering. Absence of a retrieved excerpt is not proof that an offence is absent from the Code.",
      },
    ],
  },
  {
    key: "cobea_excerpts",
    title: "Companies and Other Business Entities Act (COBEA) — starter excerpts",
    sourceType: "statute",
    citationLabel: "Companies and Other Business Entities Act [Chapter 24:31] — starter pack",
    publisher: "Government of Zimbabwe / ZimLII (attribution)",
    sourceUrl:
      "https://zimlii.org/search?q=Companies%20and%20Other%20Business%20Entities%20Act%20Chapter%2024%3A31%20section%20195%20ordinarily%20resident",
    licenseNote:
      "Starter orientation only. Confirm incorporation, directors' duties, and filing rules in the current COBEA text.",
    effectiveDate: "Chapter 24:31 (check amendments)",
    chunks: [
      {
        headingPath: "Company formation — orientation",
        text: "Starter note (COBEA): Zimbabwe company law for private and public companies, and other business entities, is primarily governed by the Companies and Other Business Entities Act [Chapter 24:31]. Incorporation, constitutional documents, and names are regulated. Always verify current filing requirements with the Companies Registry / official Act. Quality: starter_demo.",
      },
      {
        headingPath: "Resident director — s.195 (mandatory)",
        text: "Starter note (COBEA s.195): Under the Companies and Other Business Entities Act [Chapter 24:31], section 195 requires that at least one director of a company incorporated in Zimbabwe be ordinarily resident in Zimbabwe. This is a statutory requirement, not optional common practice or mere banking preference. Do NOT tell users that COBEA is silent on local or resident directors, or that a Zimbabwe-incorporated company may freely run with no Zimbabwe-resident director. Ordinarily resident is not the same as citizenship: a non-citizen who is ordinarily resident can satisfy the rule; a citizen who is not ordinarily resident does not. Confirm exact wording, any exemptions, and current registry practice on ZimLII, Veritas, or the Companies Registry before court use. Quality: starter_demo.",
      },
      {
        headingPath: "Company secretary residency — s.198",
        text: "Starter note (COBEA s.198): Related residency rules apply to company secretaries. Professional guides commonly cite a requirement that at least one company secretary be ordinarily resident in Zimbabwe (verify s.198 and current text). Do not collapse secretary residency into practice only. Quality: starter_demo.",
      },
      {
        headingPath: "Foreign companies — principal officer (Part IV)",
        text: "Starter note (COBEA Part IV / around s.241 area): A foreign company operating in Zimbabwe is a different entity type from a Zimbabwe-incorporated company. Foreign companies are commonly required to have a resident principal officer in Zimbabwe (verify the exact Part IV / s.241-area provision in the current Act). When a user asks about a local company, disambiguate: Zimbabwe-incorporated company (s.195 resident director) versus foreign company carrying on business locally (resident principal officer). Quality: starter_demo.",
      },
      {
        headingPath: "Directors and governance — caution",
        text: "Starter note (COBEA): Directors' duties, meetings, shares, and remedies for members are COBEA topics. Banking and operational preference for a local contact person is separate from, and secondary to, the s.195 statutory residency rule. Never characterize s.195 as merely advisable practice. Do not transplant UK, SA, or US company-law defaults as Zimbabwe authority. Quality: starter_demo.",
      },
    ],
  },
  {
    key: "marriages_act_excerpts",
    title: "Marriages Act — starter excerpts",
    sourceType: "statute",
    citationLabel: "Marriages Act [Chapter 5:15] (and related family statutes) — starter pack",
    publisher: "Government of Zimbabwe / ZimLII / Veritas (attribution)",
    sourceUrl: "https://zimlii.org/search?q=Marriages%20Act%20Chapter%205%3A15",
    licenseNote:
      "Starter family-law orientation. Marriage types, solemnisation, and related reforms must be checked against current Acts.",
    effectiveDate: "Check current Marriages Act consolidation",
    chunks: [
      {
        headingPath: "Marriage formalities — orientation",
        text: "Starter note: Zimbabwe recognises regulated forms of marriage under the Marriages Act framework (as amended). Validity, solemnisation, and registration requirements are statutory. Advice on marriage validity should cite the Act after confirming the current text. Quality: starter_demo.",
      },
      {
        headingPath: "Family disputes — caution",
        text: "Starter note: divorce, custody, guardianship, and maintenance often engage family statutes and High Court / Magistrates practice. Prefer statute and rules over unsourced commentary. Do not invent case citations.",
      },
    ],
  },
  {
    key: "deeds_registries_excerpts",
    title: "Deeds Registries Act — starter excerpts",
    sourceType: "statute",
    citationLabel: "Deeds Registries Act [Chapter 20:05] — starter pack",
    publisher: "Government of Zimbabwe / ZimLII (attribution)",
    sourceUrl: "https://zimlii.org/search?q=Deeds%20Registries%20Act%20Chapter%2020%3A05",
    licenseNote:
      "Conveyancing orientation only. Registration practice must be confirmed with the Deeds Office and current Act/regulations.",
    effectiveDate: "Chapter 20:05 (check amendments)",
    chunks: [
      {
        headingPath: "Deeds registration — orientation",
        text: "Starter note: transfer and registration of real rights in land in Zimbabwe are effected through the deeds registry system under the Deeds Registries Act and related practice. Title, bonds, and caveats are specialist areas. Cite the Act and registry practice notes after verification. Quality: starter_demo.",
      },
      {
        headingPath: "Due diligence — caution",
        text: "Starter note: conveyancing due diligence typically includes deeds office searches and confirmation of authority to transfer. Do not treat this starter text as a conveyancing checklist for a live transaction.",
      },
    ],
  },
  {
    key: "civil_evidence_excerpts",
    title: "Civil Evidence Act — starter excerpts",
    sourceType: "statute",
    citationLabel: "Civil Evidence Act [Chapter 8:01] — starter pack",
    publisher: "Government of Zimbabwe / ZimLII (attribution)",
    sourceUrl: "https://zimlii.org/search?q=Civil%20Evidence%20Act%20Chapter%208%3A01",
    licenseNote:
      "Evidence orientation only. Admissibility rules must be taken from the Act and applicable case law after proper research.",
    effectiveDate: "Chapter 8:01 (check amendments)",
    chunks: [
      {
        headingPath: "Civil evidence — orientation",
        text: "Starter note: civil trials in Zimbabwe are governed in part by the Civil Evidence Act together with court rules and practice. Relevance, hearsay-related rules, documents, and privilege issues are statute- and case-sensitive. Prefer retrieved Act text over general common-law assumptions from other jurisdictions. Quality: starter_demo.",
      },
      {
        headingPath: "Burden and standards — caution",
        text: "Starter note: the party who asserts usually bears the burden of proof in civil matters, typically on a balance of probabilities, subject to specific statutory allocations. Confirm against authoritative sources before advising.",
      },
    ],
  },
  {
    key: "high_court_rules_excerpts",
    title: "High Court Rules — starter excerpts",
    sourceType: "rules",
    citationLabel: "High Court Rules (Zimbabwe) — starter pack",
    publisher: "Judiciary / Government Printer / ZimLII (attribution)",
    sourceUrl: "https://zimlii.org/search?q=High%20Court%20Rules%20Zimbabwe",
    licenseNote:
      "Procedure orientation only. Always check the current High Court Rules SI / practice directions.",
    effectiveDate: "Check current Rules statutory instrument",
    chunks: [
      {
        headingPath: "High Court procedure — orientation",
        text: "Starter note: civil procedure in the High Court of Zimbabwe is governed by the High Court Rules (as amended) and practice directions. Process, pleadings, applications vs actions, and time limits are rule-specific. Never invent rule numbers; retrieve the current rules text. Quality: starter_demo.",
      },
      {
        headingPath: "Urgent applications — caution",
        text: "Starter note: urgent chamber applications have specific Rule requirements (including urgency founding affidavits and form). Confirm the current Rule wording and local practice before filing advice.",
      },
    ],
  },
  {
    key: "magistrates_court_rules_excerpts",
    title: "Magistrates Court Rules — starter excerpts",
    sourceType: "rules",
    citationLabel: "Magistrates Court (Civil) Rules — starter pack",
    publisher: "Judiciary / Government Printer / ZimLII (attribution)",
    sourceUrl: "https://zimlii.org/search?q=Magistrates%20Court%20Civil%20Rules%20Zimbabwe",
    licenseNote:
      "Lower-court procedure orientation only. Confirm monetary jurisdiction and current Rules.",
    effectiveDate: "Check current Magistrates Court Rules",
    chunks: [
      {
        headingPath: "Magistrates civil procedure — orientation",
        text: "Starter note: many civil claims of limited value proceed in the Magistrates Court under the Magistrates Court Act and Civil Rules. Jurisdiction (territorial and monetary) and forms differ from the High Court. Verify current limits and Rules before advising. Quality: starter_demo.",
      },
      {
        headingPath: "Appeals — caution",
        text: "Starter note: appeals from the Magistrates Court follow statutory and rule-based routes and time limits. Do not assume High Court appeal practice applies unchanged.",
      },
    ],
  },
];

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.trim().split(/\s+/).length * 1.3));
}
