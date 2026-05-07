import { spawnSync } from "node:child_process";
import { autoopsDefaults, env, logJson, redact, warnJson } from "./logger.mjs";
import { assertDispatchPayloadSmall, compactDispatchPayload } from "./incident-key.mjs";

export function parseRepo(repo = autoopsDefaults().repo) {
  const [owner, name] = String(repo).split("/");
  if (!owner || !name) {
    throw new Error(`Invalid GitHub repo "${repo}". Expected owner/repo.`);
  }
  return { owner, repo: name, fullName: `${owner}/${name}` };
}

export class GitHubClient {
  constructor({ token = env("GITHUB_TOKEN"), repo = autoopsDefaults().repo, dryRun = false, timeoutMs = 15000 } = {}) {
    this.token = token;
    this.repoInfo = parseRepo(repo);
    this.dryRun = dryRun;
    this.timeoutMs = timeoutMs;
  }

  async request(method, apiPath, body = undefined) {
    if (!this.token) {
      throw new Error("GITHUB_TOKEN is required for GitHub API calls");
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`https://api.github.com${apiPath}`, {
        method,
        signal: controller.signal,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "VerseCraft-AutoOps",
        },
        body: body == null ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      let data = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = { raw: text };
        }
      }
      if (!response.ok) {
        throw new Error(`GitHub API ${method} ${apiPath} failed: ${response.status} ${JSON.stringify(redact(data))}`);
      }
      return data;
    } finally {
      clearTimeout(timeout);
    }
  }

  async repositoryDispatch(eventType, incident) {
    const clientPayload = compactDispatchPayload(incident);
    const size = assertDispatchPayloadSmall(clientPayload);
    const path = `/repos/${this.repoInfo.owner}/${this.repoInfo.repo}/dispatches`;
    if (this.dryRun) {
      logJson("github.repository_dispatch.dry_run", {
        repo: this.repoInfo.fullName,
        event_type: eventType,
        payload_size: size,
        client_payload: clientPayload,
      });
      return { dryRun: true, event_type: eventType, client_payload: clientPayload };
    }
    await this.request("POST", path, { event_type: eventType, client_payload: clientPayload });
    logJson("github.repository_dispatch.sent", {
      repo: this.repoInfo.fullName,
      event_type: eventType,
      payload_size: size,
      client_payload: clientPayload,
    });
    return { event_type: eventType, client_payload: clientPayload };
  }

  async createOrUpdateIssue({ incidentKey, title, body, labels = ["auto-ops", "incident"] }) {
    const safeTitle = title || `[auto-ops] ${incidentKey}`;
    if (this.dryRun) {
      logJson("github.issue.dry_run", {
        repo: this.repoInfo.fullName,
        title: safeTitle,
        labels,
      });
      return { dryRun: true, title: safeTitle };
    }

    const query = encodeURIComponent(`repo:${this.repoInfo.fullName} is:issue in:title "${incidentKey}"`);
    const search = await this.request("GET", `/search/issues?q=${query}`);
    const existing = search.items?.find((item) => item.title?.includes(incidentKey));
    if (existing) {
      await this.request("PATCH", `/repos/${this.repoInfo.owner}/${this.repoInfo.repo}/issues/${existing.number}`, {
        title: safeTitle,
        body,
        labels,
      });
      logJson("github.issue.updated", { repo: this.repoInfo.fullName, number: existing.number, incident_key: incidentKey });
      return { number: existing.number, url: existing.html_url, updated: true };
    }

    const created = await this.request("POST", `/repos/${this.repoInfo.owner}/${this.repoInfo.repo}/issues`, {
      title: safeTitle,
      body,
      labels,
    });
    logJson("github.issue.created", { repo: this.repoInfo.fullName, number: created.number, incident_key: incidentKey });
    return { number: created.number, url: created.html_url, created: true };
  }

  async ensureLabels(labels = []) {
    if (this.dryRun) {
      logJson("github.labels.dry_run", { repo: this.repoInfo.fullName, labels });
      return { dryRun: true, created: [] };
    }
    const created = [];
    for (const label of labels) {
      try {
        await this.request("GET", `/repos/${this.repoInfo.owner}/${this.repoInfo.repo}/labels/${encodeURIComponent(label)}`);
      } catch {
        if (this.dryRun) {
          continue;
        }
        const color = label === "codex-needed" ? "d93f0b" : label === "resolved" ? "0e8a16" : "5319e7";
        try {
          await this.request("POST", `/repos/${this.repoInfo.owner}/${this.repoInfo.repo}/labels`, {
            name: label,
            color,
          });
          created.push(label);
        } catch (error) {
          warnJson("github.label.ensure_failed", { label, error: error.message });
        }
      }
    }
    return { created };
  }

  async getIssue(number) {
    return this.request("GET", `/repos/${this.repoInfo.owner}/${this.repoInfo.repo}/issues/${number}`);
  }

  async listIssueComments(number) {
    return this.request("GET", `/repos/${this.repoInfo.owner}/${this.repoInfo.repo}/issues/${number}/comments?per_page=100`);
  }

  async searchIssues(query) {
    const encoded = encodeURIComponent(query);
    return this.request("GET", `/search/issues?q=${encoded}&per_page=20`);
  }

  async addIssueComment(number, body) {
    if (this.dryRun) {
      logJson("github.issue_comment.dry_run", { repo: this.repoInfo.fullName, number, body_excerpt: body.slice(0, 300) });
      return { dryRun: true };
    }
    return this.request("POST", `/repos/${this.repoInfo.owner}/${this.repoInfo.repo}/issues/${number}/comments`, { body });
  }

  async closeIssue(number, { addResolvedLabel = true } = {}) {
    if (addResolvedLabel) {
      const issue = await this.getIssue(number);
      const labels = new Set((issue.labels || []).map((label) => (typeof label === "string" ? label : label.name)));
      labels.delete("codex-needed");
      labels.add("resolved");
      await this.ensureLabels(["resolved"]);
      await this.request("PATCH", `/repos/${this.repoInfo.owner}/${this.repoInfo.repo}/issues/${number}`, {
        labels: Array.from(labels).filter(Boolean),
      });
    }
    if (this.dryRun) {
      logJson("github.issue_close.dry_run", { repo: this.repoInfo.fullName, number });
      return { dryRun: true };
    }
    return this.request("PATCH", `/repos/${this.repoInfo.owner}/${this.repoInfo.repo}/issues/${number}`, { state: "closed" });
  }
}

export function buildGhSecretCommands(secretNames, repo = autoopsDefaults().repo) {
  return secretNames.map((name) => `gh secret set ${name} --repo ${repo} --body "$${name}"`);
}

export function ghAvailable() {
  const result = spawnSync("gh", ["--version"], { encoding: "utf8" });
  return result.status === 0;
}

export function syncSecretsWithGh(secretMap, { repo = autoopsDefaults().repo, dryRun = false } = {}) {
  const names = Object.keys(secretMap).filter((name) => secretMap[name]);
  if (dryRun) {
    logJson("github.secrets.dry_run", { repo, secrets: names });
    return { dryRun: true, synced: [], commands: buildGhSecretCommands(names, repo) };
  }
  if (!ghAvailable()) {
    warnJson("github.secrets.gh_missing", { repo, secrets: names });
    return { synced: [], commands: buildGhSecretCommands(names, repo) };
  }
  const synced = [];
  const failed = [];
  for (const name of names) {
    const result = spawnSync("gh", ["secret", "set", name, "--repo", repo], {
      encoding: "utf8",
      input: secretMap[name],
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, GH_TOKEN: process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "" },
    });
    if (result.status === 0) {
      synced.push(name);
    } else {
      failed.push({ name, error: result.stderr || result.stdout || `exit ${result.status}` });
    }
  }
  if (failed.length) {
    warnJson("github.secrets.partial_failure", { repo, synced, failed: failed.map((item) => item.name) });
  } else {
    logJson("github.secrets.synced", { repo, synced });
  }
  return { synced, failed, commands: failed.length ? buildGhSecretCommands(failed.map((item) => item.name), repo) : [] };
}
