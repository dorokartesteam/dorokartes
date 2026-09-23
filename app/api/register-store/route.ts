import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type InterestPayload = {
  businessName?: unknown;
  contactName?: unknown;
  email?: unknown;
  phone?: unknown;
  website?: unknown;
  businessType?: unknown;
  region?: unknown;
  category?: unknown;
  giftCardStatus?: unknown;
  giftCardUrl?: unknown;
  plan?: unknown;
  message?: unknown;
  consent?: unknown;
  website2?: unknown;
};

const packageLabels: Record<string, string> = {
  undecided: "Δεν έχει αποφασίσει ακόμη",
  partner: "Partner — 9,99€/μήνα",
  featured: "Featured — 19,99€/μήνα",
  premium: "Premium Banner — 39,99€/μήνα",
};

function text(value: unknown, max = 500) {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, max);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function row(label: string, value: string) {
  return `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eef1f6;font-weight:700;color:#3e4b63">${escapeHtml(label)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eef1f6;color:#18263d">${escapeHtml(value || "-")}</td>
    </tr>
  `;
}

export async function POST(request: NextRequest) {
  let raw: InterestPayload;

  try {
    raw = (await request.json()) as InterestPayload;
  } catch {
    return NextResponse.json(
      { error: "Μη έγκυρα δεδομένα φόρμας." },
      { status: 400 },
    );
  }

  const trap = text(raw.website2, 100);
  if (trap) {
    return NextResponse.json({ ok: true });
  }

  const businessName = text(raw.businessName, 120);
  const contactName = text(raw.contactName, 120);
  const email = text(raw.email, 180);
  const phone = text(raw.phone, 40);
  const website = text(raw.website, 240);
  const businessType = text(raw.businessType, 80);
  const region = text(raw.region, 100);
  const category = text(raw.category, 120);
  const giftCardStatus = text(raw.giftCardStatus, 100);
  const giftCardUrl = text(raw.giftCardUrl, 300);
  const planKey = text(raw.plan, 40) || "undecided";
  const plan = packageLabels[planKey] || planKey;
  const message = text(raw.message, 1600);
  const consent = text(raw.consent, 20);

  if (
    !businessName ||
    !contactName ||
    !email ||
    !phone ||
    !businessType ||
    !category ||
    !giftCardStatus ||
    consent !== "yes"
  ) {
    return NextResponse.json(
      { error: "Συμπλήρωσε όλα τα υποχρεωτικά πεδία." },
      { status: 400 },
    );
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "Το email δεν φαίνεται έγκυρο." },
      { status: 400 },
    );
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.DOROKARTES_LEADS_FROM?.trim();
  const to =
    process.env.DOROKARTES_LEADS_TO?.trim() || "info@dorokartes.gr";

  if (!apiKey || !from) {
    return NextResponse.json(
      {
        error: "Η online αποστολή δεν έχει ρυθμιστεί ακόμα.",
        fallback: "mailto",
      },
      { status: 503 },
    );
  }

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:720px;margin:auto;color:#18263d">
      <h2 style="margin:0 0 8px">Νέα εκδήλωση ενδιαφέροντος</h2>
      <p style="margin:0 0 24px;color:#66738a">
        Νέο merchant lead από το Dorokartes.gr
      </p>

      <table style="width:100%;border-collapse:collapse;border:1px solid #eef1f6;border-radius:12px;overflow:hidden">
        ${row("Επιχείρηση", businessName)}
        ${row("Υπεύθυνος", contactName)}
        ${row("Email", email)}
        ${row("Τηλέφωνο", phone)}
        ${row("Website", website)}
        ${row("Τύπος επιχείρησης", businessType)}
        ${row("Περιφέρεια", region)}
        ${row("Κατηγορία", category)}
        ${row("Δωροκάρτες", giftCardStatus)}
        ${row("URL δωροκάρτας", giftCardUrl)}
        ${row("Πακέτο ενδιαφέροντος", plan)}
      </table>

      <div style="margin-top:22px;padding:16px;border-radius:12px;background:#f7f9fc">
        <strong>Μήνυμα</strong>
        <p style="white-space:pre-wrap;line-height:1.6;margin:8px 0 0">${escapeHtml(message || "-")}</p>
      </div>
    </div>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: email,
      subject: `Dorokartes: ${businessName} — ${plan}`,
      html,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");

    console.error("Dorokartes interest email failed", {
      status: response.status,
      detail: detail.slice(0, 1000),
    });

    return NextResponse.json(
      { error: "Δεν ήταν δυνατή η αποστολή αυτή τη στιγμή." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
