#!/usr/bin/env node
import {
  loadLocalEnvFiles,
  logJson,
  parseArgs,
  writeRuntimeText,
} from "./lib/logger.mjs";
import { VolcOpenApiClient } from "./lib/volc-openapi.mjs";

async function main() {
  await loadLocalEnvFiles();
  const args = parseArgs();
  const dryRun = Boolean(args.dryRun);

  const manualSteps = [
    "# CloudMonitor 磁盘使用率告警配置",
    "",
    "1. 打开 https://console.volcengine.com/cloud_monitor/",
    "2. 进入告警中心 > 告警策略",
    "3. 创建告警策略:",
    "   - 策略名称: VerseCraft-Disk-High",
    "   - 资源类型: ECS",
    "   - 资源: 选择 VerseCraft 实例 (i-yegwws9og0qbxysq1sap)",
    "   - 触发条件:",
    "     - 指标: disk_used_percent",
    "     - 阈值: > 85",
    "     - 连续周期: 3",
    "     - 统计周期: 5 分钟",
    "     - 静默时间: 30 分钟",
    "   - 通知方式:",
    "     - (可选) APIG 已关闭。磁盘检查现由 GitHub Actions autoops-schedule.yml 每 10 分钟执行，无需 CloudMonitor 回调",
    "   - 启用: true",
    "",
    "4. 替代方案: 运行 --api 尝试通过 API 创建",
  ].join("\n");

  if (args.api && !dryRun) {
    const client = new VolcOpenApiClient({ dryRun });
    try {
      const response = await client.call({
        service: "cloud_monitor",
        version: "2022-02-01",
        action: "CreateAlarmRule",
        method: "POST",
        body: {
          AlarmRuleName: "versecraft-disk-high",
          MetricName: "disk_used_percent",
          Statistics: "Average",
          ComparisonOperator: ">",
          Threshold: 85,
          EvaluationCount: 3,
          Period: 300,
          SilenceTime: 1800,
          Enable: true,
        },
      });
      logJson("autoops.disk_alert.api_created", { response });
    } catch (error) {
      logJson("autoops.disk_alert.api_failed", {
        error: error.message?.slice(0, 300),
      });
      logJson("autoops.disk_alert.fallback", {
        message: "API not available; use manual steps",
      });
    }
  }

  if (dryRun || args.api) {
    logJson("autoops.disk_alert", {
      dry_run: dryRun,
      api_attempted: Boolean(args.api),
    });
  }

  await writeRuntimeText("disk-alert-setup.md", manualSteps);
  logJson("autoops.disk_alert.manual_steps_written", {
    path: ".ops/autoops/runtime/disk-alert-setup.md",
    api_attempted: Boolean(args.api),
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
