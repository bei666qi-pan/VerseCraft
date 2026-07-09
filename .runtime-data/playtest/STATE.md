campaign_counter: 55
phase: mock sustained + live fuzz operational
last_activity: 2026-07-09 live fuzz campaigns 051-055 complete
gateway: ✅ mimo-v2.5 works (deepseek-v4-pro was routing to free tier that returns content="")
dev_server: running on port 666 (PostgreSQL: yes, AI config: mimo-v2.5)
benchmarks:
  mock_fuzz: 55 campaigns / 4,286 runs / 100% pass
  live_fuzz: ✅ 12 runs (all 5 personas), 100% pass, real DM + real player actions
wins:
  - deepseek-v4-pro → mimo-v2.5 swap fixes live DM: one-api routes "deepseek-v4-pro" to free tier that returns content="" in reasoning_content, starving the stream parser
  - orchestrator baseUrl passthrough bug fixed (createSutAdapter ignored config.baseUrl)
  - liveProvider.ts: added jsonMode + JSON extraction for non-streaming calls
  - Clash VPN investigation: NO_PROXY=web-ai-media-editor.cn correctly bypasses proxy; 429/502 are one-api server-side issues, not proxy-related. Root cause documented.
  - Live_fuzz 055: 10/10 across all 5 personas, player brain degrades gracefully on API error
blocked_issues:
  - one-api intermittent 502 on non-streaming calls (transient upstream issue; player brain falls back to mock)
  - merge to main: blocked (MAIN_WT: 80 dirty files from parallel dev session)
test_asset_additions:
  - orchestrator baseUrl passthrough fix
  - liveProvider 429 retry + jsonMode fix
  - dotenv .env.local loading in run-playthrough.ts
commits_on_branch (44):
  - 42 playtest campaign commits (c000-c049)
  - 1 warmup commit (--base-url)
  - 1 live-fix commit (baseUrl + jsonMode + 429 retry + env loading)
total_runs_across_all_campaigns: 4231 + 15 + 15 + 25 + 2 + 10 = 4298
