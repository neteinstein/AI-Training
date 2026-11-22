import { execFileSync } from "node:child_process";

/**
 * The suite signs in as the demo accounts, so make sure they exist. The seed script is safe
 * to run repeatedly and refuses to touch anything but a local Supabase stack.
 */
export default function globalSetup() {
  execFileSync("npm", ["run", "seed:dev"], { stdio: "inherit" });
}
