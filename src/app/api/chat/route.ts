import { auth } from "../../../../auth";
import { runPlayerTurnWorkflow } from "@/lib/turnEngine/playerTurnWorkflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Thin HTTP adapter: framework authentication plus the single turn workflow. */
export async function POST(request: Request) {
  return runPlayerTurnWorkflow(request, { authenticate: auth });
}
