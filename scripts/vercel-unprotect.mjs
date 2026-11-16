import dns from "node:dns";
import fs from "node:fs";
import path from "node:path";

dns.setServers(["1.1.1.1", "8.8.8.8"]);

const token = (process.env.VERCEL_TOKEN || "").trim();
const meta = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), ".vercel", "project.json"), "utf8"),
);

async function api(method, urlPath, body) {
  const res = await fetch(`https://api.vercel.com${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

const q = `teamId=${meta.orgId}`;
const get = await api("GET", `/v9/projects/${meta.projectId}?${q}`);
console.log(
  "before",
  JSON.stringify(
    {
      status: get.status,
      ssoProtection: get.json.ssoProtection,
      passwordProtection: get.json.passwordProtection,
      vercelAuthentication: get.json.vercelAuthentication,
    },
    null,
    2,
  ),
);

// Vercel Hobby may use vercelAuthentication.deploymentType
const patch = await api("PATCH", `/v9/projects/${meta.projectId}?${q}`, {
  ssoProtection: null,
  passwordProtection: null,
  vercelAuthentication: {
    deploymentType: "none",
  },
});
console.log("patch", patch.status, JSON.stringify(patch.json.vercelAuthentication || patch.json.error || patch.json, null, 2).slice(0, 800));

const after = await api("GET", `/v9/projects/${meta.projectId}?${q}`);
console.log(
  "after",
  JSON.stringify(
    {
      ssoProtection: after.json.ssoProtection,
      passwordProtection: after.json.passwordProtection,
      vercelAuthentication: after.json.vercelAuthentication,
    },
    null,
    2,
  ),
);
