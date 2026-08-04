/**
 * 确定性随机数生成器（seeded RNG）
 *
 * 用途：战斗暴击、掉落、锻造等随机逻辑的确定性测试与重放。
 * 相同 seed → 相同序列，支持失败时输出 seed 并重放。
 *
 * 设计约束：
 * - 纯函数，不依赖 Math.random() 或真实时间
 * - mulberry32 算法：快速、周期 2^32、分布均匀
 * - 序列化友好：seed 是 number，可记录到 trace 中
 */

export interface SeededRng {
  /** 当前种子（已推进后的状态） */
  readonly seed: number;
  /** 返回 [0, 1) 的浮点数 */
  next(): number;
  /** 返回 [0, max) 的整数 */
  nextInt(max: number): number;
  /** 返回 [min, max] 的整数（含两端） */
  nextIntInclusive(min: number, max: number): number;
  /** 从数组中随机选取一个元素 */
  pick<T>(arr: readonly T[]): T;
  /** 克隆当前 RNG 状态（用于分支模拟） */
  clone(): SeededRng;
}

function mulberry32(s: number): () => number {
  let state = s | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class SeededRngImpl implements SeededRng {
  private _seed: number;
  private _next: () => number;
  private _initialSeed: number;

  constructor(seed: number) {
    // 确保 seed 是正整数，但允许 0
    this._initialSeed = seed;
    this._seed = seed;
    this._next = mulberry32(seed);
  }

  get seed(): number {
    return this._seed;
  }

  next(): number {
    const val = this._next();
    this._seed = (this._seed + 1) | 0;
    return val;
  }

  nextInt(max: number): number {
    if (max <= 0) return 0;
    return Math.floor(this.next() * max);
  }

  nextIntInclusive(min: number, max: number): number {
    const range = max - min + 1;
    return min + this.nextInt(range);
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error("Cannot pick from empty array");
    return arr[this.nextInt(arr.length)]!;
  }

  clone(): SeededRng {
    // mulberry32 是纯函数，每次 next() 推进 state
    // 克隆时需要重新创建并从初始 seed 推进到当前步数
    const cloneRng = new SeededRngImpl(this._initialSeed);
    // 推进到相同步数
    for (let i = this._initialSeed; i < this._seed; i++) {
      cloneRng._next();
      cloneRng._seed = (cloneRng._seed + 1) | 0;
    }
    return cloneRng;
  }
}

/**
 * 创建一个确定性随机数生成器。
 * @param seed 随机种子（默认为 42）。记录此值以便重放失败场景。
 */
export function createSeededRng(seed: number = 42): SeededRng {
  return new SeededRngImpl(seed);
}

/**
 * 生成随机种子（用于测试初始化）。
 * 仅在测试非确定性场景时使用；生产代码不应调用此函数。
 */
export function randomTestSeed(): number {
  return (Math.random() * 2147483647) | 0;
}
