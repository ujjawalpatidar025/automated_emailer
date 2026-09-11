import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.resolve(__dirname, "../../.env");

function ensure(name, generate) {
  if (process.env[name]) return;
  const value = generate();
  process.env[name] = value;
  try {
    const line = `${name}=${value}\n`;
    if (fs.existsSync(ENV_PATH)) {
      const current = fs.readFileSync(ENV_PATH, "utf8");
      fs.writeFileSync(
        ENV_PATH,
        current.endsWith("\n") || current === "" ? current + line : current + "\n" + line
      );
    } else {
      fs.writeFileSync(ENV_PATH, line);
    }
    console.log(`[env] generated ${name} and saved it to server/.env`);
  } catch (err) {
    console.warn(
      `[env] generated ${name} for this run only (couldn't write server/.env: ${err.message})`
    );
  }
}

/**
 * First-run convenience: if secrets used to sign sessions and encrypt stored
 * Gmail App Passwords aren't set, generate strong random ones and persist
 * them to .env so restarts don't invalidate sessions or stored credentials.
 */
export function bootstrapSecrets() {
  ensure("JWT_SECRET", () => crypto.randomBytes(48).toString("hex"));
  ensure("CREDENTIAL_ENCRYPTION_KEY", () => crypto.randomBytes(32).toString("hex"));
}
