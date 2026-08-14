import type { CoaSeedRow } from "@/lib/gl/types";

/**
 * Default chart of accounts per firm (Phase 7 §4).
 * Bookkeeper bands: 1000 assets, 2000 liabilities, 3000 equity,
 * 4000 revenue, 5000 direct costs, 6000–9000 operating expenses.
 */
export const DEFAULT_COA: CoaSeedRow[] = [
  // Assets
  { code: "1000", name: "Assets", type: "asset", isSystem: true, isGroup: true, normalBalance: "debit" },
  { code: "1010", name: "Operating Bank", type: "asset", parentCode: "1000", isSystem: true, normalBalance: "debit", description: "Business operating account" },
  { code: "1020", name: "Business Vault", type: "asset", parentCode: "1000", isSystem: true, normalBalance: "debit", description: "On-premises business cash vault" },
  { code: "1050", name: "Petty Cash", type: "asset", parentCode: "1000", isSystem: true, normalBalance: "debit" },
  { code: "1210", name: "Trust Bank", type: "asset", parentCode: "1000", isSystem: true, normalBalance: "debit", description: "IOLTA / client trust bank" },
  { code: "1310", name: "Accounts Receivable", type: "asset", parentCode: "1000", isSystem: true, normalBalance: "debit" },
  { code: "1320", name: "Client Cost Advances", type: "asset", parentCode: "1000", isSystem: true, normalBalance: "debit", description: "Advanced client costs (WIP asset)" },

  // Liabilities
  { code: "2000", name: "Liabilities", type: "liability", isSystem: true, isGroup: true, normalBalance: "credit" },
  { code: "2010", name: "Accounts Payable", type: "liability", parentCode: "2000", isSystem: true, normalBalance: "credit" },
  { code: "2100", name: "Trust Liability", type: "liability", parentCode: "2000", isSystem: true, normalBalance: "credit", description: "Client trust obligations" },

  // Equity
  { code: "3000", name: "Equity", type: "equity", isSystem: true, isGroup: true, normalBalance: "credit" },
  { code: "3010", name: "Owner's Equity / Retained Earnings", type: "equity", parentCode: "3000", isSystem: true, normalBalance: "credit" },

  // Revenue
  { code: "4000", name: "Revenue", type: "revenue", isSystem: true, isGroup: true, normalBalance: "credit" },
  { code: "4010", name: "Conveyancing Fees", type: "revenue", parentCode: "4000", isSystem: true, normalBalance: "credit" },
  { code: "4020", name: "Administration Fees", type: "revenue", parentCode: "4000", isSystem: true, normalBalance: "credit" },
  { code: "4030", name: "Consultation Fees", type: "revenue", parentCode: "4000", isSystem: true, normalBalance: "credit" },
  { code: "4040", name: "Retainer / Advance (earned)", type: "revenue", parentCode: "4000", isSystem: true, normalBalance: "credit", description: "Recognized when advance applied to invoice" },
  { code: "4050", name: "Sales Discounts", type: "revenue", parentCode: "4000", isSystem: true, normalBalance: "debit", description: "Contra revenue for invoice-level discounts" },
  { code: "4100", name: "Reimbursed Client Costs", type: "revenue", parentCode: "4000", isSystem: true, normalBalance: "credit" },

  // Direct costs (matter-linked)
  { code: "5000", name: "Direct Client Costs", type: "direct_cost", isSystem: true, isGroup: true, normalBalance: "debit" },
  { code: "5010", name: "Expert Witness Fees", type: "direct_cost", parentCode: "5000", isSystem: true, normalBalance: "debit" },
  { code: "5020", name: "Court Filing and Process Server", type: "direct_cost", parentCode: "5000", isSystem: true, normalBalance: "debit" },
  { code: "5030", name: "Deposition and Transcript Costs", type: "direct_cost", parentCode: "5000", isSystem: true, normalBalance: "debit" },

  // Operating expenses — Personnel (6000)
  { code: "6000", name: "Personnel Expenses", type: "expense", isSystem: true, isGroup: true, normalBalance: "debit" },
  { code: "6010", name: "Attorney Salaries", type: "expense", parentCode: "6000", isSystem: true, normalBalance: "debit" },
  { code: "6020", name: "Partner Draws", type: "expense", parentCode: "6000", isSystem: true, normalBalance: "debit" },
  { code: "6030", name: "Staff Salaries", type: "expense", parentCode: "6000", isSystem: true, normalBalance: "debit" },
  { code: "6040", name: "Payroll Taxes and Employee Benefits", type: "expense", parentCode: "6000", isSystem: true, normalBalance: "debit" },

  // Occupancy (7000)
  { code: "7000", name: "Occupancy", type: "expense", isSystem: true, isGroup: true, normalBalance: "debit" },
  { code: "7010", name: "Office Rent", type: "expense", parentCode: "7000", isSystem: true, normalBalance: "debit" },
  { code: "7020", name: "Electricity", type: "expense", parentCode: "7000", isSystem: true, normalBalance: "debit" },
  { code: "7030", name: "Cleaning Supplies", type: "expense", parentCode: "7000", isSystem: true, normalBalance: "debit" },
  { code: "7040", name: "Office Maintenance", type: "expense", parentCode: "7000", isSystem: true, normalBalance: "debit" },
  { code: "7050", name: "Property Maintenance", type: "expense", parentCode: "7000", isSystem: true, normalBalance: "debit" },

  // Practice overhead (8000)
  { code: "8000", name: "Practice Overhead", type: "expense", isSystem: true, isGroup: true, normalBalance: "debit" },
  { code: "8010", name: "Legal Research Subscriptions", type: "expense", parentCode: "8000", isSystem: true, normalBalance: "debit" },
  { code: "8020", name: "Bar Association Fees", type: "expense", parentCode: "8000", isSystem: true, normalBalance: "debit" },
  { code: "8030", name: "Continuing Legal Education", type: "expense", parentCode: "8000", isSystem: true, normalBalance: "debit" },
  { code: "8040", name: "Malpractice Insurance", type: "expense", parentCode: "8000", isSystem: true, normalBalance: "debit" },
  { code: "8050", name: "Law Firm Software", type: "expense", parentCode: "8000", isSystem: true, normalBalance: "debit" },

  // General admin (9000)
  { code: "9000", name: "General and Administrative", type: "expense", isSystem: true, isGroup: true, normalBalance: "debit" },
  { code: "9010", name: "Office Supplies", type: "expense", parentCode: "9000", isSystem: true, normalBalance: "debit" },
  { code: "9020", name: "Postage and Delivery", type: "expense", parentCode: "9000", isSystem: true, normalBalance: "debit" },
  { code: "9030", name: "Marketing and Advertising", type: "expense", parentCode: "9000", isSystem: true, normalBalance: "debit" },
  { code: "9040", name: "Depreciation on Office Equipment", type: "expense", parentCode: "9000", isSystem: true, normalBalance: "debit" },
  { code: "9050", name: "Canteen Supplies", type: "expense", parentCode: "9000", isSystem: true, normalBalance: "debit" },
  { code: "9060", name: "Transport and Fuel", type: "expense", parentCode: "9000", isSystem: true, normalBalance: "debit" },
  { code: "9070", name: "Telephone and Internet", type: "expense", parentCode: "9000", isSystem: true, normalBalance: "debit" },
];
