import { getLang } from "@/lib/auth";
import { errorMessage } from "@/lib/i18n";
export default async function NotFound() {
  return (
    <h1 data-testid="not-found-message">
      {errorMessage(await getLang(), "ORDER_NOT_FOUND")}
    </h1>
  );
}
