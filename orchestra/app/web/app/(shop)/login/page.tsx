import { getLang } from "@/lib/auth";
import Login from "./view";
export default async function Page() {
  return <Login lang={await getLang()} />;
}
