import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

type FallbackUser = {
  id: string;
  name: string;
  password: string;
};

const STORE_DIR = path.join(process.cwd(), ".runtime-data");
const STORE_PATH = path.join(STORE_DIR, "fallback-users.json");

async function ensureStore(): Promise<void> {
  await fs.mkdir(STORE_DIR, { recursive: true });
  try {
    await fs.access(STORE_PATH);
  } catch {
    await fs.writeFile(STORE_PATH, "[]", "utf8");
  }
}

async function readUsers(): Promise<FallbackUser[]> {
  await ensureStore();
  const raw = await fs.readFile(STORE_PATH, "utf8");
  try {
    const parsed = JSON.parse(raw) as FallbackUser[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeUsers(users: FallbackUser[]): Promise<void> {
  await ensureStore();
  await fs.writeFile(STORE_PATH, JSON.stringify(users, null, 2), "utf8");
}

export async function getFallbackUserByName(name: string): Promise<FallbackUser | null> {
  const users = await readUsers();
  const found = users.find((u) => u.name === name);
  return found ?? null;
}

export async function createFallbackUser(name: string, password: string): Promise<FallbackUser> {
  const users = await readUsers();
  const existing = users.find((u) => u.name === name);
  if (existing) return existing;

  const created: FallbackUser = {
    id: randomUUID(),
    name,
    password,
  };
  users.push(created);
  await writeUsers(users);
  return created;
}
