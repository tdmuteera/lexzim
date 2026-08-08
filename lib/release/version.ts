/**
 * Single SemVer source for LexZim (P4-07).
 * Keep in sync with package.json "version" (that file is the canonical npm/git tag source).
 */
export const APP_NAME = "LexZim";

/** Canonical app SemVer — must match package.json */
export const APP_VERSION = "0.5.0";

/** Short codename for this train (optional display). */
export const APP_RELEASE_CHANNEL = "portal-scale";

/** Path to changelog in repo (shown as release notes link in About). */
export const CHANGELOG_PATH = "CHANGELOG.md";

/** Public docs path for releasing runbook. */
export const RELEASING_DOC_PATH = "docs/RELEASING.md";

export function getAppVersionInfo() {
  return {
    name: APP_NAME,
    version: APP_VERSION,
    channel: APP_RELEASE_CHANNEL,
    changelogPath: CHANGELOG_PATH,
    releasingDocPath: RELEASING_DOC_PATH,
  };
}
