import { and, count, eq } from "drizzle-orm";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { getDb } from "@/lib/db";
import { firms, users } from "@/lib/db/schema";
import {
  parseFirmOpsStatus,
  platformCreateFirm,
  platformSetFirmStatus,
} from "@/lib/platform/firms";
import { requireOpsAccess } from "@/lib/platform/ops-guard";
import { platformPurgeFirm, PURGE_CONFIRM_PHRASE } from "@/lib/privacy/purge-firm";
import { getEffectiveLicence, serializeEffectiveLicence } from "@/lib/repos/licences";

/**
 * Platform ops: list firms (no matter contents).
 * Includes licence summary + active user counts.
 */
export async function GET(request: Request) {
  try {
    const admin = await requireOpsAccess(request);
    const db = getDb();
    const tenantRows = await db
      .select({
        id: firms.id,
        name: firms.name,
        slug: firms.slug,
        status: firms.status,
        isDemo: firms.isDemo,
        createdAt: firms.createdAt,
      })
      .from(firms)
      .orderBy(firms.name);

    const items = [];
    for (const row of tenantRows) {
      const [userCount] = await db
        .select({ n: count() })
        .from(users)
        .where(and(eq(users.firmId, row.id), eq(users.isActive, true)));
      const licence = await getEffectiveLicence(row.id);
      items.push({
        id: row.id,
        name: row.name,
        slug: row.slug,
        status: row.status,
        isDemo: row.isDemo,
        createdAt: row.createdAt.toISOString(),
        activeUsers: Number(userCount?.n ?? 0),
        licence: serializeEffectiveLicence(licence),
      });
    }

    return jsonOk({
      admin: { id: admin.id, email: admin.email, fullName: admin.fullName },
      items,
      note: "Aggregate firm list only. Matter contents are not exposed on ops APIs.",
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

/**
 * Create firm tenant (optional ops path).
 * Body: { firmName, status?, isDemo?, managingPartner: { fullName, email, password } }
 */
export async function POST(request: Request) {
  try {
    await requireOpsAccess(request);
    const body = (await request.json()) as {
      firmName?: string;
      status?: "active" | "trial" | "demo";
      isDemo?: boolean;
      managingPartner?: {
        fullName?: string;
        email?: string;
        password?: string;
      };
    };
    const mp = body.managingPartner;
    if (!mp?.fullName || !mp.email || !mp.password || !body.firmName) {
      throw new AuthError(
        "validation",
        "firmName and managingPartner { fullName, email, password } are required.",
      );
    }
    const result = await platformCreateFirm(
      {
        firmName: body.firmName,
        status: body.status,
        isDemo: body.isDemo,
        managingPartner: {
          fullName: mp.fullName,
          email: mp.email,
          password: mp.password,
        },
      },
      { ipOrUserAgent: clientInfo(request) },
    );
    return jsonOk(result, { status: 201 });
  } catch (err) {
    return jsonError(err, request);
  }
}

/**
 * Soft-disable / restore firm.
 * Body: { firmId, status: active|trial|demo|suspended|archived, notes? }
 */
export async function PATCH(request: Request) {
  try {
    await requireOpsAccess(request);
    const body = (await request.json()) as {
      firmId?: string;
      status?: string;
      notes?: string;
    };
    if (!body.firmId?.trim() || !body.status?.trim()) {
      throw new AuthError("validation", "firmId and status are required.");
    }
    const status = parseFirmOpsStatus(body.status);
    const firm = await platformSetFirmStatus(body.firmId.trim(), status, {
      ipOrUserAgent: clientInfo(request),
      notes: body.notes ?? null,
    });
    return jsonOk({
      firm: {
        id: firm.id,
        name: firm.name,
        slug: firm.slug,
        status: firm.status,
      },
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

/**
 * Hard purge firm (ops). Body:
 * { firmId, confirmSlug, confirmPhrase: "DELETE FIRM" }
 * Firm must already be suspended or archived.
 */
export async function DELETE(request: Request) {
  try {
    await requireOpsAccess(request);
    const body = (await request.json()) as {
      firmId?: string;
      confirmSlug?: string;
      confirmPhrase?: string;
    };
    if (!body.firmId?.trim() || !body.confirmSlug?.trim() || !body.confirmPhrase?.trim()) {
      throw new AuthError(
        "validation",
        `firmId, confirmSlug, and confirmPhrase ("${PURGE_CONFIRM_PHRASE}") are required.`,
      );
    }
    const result = await platformPurgeFirm({
      firmId: body.firmId.trim(),
      confirmSlug: body.confirmSlug.trim(),
      confirmPhrase: body.confirmPhrase.trim(),
      ipOrUserAgent: clientInfo(request),
    });
    return jsonOk({ purged: true, ...result });
  } catch (err) {
    return jsonError(err, request);
  }
}
