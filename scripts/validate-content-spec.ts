import { validateQingshiContent } from "@/lib/worlds/xingni/qingshiContent";
import { validateQingshiProductionContent } from "@/lib/worlds/xingni/qingshiProductionContent";
import { WORLD_CATALOG, WORLD_MAP_CATALOG } from "@/lib/worlds/catalog";

const issues = [...validateQingshiContent(), ...validateQingshiProductionContent()];

for (const world of Object.values(WORLD_CATALOG)) {
  for (const mapId of world.maps) {
    const map = WORLD_MAP_CATALOG[mapId];
    if (!map) issues.push(`世界 ${world.id} 引用了未登记地图 ${mapId}`);
    else if (map.worldId !== world.id) issues.push(`地图 ${mapId} 的世界归属不一致`);
  }
}

if (issues.length > 0) {
  console.error(`内容校验失败（${issues.length}）`);
  for (const issue of issues) console.error(`- ${issue}`);
  process.exitCode = 1;
} else {
  console.log(`内容校验通过：${Object.keys(WORLD_CATALOG).length} 个世界，${Object.keys(WORLD_MAP_CATALOG).length} 张地图，青石县固定内容无冲突。`);
}
