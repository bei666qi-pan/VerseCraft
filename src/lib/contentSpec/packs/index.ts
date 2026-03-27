import type { ContentPack } from "../types";
import { baseApartmentPack } from "./baseApartmentPack";
import { EXAMPLE_PACK } from "../examples";

// Phase-6: 本地 TS packs（不引入 CMS）；按需扩展。
export const CONTENT_PACKS: readonly ContentPack[] = [baseApartmentPack, EXAMPLE_PACK] as const;

