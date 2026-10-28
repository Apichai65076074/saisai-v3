import { getLang } from "@/lib/auth";
import { errorMessage } from "@/lib/i18n";
export default async function NotFound() {
  return <h1>{errorMessage(await getLang(), "CLAIM_NOT_FOUND")}</h1>;
}
