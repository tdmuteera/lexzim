import { randomUUID } from "crypto";
import { templateStoragePath, uploadFirmFile } from "@/lib/storage/firm-files";
import {
  STARTER_TEMPLATE_DEFS,
  buildStarterDocxBuffer,
} from "@/lib/templates/starters";
import {
  createTemplateRecord,
  findTemplateByTitle,
} from "@/lib/repos/templates";

export async function seedStarterTemplates(firmId: string, userId: string) {
  const created: string[] = [];
  const skipped: string[] = [];

  for (const def of STARTER_TEMPLATE_DEFS) {
    const existing = await findTemplateByTitle(firmId, def.title);
    if (existing) {
      skipped.push(def.title);
      continue;
    }

    const templateId = randomUUID();
    const storagePath = templateStoragePath({
      firmId,
      templateId,
      version: 1,
      fileName: def.fileName,
    });
    const bytes = await buildStarterDocxBuffer(def);
    await uploadFirmFile({
      storagePath,
      firmId,
      bytes,
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    await createTemplateRecord({
      id: templateId,
      firmId,
      title: def.title,
      areaOfLaw: def.areaOfLaw,
      description: def.description,
      storagePath,
      version: 1,
      createdBy: userId,
    });
    created.push(def.title);
  }

  return { created, skipped };
}
