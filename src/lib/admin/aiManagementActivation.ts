export async function probeAllBeforeCommit<T>(input: {
  candidates: readonly T[];
  probe: (candidate: T) => Promise<{ ok: boolean; reason?: string }>;
  commit: () => Promise<void>;
}): Promise<void> {
  for (const candidate of input.candidates) {
    const result = await input.probe(candidate);
    if (!result.ok) throw new Error(result.reason || "service_test_failed");
  }
  await input.commit();
}
