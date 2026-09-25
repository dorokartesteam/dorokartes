import fs from "node:fs";
import path from "node:path";

const shellPath = path.join(process.cwd(), "components", "admin", "AdminShell.tsx");

if (!fs.existsSync(shellPath)) {
  throw new Error(`Missing ${shellPath}`);
}

let shell = fs.readFileSync(shellPath, "utf8");

if (!shell.includes('href: "/admin/growth"')) {
  const navAnchor = '{ label: "Analytics", href: "/admin/analytics", icon: "chart" },';
  if (!shell.includes(navAnchor)) {
    throw new Error(
      "STOP: Could not find the current Analytics nav anchor in components/admin/AdminShell.tsx",
    );
  }
  shell = shell.replace(
    navAnchor,
    `${navAnchor}\n      { label: "Growth", href: "/admin/growth", icon: "chart" },`,
  );
  console.log("PASS: Growth navigation added.");
} else {
  console.log("PASS: Growth navigation already present.");
}

if (!shell.includes('"/admin/growth":')) {
  const titleAnchor =
    '"/admin/analytics": { title: "Analytics", eyebrow: "Traffic & catalog signals" },';
  if (!shell.includes(titleAnchor)) {
    throw new Error(
      "STOP: Could not find the current Analytics title anchor in components/admin/AdminShell.tsx",
    );
  }
  shell = shell.replace(
    titleAnchor,
    `${titleAnchor}\n  "/admin/growth": { title: "Growth", eyebrow: "SEO, traffic & asset evidence" },`,
  );
  console.log("PASS: Growth page metadata added.");
} else {
  console.log("PASS: Growth page metadata already present.");
}

fs.writeFileSync(shellPath, shell, "utf8");
console.log("PASS: Admin Growth / SEO Evidence v2 installer completed.");
