-- 0022_leaderboard_index.sql
--
-- 为 add-public-leaderboard change 新增排行榜专用索引：
-- 仅登录用户进榜（user_id IS NOT NULL），按 max_floor_score DESC + created_at DESC 排序。
-- 不修改 settlement_histories 表结构，保留 user_created_idx 不影响个人履历契约。

CREATE INDEX IF NOT EXISTS settlement_histories_leaderboard_idx
  ON settlement_histories (max_floor_score DESC, created_at DESC)
  WHERE user_id IS NOT NULL;