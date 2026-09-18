import fs from "node:fs";

const targets = ["proxy.ts", "middleware.ts", "src/proxy.ts", "src/middleware.ts"];
const existing = targets.filter((p) => fs.existsSync(p));

if (existing.length) {
  console.error(
    "STOP: Existing request interception file found:\n" +
      existing.map((x) => `- ${x}`).join("\n") +
      "\nMerge manually instead of overwriting it."
  );
  process.exit(1);
}

fs.copyFileSync(
  "scripts/install-admin-security-v1/proxy.template.ts",
  "proxy.ts"
);

console.log("Installed proxy.ts");
console.log("Protects /admin/* and /api/admin/*");
console.log("Set ADMIN_USER and ADMIN_PASSWORD in Vercel before production deploy.");
