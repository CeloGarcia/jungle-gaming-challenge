import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";
import { init } from "./database";
export async function startMocks() {
  await init();
  const worker = setupWorker(...handlers);
  await worker.start({ onUnhandledRequest: "bypass", quiet: true });
  return worker;
}
