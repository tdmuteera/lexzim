/**
 * Firm setting: require clear conflict check before opening a matter (P10-13).
 * Default ON (missing key or anything other than "false").
 */
import "server-only";

import {
  getFirmSetting,
  upsertFirmSetting,
} from "@/lib/repos/firm-settings";

export const REQUIRE_CLEAR_CONFLICT_KEY = "require_clear_conflict";

export async function getRequireClearConflict(firmId: string): Promise<boolean> {
  const raw = await getFirmSetting(firmId, REQUIRE_CLEAR_CONFLICT_KEY);
  return raw !== "false";
}

export async function setRequireClearConflict(
  firmId: string,
  required: boolean,
): Promise<void> {
  await upsertFirmSetting(
    firmId,
    REQUIRE_CLEAR_CONFLICT_KEY,
    required ? "true" : "false",
  );
}
