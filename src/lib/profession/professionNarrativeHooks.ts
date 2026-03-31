import type { ProfessionId, ProfessionProgress, ProfessionStateV1 } from "./types";
import { PROFESSION_REGISTRY } from "./registry";
import { getProfessionTrialIssuer } from "./trials";

export type ProfessionNarrativeCue = {
  code: string;
  title: string;
  line: string;
  profession: ProfessionId;
  npcId: string;
};

function isFirstTrue(prev: boolean | undefined, next: boolean | undefined): boolean {
  return !prev && Boolean(next);
}

/**
 * 从职业进度变化里提取“叙事钩子”——用于被 DM/系统自然写入，
 * 让职业像“被某人看见、被要求证明”而不是菜单操作。
 */
export function extractProfessionNarrativeCues(args: {
  prev: ProfessionStateV1 | null | undefined;
  next: ProfessionStateV1;
}): ProfessionNarrativeCue[] {
  const cues: ProfessionNarrativeCue[] = [];
  for (const [id, prog] of Object.entries(args.next.progressByProfession ?? {}) as Array<[ProfessionId, ProfessionProgress]>) {
    const prevProg = (args.prev?.progressByProfession as any)?.[id] as ProfessionProgress | undefined;
    const issuer = getProfessionTrialIssuer(id);
    const def = PROFESSION_REGISTRY[id];

    if (isFirstTrue(prevProg?.inclinationVisible, prog.inclinationVisible)) {
      cues.push({
        code: `profession.inclination.${id}`,
        title: `倾向显露：${id}`,
        line: `你开始像个「${id}」：${def.playstyle.identityLine}`,
        profession: id,
        npcId: issuer.issuerId,
      });
    }
    if (isFirstTrue(prevProg?.observedByCertifier, prog.observedByCertifier)) {
      cues.push({
        code: `profession.observed.${id}`,
        title: `被看见：${id}`,
        line: `${issuer.issuerName}看你一眼，没多问，只把话说得更硬：要走这条路，就别靠侥幸。`,
        profession: id,
        npcId: issuer.issuerId,
      });
    }
    if (isFirstTrue(prevProg?.trialOffered, prog.trialOffered)) {
      cues.push({
        code: `profession.trial.offered.${id}`,
        title: `试炼授予：${id}`,
        line: `${issuer.issuerName}不跟你讲大道理，只要你证明一件事：你敢把代价算清，也敢把证据带回来。`,
        profession: id,
        npcId: issuer.issuerId,
      });
    }
    if (isFirstTrue(prevProg?.trialAccepted, prog.trialAccepted)) {
      cues.push({
        code: `profession.trial.accepted.${id}`,
        title: `试炼接下：${id}`,
        line: `你把话说出口的那一刻，就不再只是“想试试”。这件事会被记在账上。`,
        profession: id,
        npcId: issuer.issuerId,
      });
    }
    if (isFirstTrue(prevProg?.certified, prog.certified)) {
      cues.push({
        code: `profession.certified.${id}`,
        title: `正式认证：${id}`,
        line: `${issuer.issuerName}把认证当成签字：从今天起，你要用「${id}」的方式活着，不然楼会先把你拆穿。`,
        profession: id,
        npcId: issuer.issuerId,
      });
    }
  }
  return cues.slice(0, 3);
}

