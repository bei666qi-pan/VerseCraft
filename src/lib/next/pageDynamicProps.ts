// src/lib/next/pageDynamicProps.ts
/**
 * Next.js 15+ passes `params` / `searchParams` as Promises. Server pages must `await`;
 * client pages must `use()` (see `useClientPageDynamicProps`).
 */
export const emptyPageDynamic = Promise.resolve({}) as Promise<
  Record<string, string | string[] | undefined>
>;

export type AppPageDynamicProps = {
  params?: Promise<Record<string, string | string[] | undefined>>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function unwrapPageDynamicOnServer(props: AppPageDynamicProps): Promise<void> {
  await (props.params ?? emptyPageDynamic);
  await (props.searchParams ?? emptyPageDynamic);
}
