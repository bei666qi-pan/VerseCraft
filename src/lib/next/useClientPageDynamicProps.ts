// src/lib/next/useClientPageDynamicProps.ts
"use client";

import { use } from "react";
import { emptyPageDynamic, type AppPageDynamicProps } from "@/lib/next/pageDynamicProps";

/** Call at the top of client `page.tsx` default exports. */
export function useClientPageDynamicProps(props: AppPageDynamicProps): void {
  use(props.params ?? emptyPageDynamic);
  use(props.searchParams ?? emptyPageDynamic);
}
