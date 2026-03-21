import { auth } from "../../auth";
import HomeClient from "@/components/home/HomeClient";
import { unwrapPageDynamicOnServer, type AppPageDynamicProps } from "@/lib/next/pageDynamicProps";

export default async function Home(props: AppPageDynamicProps) {
  await unwrapPageDynamicOnServer(props);
  const session = await auth();
  const user =
    session?.user?.id && session.user.name
      ? { id: session.user.id, name: session.user.name }
      : null;

  return <HomeClient initialUser={user} />;
}
