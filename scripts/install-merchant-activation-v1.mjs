import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function write(rel, content) {
  fs.writeFileSync(path.join(root, rel), content, "utf8");
}

function patchSchema() {
  const rel = "prisma/schema.prisma";
  let source = read(rel);

  if (source.includes("lastFollowUpAt")) {
    console.log("PASS: MerchantLead follow-up tracking fields already present.");
    return;
  }

  const anchor = "  reviewedAt DateTime?\n  createdAt  DateTime @default(now())";
  if (!source.includes(anchor)) {
    throw new Error("Could not find MerchantLead reviewedAt anchor in prisma/schema.prisma");
  }

  source = source.replace(
    anchor,
    "  reviewedAt DateTime?\n\n  lastFollowUpAt    DateTime?\n  lastFollowUpStage String?\n  followUpCount     Int       @default(0)\n\n  createdAt  DateTime @default(now())",
  );

  write(rel, source);
  console.log("PASS: Prisma schema patched with merchant follow-up tracking.");
}

function patchAdminLayout() {
  const rel = "app/admin/layout.tsx";
  let source = read(rel);

  if (source.includes('import "@/app/admin/v4-7-activation.css";')) {
    console.log("PASS: Admin activation CSS import already present.");
    return;
  }

  const anchor = 'import "@/app/admin/v4-6-revenue.css";';
  if (!source.includes(anchor)) {
    throw new Error("Could not find admin revenue CSS import anchor.");
  }

  source = source.replace(anchor, `${anchor}\nimport "@/app/admin/v4-7-activation.css";`);
  write(rel, source);
  console.log("PASS: Admin activation CSS import added.");
}

function patchAdminNav() {
  const rel = "components/admin/AdminShell.tsx";
  let source = read(rel);

  if (source.includes('["Activation", "/admin/activation", "◎"]')) {
    console.log("PASS: Admin Activation navigation already present.");
    return;
  }

  const anchor = '["Revenue", "/admin/revenue", "€"],';
  if (!source.includes(anchor)) {
    throw new Error("Could not find Revenue navigation anchor in AdminShell.tsx");
  }

  source = source.replace(anchor, `${anchor}\n      ["Activation", "/admin/activation", "◎"],`);
  write(rel, source);
  console.log("PASS: Admin Activation navigation added.");
}

function patchEmail() {
  const rel = "lib/merchant/email.ts";
  let source = read(rel);

  if (source.includes("export async function sendMerchantActivationReminder")) {
    console.log("PASS: Merchant activation reminder email already present.");
    return;
  }

  source += `\n\nexport async function sendMerchantActivationReminder(input: {\n  to: string;\n  contactName?: string | null;\n  merchantName: string;\n  stage: \"INVITE_PENDING\" | \"SUBSCRIPTION_PENDING\";\n  actionUrl: string;\n  loginUrl: string;\n}) {\n  const greeting = input.contactName\n    ? \`Γεια σου \${escapeHtml(input.contactName)},\`\n    : \"Γεια σου,\";\n\n  const invitePending = input.stage === \"INVITE_PENDING\";\n\n  return sendEmail({\n    to: input.to,\n    subject: invitePending\n      ? \`Dorokartes — ενεργοποίησε το προφίλ \${input.merchantName}\`\n      : \`Dorokartes — ολοκλήρωσε το setup για το \${input.merchantName}\`,\n    html: \`\n      <div style=\"font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#14213d\">\n        <div style=\"padding:28px;border:1px solid #e7ebf3;border-radius:18px;background:#ffffff\">\n          <p style=\"margin:0 0 8px;font-size:12px;font-weight:700;color:#6b7ca4;letter-spacing:.06em\">DOROKARTES MERCHANT</p>\n          <h2 style=\"margin:0 0 18px;font-size:25px\">\${invitePending ? \"Η πρόσβασή σου είναι έτοιμη\" : \"Απομένει ένα τελευταίο βήμα\"}</h2>\n          <p>\${greeting}</p>\n          <p style=\"line-height:1.7\">\n            \${invitePending\n              ? \`Το προφίλ <strong>\${escapeHtml(input.merchantName)}</strong> έχει εγκριθεί, αλλά η πρόσβαση στο Merchant Portal δεν έχει ενεργοποιηθεί ακόμη. Ο νέος σύνδεσμος παρακάτω είναι ενεργός για 7 ημέρες.\`\n              : \`Το Merchant Portal για το <strong>\${escapeHtml(input.merchantName)}</strong> είναι ενεργό. Για να ενεργοποιηθούν τα Partner / Featured / Premium benefits, επίλεξε το πακέτο που ταιριάζει στην επιχείρησή σου.\`}\n          </p>\n          <p style=\"margin:28px 0\">\n            <a href=\"\${escapeHtml(input.actionUrl)}\" style=\"display:inline-block;padding:14px 20px;border-radius:12px;background:#315fe9;color:white;text-decoration:none;font-weight:700\">\n              \${invitePending ? \"Ενεργοποίηση Merchant Portal\" : \"Δες τα πακέτα\"}\n            </a>\n          </p>\n          \${invitePending ? \"\" : \`<p style=\"font-size:12px;color:#77839a;line-height:1.6\">Αν δεν είσαι ήδη συνδεδεμένος, μπες πρώτα από <a href=\"\${escapeHtml(input.loginUrl)}\" style=\"color:#315fe9\">Merchant Login</a>.</p>\`}\n        </div>\n      </div>\n    \`,\n  });\n}\n`;

  write(rel, source);
  console.log("PASS: Merchant activation reminder email added.");
}

patchSchema();
patchAdminLayout();
patchAdminNav();
patchEmail();
console.log("PASS: Merchant Activation v1 installer completed.");
