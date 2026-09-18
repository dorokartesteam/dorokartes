import fs from "node:fs";

const file = "lib/public/data.ts";
if (!fs.existsSync(file)) {
  console.error("Missing lib/public/data.ts");
  process.exit(1);
}

let s = fs.readFileSync(file, "utf8");

if (!s.includes("mediaAssets:")) {
  const needle = `  variants: {`;
  const insert = `  mediaAssets: {
    where: { OR: [{ usageStatus: null }, { usageStatus: "ACTIVE" }] },
    orderBy: [{ isPrimary: "desc" as const }, { createdAt: "asc" as const }],
    take: 3,
    select: {
      id: true,
      url: true,
      altText: true,
      sourceUrl: true,
      isPrimary: true,
      usageStatus: true,
    },
  },
`;

  if (!s.includes(needle)) {
    console.error("Could not locate variants block in publicCardSelect.");
    process.exit(1);
  }

  s = s.replace(needle, insert + needle);
}

fs.writeFileSync(file, s, "utf8");
console.log("Added mediaAssets to publicCardSelect.");
