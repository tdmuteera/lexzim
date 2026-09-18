/**
 * Staff notify: in-app + best-effort email (P11-09).
 * SMTP failure must not roll back the workflow write.
 */
import "server-only";

import { writeAuditLog } from "@/lib/auth/audit";
import { sendFirmEmail } from "@/lib/email/mailer";
import { createStaffNotification } from "@/lib/notifications/staff";
import { logError } from "@/lib/ops/log";
import {
  getFirmSetting,
  upsertFirmSetting,
} from "@/lib/repos/firm-settings";
import { resolveStaffNotifyEmails } from "@/lib/repos/staff-communication-emails";

export const STAFF_NOTIFY_LAST_ERROR_KEY = "staff_notify_email_last_error";
export const STAFF_NOTIFY_LAST_OK_AT_KEY = "staff_notify_email_last_ok_at";

export type NotifyStaffEventInput = {
  firmId: string;
  userIds: string[];
  subject: string;
  body: string;
  inApp: {
    type: string;
    title: string;
    body?: string | null;
    href?: string | null;
    metadata?: Record<string, unknown>;
  };
  /**
   * When no userIds (or all filtered), still create a firm-wide in-app notification
   * with userId null (approvals inbox style).
   */
  broadcastInAppIfEmpty?: boolean;
  /** Skip email (in-app only). */
  skipEmail?: boolean;
};

export type NotifyStaffEventResult = {
  inAppCount: number;
  emailed: number;
  emailFailed: number;
  lastEmailError: string | null;
};

async function recordStaffNotifyEmailOutcome(
  firmId: string,
  ok: boolean,
  errorMessage?: string | null,
) {
  try {
    if (ok) {
      await upsertFirmSetting(firmId, STAFF_NOTIFY_LAST_OK_AT_KEY, new Date().toISOString());
      await upsertFirmSetting(firmId, STAFF_NOTIFY_LAST_ERROR_KEY, "");
      return;
    }
    await upsertFirmSetting(
      firmId,
      STAFF_NOTIFY_LAST_ERROR_KEY,
      (errorMessage || "Staff notify email failed").slice(0, 500),
    );
  } catch {
    // never throw from outcome bookkeeping
  }
}

export async function getStaffNotifyEmailHealth(firmId: string): Promise<{
  lastError: string | null;
  lastOkAt: string | null;
}> {
  const [lastError, lastOkAt] = await Promise.all([
    getFirmSetting(firmId, STAFF_NOTIFY_LAST_ERROR_KEY),
    getFirmSetting(firmId, STAFF_NOTIFY_LAST_OK_AT_KEY),
  ]);
  return {
    lastError: lastError?.trim() || null,
    lastOkAt: lastOkAt?.trim() || null,
  };
}

/**
 * Create in-app staff notifications and best-effort SMTP to communication emails.
 * Never throws for email failure.
 */
export async function notifyStaffEvent(
  input: NotifyStaffEventInput,
): Promise<NotifyStaffEventResult> {
  const uniqueIds = [...new Set(input.userIds.filter(Boolean))];
  let inAppCount = 0;

  if (uniqueIds.length === 0) {
    if (input.broadcastInAppIfEmpty) {
      await createStaffNotification({
        firmId: input.firmId,
        userId: null,
        type: input.inApp.type,
        title: input.inApp.title,
        body: input.inApp.body ?? input.body,
        href: input.inApp.href,
        metadata: input.inApp.metadata,
      });
      inAppCount = 1;
    }
    return { inAppCount, emailed: 0, emailFailed: 0, lastEmailError: null };
  }

  await Promise.all(
    uniqueIds.map(async (userId) => {
      await createStaffNotification({
        firmId: input.firmId,
        userId,
        type: input.inApp.type,
        title: input.inApp.title,
        body: input.inApp.body ?? input.body,
        href: input.inApp.href,
        metadata: input.inApp.metadata,
      });
      inAppCount += 1;
    }),
  );

  if (input.skipEmail) {
    return { inAppCount, emailed: 0, emailFailed: 0, lastEmailError: null };
  }

  const targets = await resolveStaffNotifyEmails(input.firmId, uniqueIds);
  let emailed = 0;
  let emailFailed = 0;
  let lastEmailError: string | null = null;

  const textBody = [
    input.body.trim(),
    input.inApp.href ? `Open in LexZim: ${input.inApp.href}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  for (const target of targets) {
    try {
      const result = await sendFirmEmail(input.firmId, {
        to: target.email,
        subject: input.subject,
        text: textBody,
      });
      emailed += 1;
      await writeAuditLog({
        action: "staff_notify.email_sent",
        firmId: input.firmId,
        userId: target.userId,
        entityType: "staff_notification",
        entityId: target.userId,
        metadata: {
          type: input.inApp.type,
          subject: input.subject,
          to: target.email,
          messageId: result.messageId,
          transport: result.transport,
          from: result.from,
        },
      });
    } catch (err) {
      emailFailed += 1;
      const message =
        err instanceof Error ? err.message : "Staff notify email failed.";
      lastEmailError = message;
      logError("staff_notify.email", err, {
        firmId: input.firmId,
        userId: target.userId,
        type: input.inApp.type,
      });
      await writeAuditLog({
        action: "staff_notify.email_failed",
        firmId: input.firmId,
        userId: target.userId,
        entityType: "staff_notification",
        entityId: target.userId,
        metadata: {
          type: input.inApp.type,
          subject: input.subject,
          to: target.email,
          error: message.slice(0, 300),
        },
      }).catch(() => undefined);
    }
  }

  if (emailed > 0 && emailFailed === 0) {
    await recordStaffNotifyEmailOutcome(input.firmId, true);
  } else if (emailFailed > 0) {
    await recordStaffNotifyEmailOutcome(input.firmId, false, lastEmailError);
  } else if (targets.length === 0) {
    // no addresses — not an SMTP failure
  }

  return { inAppCount, emailed, emailFailed, lastEmailError };
}
