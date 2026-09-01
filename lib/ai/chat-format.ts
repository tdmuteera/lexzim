/**
 * Repair model output that restarts numbered lists at 1.
 */

const ITEM_RE = /^(\s*)(\d+)([.)])\s+(.*)$/;

function isListItem(line: string): boolean {
  return ITEM_RE.test(line);
}

function isBreak(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/^#{1,6}\s+/.test(t)) return true;
  if (/^```/.test(t)) return true;
  if (/^\s*[-*•]\s+/.test(line)) return true;
  return false;
}

type ListItem = { indent: string; punct: string; num: number; body: string[] };

export function repairRestartedNumberedLists(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    if (!isListItem(lines[i] ?? "")) {
      out.push(lines[i] ?? "");
      i += 1;
      continue;
    }

    const items: ListItem[] = [];
    while (i < lines.length) {
      const line = lines[i] ?? "";
      const m = ITEM_RE.exec(line);
      if (m) {
        const item: ListItem = { indent: m[1], punct: m[3], num: Number(m[2]), body: [m[4]] };
        i += 1;
        while (i < lines.length) {
          const nxt = lines[i] ?? "";
          if (nxt.trim() === "") {
            let j = i + 1;
            while (j < lines.length && (lines[j] ?? "").trim() === "") j += 1;
            const peek = lines[j] ?? "";
            if (isListItem(peek) || isBreak(peek) || peek === "") break;
            item.body.push("");
            i += 1;
            continue;
          }
          if (isListItem(nxt) || isBreak(nxt)) break;
          item.body.push(nxt);
          i += 1;
        }
        items.push(item);
        continue;
      }
      if (line.trim() === "") {
        let j = i + 1;
        while (j < lines.length && (lines[j] ?? "").trim() === "") j += 1;
        if (isListItem(lines[j] ?? "")) {
          i = j;
          continue;
        }
      }
      break;
    }

    const nums = items.map((it) => it.num);
    const allOnes = nums.length >= 2 && nums.every((n) => n === 1);
    const hasReset =
      nums.length >= 2 &&
      nums.some((n, idx) => idx > 0 && n === 1 && nums[idx - 1] >= 1);
    const shouldRenumber = allOnes || (hasReset && nums.filter((n) => n === 1).length >= 2);

    if (!shouldRenumber) {
      for (const item of items) {
        out.push(`${item.indent}${item.num}${item.punct} ${item.body[0] ?? ""}`);
        for (let b = 1; b < item.body.length; b += 1) out.push(item.body[b]);
      }
      continue;
    }

    items.forEach((item, idx) => {
      out.push(`${item.indent}${idx + 1}${item.punct} ${item.body[0] ?? ""}`);
      for (let b = 1; b < item.body.length; b += 1) out.push(item.body[b]);
    });
  }

  return out.join("\n");
}
