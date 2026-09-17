/**
 * Firm-wide assignable tasks (Phase 10 P10-11).
 * Not matter pending_procedures.
 */
import "server-only";

import { and, asc, desc, eq, gte, lt, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { AuthError } from "@/lib/auth/types";
import { getDb } from "@/lib/db";
import { firmTasks, users } from "@/lib/db/schema";
import { notifyStaffEvent } from "@/lib/notifications/notify-staff-event";

const assigneeUsers = alias(users, "firm_task_assignee");
const assignerUsers = alias(users, "firm_task_assigner");

export const FIRM_TASK_PRIORITIES = ["low", "normal", "high"] as const;
export type FirmTaskPriority = (typeof FIRM_TASK_PRIORITIES)[number];

export const FIRM_TASK_STATUSES = ["pending", "done"] as const;
export type FirmTaskStatus = (typeof FIRM_TASK_STATUSES)[number];

export type FirmTaskRow = {
  task: typeof firmTasks.$inferSelect;
  assigneeName: string | null;
  assignerName: string | null;
};

function isOverdue(task: typeof firmTasks.$inferSelect, now = new Date()): boolean {
  return (
    task.status === "pending" &&
    task.dueAt != null &&
    task.dueAt.getTime() < now.getTime()
  );
}

export async function listFirmTasks(
  firmId: string,
  opts?: {
    mineUserId?: string;
    assignedByUserId?: string;
    status?: FirmTaskStatus | string;
    overdueOnly?: boolean;
  },
): Promise<FirmTaskRow[]> {
  const db = getDb();
  const conditions = [eq(firmTasks.firmId, firmId)];
  if (opts?.mineUserId) {
    conditions.push(eq(firmTasks.assigneeUserId, opts.mineUserId));
  }
  if (opts?.assignedByUserId) {
    conditions.push(eq(firmTasks.assignerUserId, opts.assignedByUserId));
  }
  if (opts?.status) {
    conditions.push(eq(firmTasks.status, opts.status));
  }
  if (opts?.overdueOnly) {
    conditions.push(eq(firmTasks.status, "pending"));
    conditions.push(lt(firmTasks.dueAt, new Date()));
  }

  return db
    .select({
      task: firmTasks,
      assigneeName: assigneeUsers.fullName,
      assignerName: assignerUsers.fullName,
    })
    .from(firmTasks)
    .leftJoin(assigneeUsers, eq(assigneeUsers.id, firmTasks.assigneeUserId))
    .leftJoin(assignerUsers, eq(assignerUsers.id, firmTasks.assignerUserId))
    .where(and(...conditions))
    .orderBy(desc(firmTasks.createdAt));
}

export async function getFirmTask(
  firmId: string,
  id: string,
): Promise<FirmTaskRow | null> {
  const db = getDb();
  const rows = await db
    .select({
      task: firmTasks,
      assigneeName: assigneeUsers.fullName,
      assignerName: assignerUsers.fullName,
    })
    .from(firmTasks)
    .leftJoin(assigneeUsers, eq(assigneeUsers.id, firmTasks.assigneeUserId))
    .leftJoin(assignerUsers, eq(assignerUsers.id, firmTasks.assignerUserId))
    .where(and(eq(firmTasks.firmId, firmId), eq(firmTasks.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

async function assertActiveSystemUser(firmId: string, userId: string) {
  const db = getDb();
  const rows = await db
    .select({ id: users.id, fullName: users.fullName })
    .from(users)
    .where(
      and(
        eq(users.firmId, firmId),
        eq(users.id, userId),
        eq(users.isActive, true),
        eq(users.isSystemUser, true),
      ),
    )
    .limit(1);
  if (!rows[0]) {
    throw new AuthError("validation", "Assignee must be an active system user in this firm.");
  }
  return rows[0];
}

export async function createFirmTask(
  firmId: string,
  assignerUserId: string,
  input: {
    title: string;
    description?: string | null;
    assigneeUserId: string;
    dueAt?: Date | null;
    priority?: FirmTaskPriority | string;
  },
) {
  const title = input.title.trim();
  if (!title) {
    throw new AuthError("validation", "Title is required.");
  }
  const priority = (input.priority ?? "normal").toString();
  if (!FIRM_TASK_PRIORITIES.includes(priority as FirmTaskPriority)) {
    throw new AuthError("validation", "Priority must be low, normal, or high.");
  }

  const assignee = await assertActiveSystemUser(firmId, input.assigneeUserId);

  const db = getDb();
  const rows = await db
    .insert(firmTasks)
    .values({
      firmId,
      title,
      description: input.description?.trim() || null,
      assigneeUserId: input.assigneeUserId,
      assignerUserId,
      dueAt: input.dueAt ?? null,
      priority,
      status: "pending",
    })
    .returning();
  const task = rows[0]!;

  if (input.assigneeUserId !== assignerUserId) {
    await notifyStaffEvent({
      firmId,
      userIds: [input.assigneeUserId],
      subject: `LexZim task: ${title}`,
      body: `You were assigned a task: ${title}`,
      inApp: {
        type: "task.assigned",
        title: "New task assigned",
        body: title,
        href: "/workflow/tasks",
        metadata: { taskId: task.id },
      },
    });
  }

  return { task, assigneeName: assignee.fullName };
}

export async function completeFirmTask(
  firmId: string,
  id: string,
  actorUserId: string,
  feedback?: string | null,
) {
  const full = await getFirmTask(firmId, id);
  if (!full) {
    throw new AuthError("not_found", "Task not found.");
  }
  if (full.task.status === "done") {
    throw new AuthError("validation", "Task is already completed.");
  }
  if (
    full.task.assigneeUserId !== actorUserId &&
    full.task.assignerUserId !== actorUserId
  ) {
    throw new AuthError("forbidden", "Only the assignee or assigner can complete this task.");
  }

  const db = getDb();
  const rows = await db
    .update(firmTasks)
    .set({
      status: "done",
      completionFeedback: feedback?.trim() || null,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(firmTasks.firmId, firmId), eq(firmTasks.id, id)))
    .returning();
  const task = rows[0]!;

  if (task.assignerUserId !== actorUserId) {
    await notifyStaffEvent({
      firmId,
      userIds: [task.assignerUserId],
      subject: `LexZim: Task completed — ${task.title}`,
      body: `The task "${task.title}" was marked complete.`,
      inApp: {
        type: "task.completed",
        title: "Task completed",
        body: task.title,
        href: "/workflow/tasks",
        metadata: { taskId: task.id },
      },
    });
  }

  return getFirmTask(firmId, id);
}

export async function reopenFirmTask(firmId: string, id: string, actorUserId: string) {
  const full = await getFirmTask(firmId, id);
  if (!full) {
    throw new AuthError("not_found", "Task not found.");
  }
  if (full.task.assignerUserId !== actorUserId) {
    throw new AuthError("forbidden", "Only the assigner can reopen this task.");
  }
  if (full.task.status !== "done") {
    throw new AuthError("validation", "Task is not completed.");
  }

  const db = getDb();
  await db
    .update(firmTasks)
    .set({
      status: "pending",
      completionFeedback: null,
      completedAt: null,
      updatedAt: new Date(),
    })
    .where(and(eq(firmTasks.firmId, firmId), eq(firmTasks.id, id)));

  return getFirmTask(firmId, id);
}

export async function updateFirmTask(
  firmId: string,
  id: string,
  actorUserId: string,
  input: {
    title?: string;
    description?: string | null;
    assigneeUserId?: string;
    dueAt?: Date | null;
    priority?: FirmTaskPriority | string;
  },
) {
  const full = await getFirmTask(firmId, id);
  if (!full) {
    throw new AuthError("not_found", "Task not found.");
  }
  if (full.task.assignerUserId !== actorUserId) {
    throw new AuthError("forbidden", "Only the assigner can update this task.");
  }
  if (full.task.status !== "pending") {
    throw new AuthError("validation", "Only pending tasks can be edited.");
  }

  const patch: Partial<typeof firmTasks.$inferInsert> = { updatedAt: new Date() };
  if (input.title !== undefined) {
    const title = input.title.trim();
    if (!title) throw new AuthError("validation", "Title is required.");
    patch.title = title;
  }
  if (input.description !== undefined) {
    patch.description = input.description?.trim() || null;
  }
  if (input.dueAt !== undefined) {
    patch.dueAt = input.dueAt;
  }
  if (input.priority !== undefined) {
    const priority = input.priority.toString();
    if (!FIRM_TASK_PRIORITIES.includes(priority as FirmTaskPriority)) {
      throw new AuthError("validation", "Priority must be low, normal, or high.");
    }
    patch.priority = priority;
  }
  if (input.assigneeUserId !== undefined) {
    await assertActiveSystemUser(firmId, input.assigneeUserId);
    const previousAssignee = full.task.assigneeUserId;
    patch.assigneeUserId = input.assigneeUserId;
    if (input.assigneeUserId !== previousAssignee && input.assigneeUserId !== actorUserId) {
      const taskTitle = (patch.title as string | undefined) ?? full.task.title;
      await notifyStaffEvent({
        firmId,
        userIds: [input.assigneeUserId],
        subject: `LexZim task: ${taskTitle}`,
        body: `You were assigned a task: ${taskTitle}`,
        inApp: {
          type: "task.assigned",
          title: "New task assigned",
          body: taskTitle,
          href: "/workflow/tasks",
          metadata: { taskId: id },
        },
      });
    }
  }

  const db = getDb();
  await db
    .update(firmTasks)
    .set(patch)
    .where(and(eq(firmTasks.firmId, firmId), eq(firmTasks.id, id)));

  return getFirmTask(firmId, id);
}

export async function countFirmTasks(
  firmId: string,
  userId: string,
): Promise<{
  myPending: number;
  assignedByMePending: number;
  overdue: number;
  doneRecently: number;
}> {
  const db = getDb();
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [myPendingRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(firmTasks)
    .where(
      and(
        eq(firmTasks.firmId, firmId),
        eq(firmTasks.assigneeUserId, userId),
        eq(firmTasks.status, "pending"),
      ),
    );

  const [assignedByMeRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(firmTasks)
    .where(
      and(
        eq(firmTasks.firmId, firmId),
        eq(firmTasks.assignerUserId, userId),
        eq(firmTasks.status, "pending"),
      ),
    );

  const [overdueRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(firmTasks)
    .where(
      and(
        eq(firmTasks.firmId, firmId),
        eq(firmTasks.assigneeUserId, userId),
        eq(firmTasks.status, "pending"),
        lt(firmTasks.dueAt, now),
      ),
    );

  const [doneRecentlyRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(firmTasks)
    .where(
      and(
        eq(firmTasks.firmId, firmId),
        eq(firmTasks.status, "done"),
        gte(firmTasks.completedAt, weekAgo),
        or(
          eq(firmTasks.assigneeUserId, userId),
          eq(firmTasks.assignerUserId, userId),
        ),
      ),
    );

  return {
    myPending: Number(myPendingRow?.n ?? 0),
    assignedByMePending: Number(assignedByMeRow?.n ?? 0),
    overdue: Number(overdueRow?.n ?? 0),
    doneRecently: Number(doneRecentlyRow?.n ?? 0),
  };
}

export function serializeFirmTask(row: FirmTaskRow, now = new Date()) {
  const t = row.task;
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    assigneeUserId: t.assigneeUserId,
    assigneeName: row.assigneeName,
    assignerUserId: t.assignerUserId,
    assignerName: row.assignerName,
    dueAt: t.dueAt?.toISOString() ?? null,
    priority: t.priority,
    status: t.status,
    completionFeedback: t.completionFeedback,
    completedAt: t.completedAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    overdue: isOverdue(t, now),
  };
}

export async function listActiveSystemUsers(firmId: string) {
  const db = getDb();
  return db
    .select({
      id: users.id,
      fullName: users.fullName,
      email: users.email,
    })
    .from(users)
    .where(
      and(
        eq(users.firmId, firmId),
        eq(users.isActive, true),
        eq(users.isSystemUser, true),
      ),
    )
    .orderBy(asc(users.fullName));
}
