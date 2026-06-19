import { Buffer } from "node:buffer";

const DEFAULT_ORG = "Open-CMSIS-Pack";
const DEFAULT_SERVER = "http://localhost:3000";
const USER_AGENT = "PortVortex-Open-CMSIS-Pack-Importer";

const args = parseArgs(process.argv.slice(2));
const org = args.org || DEFAULT_ORG;
const server = String(args.server || DEFAULT_SERVER).replace(/\/+$/, "");
const includePattern = args.include ? new RegExp(args.include, "i") : /_DFP$/i;
const limit = args.limit ? Number(args.limit) : 0;
const dryRun = Boolean(args["dry-run"]);
const concurrency = Math.max(1, Number(args.concurrency || 1));
const githubToken = process.env.GITHUB_TOKEN || "";

main().catch((err) => {
  console.error(`ERROR: ${err.message}`);
  process.exitCode = 1;
});

async function main() {
  console.log(`Discovering ${org} repositories matching ${includePattern} ...`);
  const repos = (await listOrgRepos(org))
    .filter((repo) => includePattern.test(repo.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  const selected = limit > 0 ? repos.slice(0, limit) : repos;
  console.log(`Found ${repos.length} DFP candidate repos${limit ? `, processing first ${selected.length}` : ""}.`);

  const plans = [];
  for (const repo of selected) {
    try {
      const plan = await buildPackPlan(repo);
      plans.push(plan);
      console.log(`OK   ${repo.name} -> ${plan.packUrl}`);
    } catch (err) {
      console.log(`SKIP ${repo.name}: ${err.message}`);
    }
  }

  if (dryRun) {
    console.log(`Dry run complete. ${plans.length} pack(s) would be imported.`);
    return;
  }

  let imported = 0;
  let skipped = 0;
  let conflicts = 0;
  let failed = 0;
  await runPool(plans, concurrency, async (plan) => {
    try {
      const pack = await downloadBuffer(plan.packUrl);
      const result = await importPack(plan, pack);
      imported += result.imported?.length || 0;
      skipped += result.skipped?.length || 0;
      conflicts += result.conflicts?.length || 0;
      console.log(`DONE ${plan.repo.name}: imported=${result.imported?.length || 0}, skipped=${result.skipped?.length || 0}, conflicts=${result.conflicts?.length || 0}`);
    } catch (err) {
      failed += 1;
      console.log(`FAIL ${plan.repo.name}: ${err.message}`);
    }
  });

  console.log(`Finished. chips imported=${imported}, skipped=${skipped}, conflicts=${conflicts}, failed packs=${failed}.`);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) out[key] = true;
    else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

async function listOrgRepos(name) {
  const repos = [];
  for (let page = 1; ; page += 1) {
    const url = `https://api.github.com/orgs/${encodeURIComponent(name)}/repos?per_page=100&page=${page}`;
    const batch = await fetchJson(url);
    if (!Array.isArray(batch) || !batch.length) break;
    repos.push(...batch);
  }
  return repos;
}

async function buildPackPlan(repo) {
  const releaseAsset = await findLatestReleasePack(repo).catch(() => null);
  if (releaseAsset) return { repo, packUrl: releaseAsset.browser_download_url, filename: releaseAsset.name };

  const pdsc = await findPdsc(repo);
  const text = await fetchText(pdsc.download_url);
  const vendor = readXmlTag(text, "vendor");
  const name = readXmlTag(text, "name");
  const baseUrl = readXmlTag(text, "url");
  const version = readLatestReleaseVersion(text);
  if (!vendor || !name || !baseUrl || !version) {
    throw new Error("PDSC does not contain vendor, name, url, or release version");
  }
  const filename = `${vendor}.${name}.${version}.pack`;
  const packUrl = `${baseUrl.replace(/\/?$/, "/")}${filename}`;
  return { repo, packUrl, filename, pdsc: pdsc.name, version };
}

async function findLatestReleasePack(repo) {
  const releases = await fetchJson(`https://api.github.com/repos/${repo.full_name}/releases?per_page=10`);
  for (const release of releases || []) {
    const asset = (release.assets || []).find((item) => /\.pack$/i.test(item.name || ""));
    if (asset) return asset;
  }
  return null;
}

async function findPdsc(repo) {
  const contents = await fetchJson(`https://api.github.com/repos/${repo.full_name}/contents`);
  const pdsc = (contents || []).find((item) => item.type === "file" && /\.pdsc$/i.test(item.name || ""));
  if (!pdsc?.download_url) throw new Error("PDSC file not found at repository root");
  return pdsc;
}

function readXmlTag(text, tag) {
  return new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i").exec(text)?.[1]?.trim() || "";
}

function readLatestReleaseVersion(text) {
  const releases = [...text.matchAll(/<release\b([^>]*)>/gi)];
  for (const release of releases) {
    const attrs = parseXmlAttributes(release[1] || "");
    if (attrs.version) return attrs.version;
  }
  return "";
}

function parseXmlAttributes(text) {
  const attrs = {};
  String(text || "").replace(/([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"/g, (_, key, value) => {
    attrs[key] = value;
    return "";
  });
  return attrs;
}

async function importPack(plan, buffer) {
  const form = new FormData();
  form.set("packFile", new Blob([buffer], { type: "application/octet-stream" }), plan.filename || `${plan.repo.name}.pack`);
  const response = await fetch(`${server}/api/chip-configs/import-pack`, { method: "POST", body: form });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

async function downloadBuffer(url) {
  const response = await fetch(url, { headers: requestHeaders() });
  if (!response.ok) throw new Error(`download failed ${response.status} ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: requestHeaders() });
  if (!response.ok) throw new Error(`GitHub request failed ${response.status} ${url}`);
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, { headers: requestHeaders() });
  if (!response.ok) throw new Error(`request failed ${response.status} ${url}`);
  return response.text();
}

function requestHeaders() {
  return {
    "User-Agent": USER_AGENT,
    "Accept": "application/vnd.github+json",
    ...(githubToken ? { Authorization: `Bearer ${githubToken}` } : {})
  };
}

async function runPool(items, size, worker) {
  let index = 0;
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index];
      index += 1;
      await worker(item);
    }
  });
  await Promise.all(runners);
}
