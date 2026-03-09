import { auth } from "../../auth";
import HomeClient from "@/components/home/HomeClient";

export default async function Home() {
  const session = await auth();
  const user =
    session?.user?.id && session.user.name
      ? { id: session.user.id, name: session.user.name }
      : null;

  return <HomeClient initialUser={user} />;
}
