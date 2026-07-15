// One-off script to scaffold the TWA project non-interactively, equivalent
// to `bubblewrap init` but scriptable. Safe to delete after the project is
// generated once.
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");

const core = require("C:/nvm4w/nodejs/node_modules/@bubblewrap/cli/node_modules/@bubblewrap/core");
const { TwaManifest, TwaGenerator, KeyTool, JdkHelper, Config, ConsoleLog } = core;

const TARGET_DIR = "C:/xampp/htdocs/wais/android";
const WEB_MANIFEST_URL = "https://wais-eight.vercel.app/manifest.json";
const PACKAGE_ID = "app.vercel.wais_eight.twa";

async function main() {
  const config = await Config.loadConfig("C:/Users/Admin/.bubblewrap/config.json");
  const log = new ConsoleLog("scaffold");

  let twaManifest = await TwaManifest.fromWebManifest(WEB_MANIFEST_URL);
  twaManifest.packageId = PACKAGE_ID;
  twaManifest.signingKey.path = path.join(TARGET_DIR, "android.keystore");
  twaManifest.signingKey.alias = "wais";

  await fs.promises.mkdir(TARGET_DIR, { recursive: true });
  await twaManifest.saveToFile(path.join(TARGET_DIR, "twa-manifest.json"));

  const generator = new TwaGenerator();
  await generator.createTwaProject(TARGET_DIR, twaManifest, log);

  const jdkHelper = new JdkHelper(process, config);
  const keytool = new KeyTool(jdkHelper, log);

  const keystorePassword = crypto.randomBytes(18).toString("base64url");
  const keyPassword = crypto.randomBytes(18).toString("base64url");

  await keytool.createSigningKey({
    fullName: "Wais",
    organizationalUnit: "Wais",
    organization: "Wais",
    country: "US",
    password: keystorePassword,
    keypassword: keyPassword,
    alias: twaManifest.signingKey.alias,
    path: twaManifest.signingKey.path,
  });

  // Keystore credentials — needed for every future build/signing. Kept out
  // of git via android/.gitignore.
  const credsPath = path.join(TARGET_DIR, "keystore-credentials.json");
  await fs.promises.writeFile(
    credsPath,
    JSON.stringify(
      { keystorePassword, keyPassword, alias: twaManifest.signingKey.alias },
      null,
      2,
    ),
  );

  console.log("DONE");
  console.log("twa-manifest.json packageId:", twaManifest.packageId);
  console.log("Keystore:", twaManifest.signingKey.path);
  console.log("Credentials saved to:", credsPath);
}

main().catch((err) => {
  console.error("SCAFFOLD_ERROR", err);
  process.exit(1);
});
