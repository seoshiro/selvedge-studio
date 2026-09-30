import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
const mode = process.argv[2] || "check";
const result = spawnSync(
  "git",
  ["-c", "credential.interactive=never", "credential", "fill"],
  {
    input: "protocol=https\nhost=github.com\n\n",
    encoding: "utf8",
    env: { ...process.env, GCM_INTERACTIVE: "Never", GIT_TERMINAL_PROMPT: "0" },
    windowsHide: true,
  },
);
if (result.status !== 0)
  throw new Error(
    "Existing non-interactive GitHub credential is unavailable. No new login or grant attempted.",
  );
const fields = Object.fromEntries(
  result.stdout
    .trim()
    .split("\n")
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);
if (!fields.password) throw new Error("No existing credential.");
const headers = {
  Authorization: `Bearer ${fields.password}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "Content-Type": "application/json",
};
async function api(route, method = "GET", body) {
  const r = await fetch("https://api.github.com" + route, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}
const user = await api("/user");
if (user.status !== 200 || user.data.login !== "seoshiro")
  throw new Error("Existing credential must belong to seoshiro.");
const repo = "seoshiro/selvedge-studio";
if (mode === "check") {
  const r = await api("/repos/" + repo);
  console.log(
    JSON.stringify({
      login: user.data.login,
      plan: user.data.plan?.name,
      repository: repo,
      status: r.status,
    }),
  );
} else if (mode === "create") {
  const exists = await api("/repos/" + repo);
  if (exists.status !== 404)
    throw new Error("Repository name already exists or could not be checked.");
  const r = await api("/user/repos", "POST", {
    name: "selvedge-studio",
    description:
      "Browser-local apparel collection proofing studio. One graphic. A considered collection. Every revision clear.",
    private: false,
    auto_init: false,
    has_issues: true,
    has_wiki: false,
    has_projects: false,
    homepage: "https://seoshiro.github.io/selvedge-studio/",
  });
  if (r.status !== 201)
    throw new Error("Repository creation failed: " + r.status);
  console.log(JSON.stringify({ repository: r.data.html_url, created: true }));
} else if (mode === "pages") {
  const current = await api("/repos/" + repo + "/pages");
  const r = await api(
    "/repos/" + repo + "/pages",
    current.status === 404 ? "POST" : "PUT",
    { build_type: "workflow" },
  );
  if (![201, 204].includes(r.status))
    throw new Error("Pages configuration failed: " + r.status);
  console.log(
    JSON.stringify({
      pagesConfigured: true,
      url: "https://seoshiro.github.io/selvedge-studio/",
    }),
  );
} else if (mode === "status") {
  const [r, p] = await Promise.all([
    api("/repos/" + repo + "/actions/runs?per_page=5"),
    api("/repos/" + repo + "/pages"),
  ]);
  const data = {
    runs: r.data.workflow_runs?.map((x) => ({
      id: x.id,
      sha: x.head_sha,
      status: x.status,
      conclusion: x.conclusion,
      url: x.html_url,
    })),
    pages: p.data.html_url,
  };
  console.log(JSON.stringify(data, null, 2));
  await fs.mkdir(".private", { recursive: true });
  await fs.writeFile(".private/deployment.json", JSON.stringify(data, null, 2));
} else throw new Error("Unknown mode");
