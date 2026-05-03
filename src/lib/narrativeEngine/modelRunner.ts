import { generateMainReply } from "@/lib/ai/logicalTasks";

export { generateMainReply };

export type RunNarrativeModelStreamArgs = Parameters<typeof generateMainReply>[0];
export type RunNarrativeModelStreamResult = Awaited<ReturnType<typeof generateMainReply>>;

export function runNarrativeModelStream(
  args: RunNarrativeModelStreamArgs
): Promise<RunNarrativeModelStreamResult> {
  return generateMainReply(args);
}
