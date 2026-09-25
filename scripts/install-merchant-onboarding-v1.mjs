import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const merchantLayoutPath = path.join(root, "app", "merchant", "layout.tsx");

if (!fs.existsSync(merchantLayoutPath)) {
  throw new Error(`Missing required file: ${merchantLayoutPath}`);
}

let layout = fs.readFileSync(merchantLayoutPath, "utf8");
const importLine = 'import "./merchant-v4-3-onboarding.css";';

if (layout.includes(importLine)) {
  console.log("SKIP: Merchant onboarding CSS import already present.");
} else {
  const anchors = [
    'import "./merchant-v4-2-analytics.css";',
    'import "./merchant-v4-1.css";',
    'import "./merchant-v4.css";',
  ];

  const anchor = anchors.find((candidate) => layout.includes(candidate));
  if (!anchor) {
    throw new Error("Could not locate a V4 merchant CSS import in app/merchant/layout.tsx.");
  }

  layout = layout.replace(anchor, `${anchor}\n${importLine}`);
  fs.writeFileSync(merchantLayoutPath, layout, "utf8");
  console.log("PASS: Merchant onboarding CSS import added.");
}

console.log("PASS: Merchant Onboarding v1 installer completed.");
