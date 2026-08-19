import { getNpcCanonicalIdentity } from "@/lib/registry/npcCanon";

export type PersonaMixupHit = {
  victimNpcId: string;
  leakedFromNpcId: string;
  kind: "appearance" | "speech" | "role";
  token: string;
};

function normalizeId(id: string): string {
  return String(id ?? "").trim().replace(/^n-(\d{3})$/i, "N-$1").toUpperCase();
}

function windowAround(text: string, idx: number, radius: number): string {
  const s = Math.max(0, idx - radius);
  const e = Math.min(text.length, idx + radius);
  return text.slice(s, e);
}

const HIGH_RISK_SIGNATURES: Record<string, { appearance: string[]; speech: string[]; role: string[] }> = {
  // N-001 陈婆婆：织毛衣、银丝、碎花衣裳
  "N-001": {
    appearance: ["银丝", "碎花衣裳", "织毛衣", "毛线", "长椅"],
    speech: ["针脚", "月初", "来得急"],
    role: ["后勤补给", "毛衣", "新来的"],
  },
  // N-002 林医生：白大褂、金丝眼镜、听诊器、消毒水
  "N-002": {
    appearance: ["白大褂", "金丝眼镜", "听诊器", "消毒水"],
    speech: ["体检", "痊愈", "抽血"],
    role: ["诊室", "内科", "流言"],
  },
  // N-003 邮差老王：邮包、信箱、邮戳
  "N-003": {
    appearance: ["邮包", "信箱", "邮戳", "步伐僵硬"],
    speech: ["讣告", "派送", "信"],
    role: ["信件", "投递", "签收"],
  },
  // N-004 小女孩阿花：红色连衣裙、毽子、捉迷藏
  "N-004": {
    appearance: ["红色连衣裙", "毽子", "双马尾"],
    speech: ["捉迷藏", "当鬼", "陪"],
    role: ["楼梯间", "游戏", "骨头"],
  },
  // N-005 周伯：墨镜、盲杖、导盲犬大黄
  "N-005": {
    appearance: ["墨镜", "盲杖", "导盲犬"],
    speech: ["大黄", "走失", "呼唤"],
    role: ["盲人", "走廊", "寻狗"],
  },
  // N-006 退休教师张先生：中山装、报纸、日期
  "N-006": {
    appearance: ["中山装", "报纸", "椅子"],
    speech: ["星期几", "今天"],
    role: ["日期", "时间", "数学"],
  },
  // N-007 叶：画室、抱臂、底稿
  "N-007": {
    appearance: ["抱臂", "底稿", "画室"],
    speech: ["比较", "七层"],
    role: ["画室", "轮廓", "辨认"],
  },
  // N-008 电工老刘：螺丝刀、工作服、电路
  "N-008": {
    appearance: ["工作服", "螺丝刀"],
    speech: ["停电", "线路", "检修"],
    role: ["配电间", "电路", "电源"],
  },
  // N-009 阿织：白色连衣裙、602室、织补缝纫
  "N-009": {
    appearance: ["白色连衣裙", "手拉手", "602"],
    speech: ["镜子"],
    role: ["姐妹", "心脏", "织补", "缝纫"],
  },
  // N-010 欣蓝：登记口、表格、目光沉稳
  "N-010": {
    appearance: ["气质温和", "目光沉稳", "衣着得体"],
    speech: ["表格", "登记", "半行"],
    role: ["登记口", "物业", "转职"],
  },
  // N-011 夜读老人：厚书、老花镜、午夜廊灯
  "N-011": {
    appearance: ["厚书", "老花镜", "廊灯", "封面无字"],
    speech: ["读什么", "书页", "页码"],
    role: ["午夜", "死期", "夜读"],
  },
  // N-012 陶师傅：剁肉、围裙、屠夫
  "N-012": {
    appearance: ["围裙", "暗红", "剁肉"],
    speech: ["试吃", "肉味", "刀"],
    role: ["屠夫", "凌晨", "管道"],
  },
  // N-013 枫：眼尾冷意、线索转运
  "N-013": {
    appearance: ["眼尾", "冷意", "无害"],
    speech: ["玩笑", "口袋"],
    role: ["线索", "转运", "诱导"],
  },
  // N-014 洗衣房阿姨：床单、洗衣机、摇篮曲
  "N-014": {
    appearance: ["床单", "洗衣机", "挽成髻", "折叠"],
    speech: ["摇篮曲", "哼", "小调"],
    role: ["洗衣房", "后勤", "漂白"],
  },
  // N-015 麟泽：旧制式外套、雨痕、守夜
  "N-015": {
    appearance: ["旧制式外套", "披肩", "雨痕"],
    speech: ["边界", "电梯", "唠叨"],
    role: ["守夜", "B1", "巡守"],
  },
  // N-016 章嫂：眼窝深陷、失眠、10F
  "N-016": {
    appearance: ["眼窝深陷", "睡衣", "送餐服"],
    speech: ["10F", "睡不着", "墙"],
    role: ["失眠", "楼梯间", "错层"],
  },
  // N-017 红姨：红色制服、推车、茶壶
  "N-017": {
    appearance: ["红色制服", "推车", "茶壶", "纸杯"],
    speech: ["倒茶", "热茶"],
    role: ["茶水", "管道", "沉淀物"],
  },
  // N-018 北夏：外套轻扬、笑意、市集
  "N-018": {
    appearance: ["外套轻扬", "笑意", "旅行"],
    speech: ["价码", "货源", "夸"],
    role: ["市集", "交易", "委托"],
  },
  // N-019 前调查员：战术背心、笔记、折叠刀
  "N-019": {
    appearance: ["战术背心", "笔记", "折叠刀", "录音"],
    speech: ["调查", "泄漏", "消除"],
    role: ["调查", "1101", "假情报"],
  },
  // N-020 灵伤：补给台、制服、笑容亮
  "N-020": {
    appearance: ["制服", "笑容", "货架", "台面"],
    speech: ["上扬", "可爱", "步骤"],
    role: ["补给", "售卖", "生活引导"],
  },
  // N-021 阿绣：与阿织共享外观/602，独有镜像/取代/更漂亮
  "N-021": {
    appearance: ["白色连衣裙", "手拉手", "602"],
    speech: ["更漂亮", "镜子", "取代"],
    role: ["镜像", "姐妹", "心脏"],
  },
  // N-022 老马：灰蓝马甲、剥桔子、叫不出名
  "N-022": {
    appearance: ["灰蓝马甲", "桔子皮"],
    speech: ["叫不出"],
    role: ["储物间", "面熟"],
  },
  // N-023 蓝盆婶：蓝盆、拧床单、出水
  "N-023": {
    appearance: ["蓝盆", "白色床单"],
    speech: ["侧身", "让路"],
    role: ["洗衣池", "早晨"],
  },
  // N-024 驼背老伯：驼背、旧报纸、日期错
  "N-024": {
    appearance: ["褪色棉袄", "驼背", "旧报纸"],
    speech: ["日期", "装两次"],
    role: ["信箱区", "情报"],
  },
  // N-025 守夜阿瘦：打盹、瘦高、前台午夜
  "N-025": {
    appearance: ["瘦高", "深蓝制服", "打盹"],
    speech: ["几时来"],
    role: ["前台", "午夜班"],
  },
  // N-026 开关姐：按开关、灯不亮
  "N-026": {
    appearance: ["按开关", "走廊尽头"],
    speech: ["灯不亮"],
    role: ["开关", "走廊"],
  },
  // N-027 睡衣姐妹花：睡衣、方便面、非双胞胎
  "N-027": {
    appearance: ["碎花睡衣", "方便面"],
    speech: ["一快一慢"],
    role: ["6F走廊", "情报"],
  },
  // N-028 守夜老吴：钥匙、B2、回声
  "N-028": {
    appearance: ["旧棉袄", "钥匙"],
    speech: ["暗道", "回声"],
    role: ["配电室", "B2"],
  },
  // N-029 前台小周：半框眼镜、登记本、2F
  "N-029": {
    appearance: ["半框眼镜", "登记本"],
    speech: ["不重要", "访客"],
    role: ["2F前台", "登记"],
  },
  // N-030 楼道张师傅：塑料桶、擦地、童谣
  "N-030": {
    appearance: ["塑料桶", "水渍"],
    speech: ["童谣", "哼"],
    role: ["4F楼道", "后勤"],
  },
  // N-031 老画室租户老谢：旧布衫、画室门外、无记录
  "N-031": {
    appearance: ["旧布衫", "眼窝深陷"],
    speech: ["租过", "叶的画"],
    role: ["画室门外", "无记录"],
  },
  // N-032 走廊常驻老陈：褪色运动服、长椅、记名字不记日期
  "N-032": {
    appearance: ["褪色运动服", "长椅", "看窗外"],
    speech: ["现在几号", "日期"],
    role: ["情报提供", "记名字", "6F走廊"],
  },
  // N-033 7F 老住户老吴：旧军装外套、腰背笔直、守7F三十年不记名册
  "N-033": {
    appearance: ["旧军装外套", "腰背笔直", "走廊尽头"],
    speech: ["守了", "名册"],
    role: ["7F", "三十年", "情报"],
  },
  // N-034 7F 点灯阿珍：深色棉布、廊灯、不能全暗
  "N-034": {
    appearance: ["深色棉布", "廊灯", "点亮"],
    speech: ["不能全暗"],
    role: ["点灯", "7F楼道"],
  },
  // N-035 大堂夜班咖啡小弟：咖啡车、旧T恤、出摊
  "N-035": {
    appearance: ["咖啡车", "旧T恤", "出摊"],
    speech: ["咖啡", "来源"],
    role: ["大堂", "深夜", "采购清单"],
  },
  // N-036 访客登记员老秦：半秃顶、老花镜、证件正反面
  "N-036": {
    appearance: ["半秃顶", "老花镜", "登记桌"],
    speech: ["证件", "正面", "背面"],
    role: ["保安室", "访客", "登记"],
  },
  // N-037 2F 退休护理员方姨：护士服改便装、走路慢、量血压
  "N-037": {
    appearance: ["护士服", "走路很慢", "腰间"],
    speech: ["量血压", "该量", "老毛病"],
    role: ["护理员", "巡视", "2F走廊"],
  },
  // N-038 3F 楼梯常住户阿芳：短发、布包、不等电梯
  "N-038": {
    appearance: ["短发", "布包", "楼梯间"],
    speech: ["电梯", "太静", "脚步声"],
    role: ["楼梯", "3F", "不等电梯"],
  },
  // N-039 4F 王老师：旧中山装、老花镜、401室、与张先生错日共住
  "N-039": {
    appearance: ["旧中山装", "老花镜", "401"],
    speech: ["语文", "错开", "从未照面"],
    role: ["4F", "401室", "情报"],
  },
  // N-040 5F 画室学生小林：旧围裙、颜料洗不掉、画了就消失
  "N-040": {
    appearance: ["旧围裙", "颜料", "洗不掉"],
    speech: ["画了就会消失"],
    role: ["画室", "学生"],
  },
  // N-041 6F 夜猫子小郑：旧卫衣、耳机不放音乐、楼自己说话
  "N-041": {
    appearance: ["旧卫衣", "耳机", "窗台"],
    speech: ["楼自己说话", "放别的"],
    role: ["6F", "凌晨"],
  },
  // N-042 7F 窗台老人老庄：空茶杯、窗台边坐、只闻不喝
  "N-042": {
    appearance: ["空茶杯", "窗台边", "旧中山装"],
    speech: ["倒茶", "闻茶香"],
    role: ["7F", "窗台", "情报"],
  },
  // N-043 B1 锅炉工老钱：旧工装、炉火发红、蹲着抽烟、不能停
  "N-043": {
    appearance: ["旧工装", "炉火", "蹲着抽烟", "发红"],
    speech: ["不能停", "停下就凉了", "有人哭"],
    role: ["锅炉房", "锅炉"],
  },
  // N-044 廖暗：粉笔、动线、隐藏通道
  "N-044": {
    appearance: ["粉笔", "深色外套", "领口"],
    speech: ["动线", "通道", "隐藏"],
    role: ["逃生", "旁观", "异常模式"],
  },
  // N-045 苏弥：针织衫、记忆碎片、情绪缓冲
  "N-045": {
    appearance: ["针织衫", "袖口磨白", "侧头"],
    speech: ["记忆", "碎片", "平衡"],
    role: ["情绪缓冲", "共情", "收容"],
  },
};

function findNpcName(npcId: string): string {
  const canon = getNpcCanonicalIdentity(npcId);
  return canon.canonicalName || canon.npcId;
}

export function detectPersonaMixup(args: {
  narrative: string;
  presentNpcIds: string[];
  focusNpcId: string | null;
}): { hits: PersonaMixupHit[] } {
  const narrative = String(args.narrative ?? "");
  const present = new Set((args.presentNpcIds ?? []).map(normalizeId));
  const candidates = new Set<string>();
  if (args.focusNpcId) candidates.add(normalizeId(args.focusNpcId));
  for (const id of present) candidates.add(id);
  // Only check a small subset for cost control.
  const npcIds = [...candidates].filter((id) => id in HIGH_RISK_SIGNATURES).slice(0, 6);
  const hits: PersonaMixupHit[] = [];

  for (const victim of npcIds) {
    const victimName = findNpcName(victim);
    const idx = narrative.indexOf(victimName);
    if (idx === -1) continue;
    const local = windowAround(narrative, idx, 220);
    for (const leakedFrom of npcIds) {
      if (leakedFrom === victim) continue;
      const sig = HIGH_RISK_SIGNATURES[leakedFrom];
      const check = (kind: PersonaMixupHit["kind"], tokens: string[]) => {
        for (const tk of tokens) {
          if (local.includes(tk)) {
            hits.push({ victimNpcId: victim, leakedFromNpcId: leakedFrom, kind, token: tk });
            return;
          }
        }
      };
      check("appearance", sig.appearance);
      check("speech", sig.speech);
      check("role", sig.role);
    }
  }
  return { hits };
}

export function rewritePersonaMixupConservatively(args: {
  narrative: string;
  hits: PersonaMixupHit[];
}): { narrative: string; changed: boolean } {
  const src = String(args.narrative ?? "");
  if (!src || args.hits.length === 0) return { narrative: src, changed: false };
  let out = src;
  // Conservative: only scrub the leaked token itself.
  for (const h of args.hits.slice(0, 6)) {
    // Replace ALL occurrences of the leaked token to fully remove persona leaks.
    const re = new RegExp(h.token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    out = out.replaceAll(re, "（略）");
  }
  // Light cosmetic cleanup: remove repeated placeholders.
  out = out.replace(/（略）(?:\s*（略）)+/g, "（略）");
  return { narrative: out, changed: out !== src };
}
