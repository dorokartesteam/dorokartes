import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formPlanToDb, planLabel } from "@/lib/merchant/plans";

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
  claimMerchantId?: unknown;
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
    return NextResponse.json({ error: "Μη έγκυρα δεδομένα φόρμας." }, { status: 400 });
  }

  if (text(raw.website2, 100)) {
    return NextResponse.json({ ok: true });
  }

  const businessName = text(raw.businessName, 120);
  const contactName = text(raw.contactName, 120);
  const email = text(raw.email, 180).toLowerCase();
  const phone = text(raw.phone, 40);
  const website = text(raw.website, 240);
  const businessType = text(raw.businessType, 80);
  const region = text(raw.region, 100);
  const category = text(raw.category, 120);
  const giftCardStatus = text(raw.giftCardStatus, 100);
  const giftCardUrl = text(raw.giftCardUrl, 300);
  const planRaw = text(raw.plan, 40);
  const requestedPlan = formPlanToDb(planRaw);
  const message = text(raw.message, 1600);
  const consent = text(raw.consent, 20);
  const claimMerchantId = text(raw.claimMerchantId, 80);

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
    return NextResponse.json({ error: "Το email δεν φαίνεται έγκυρο." }, { status: 400 });
  }

  const claimMerchant = claimMerchantId
    ? await prisma.merchant.findFirst({
        where: { id: claimMerchantId, status: "ACTIVE" },
        select: {
          id: true,
          name: true,
          websiteUrl: true,
          members: { select: { id: true }, take: 1 },
        },
      })
    : null;

  if (claimMerchantId && !claimMerchant) {
    return NextResponse.json(
      { error: "Το προφίλ επιχείρησης δεν είναι πλέον διαθέσιμο για διεκδίκηση." },
      { status: 409 },
    );
  }

  if (claimMerchant && claimMerchant.members.length > 0) {
    return NextResponse.json(
      {
        error:
          "Η επιχείρηση έχει ήδη Merchant Portal. Χρησιμοποίησε τη σελίδα σύνδεσης ή επικοινώνησε μαζί μας.",
      },
      { status: 409 },
    );
  }

  const leadBusinessName = claimMerchant?.name || businessName;
  const leadWebsite = website || claimMerchant?.websiteUrl || null;

  const lead = await prisma.merchantLead.create({
    data: {
      businessName: leadBusinessName,
      contactName,
      email,
      phone,
      website: leadWebsite,
      businessType,
      region: region || null,
      category,
      giftCardStatus,
      giftCardUrl: giftCardUrl || null,
      requestedPlan,
      message: message || null,
      matchedMerchantId: claimMerchant?.id || null,
      status: claimMerchant ? "UNDER_REVIEW" : "SUBMITTED",
    },
  });

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from =
    process.env.DOROKARTES_LEADS_FROM?.trim() ||
    process.env.DOROKARTES_MERCHANT_FROM?.trim();
  const to = process.env.DOROKARTES_LEADS_TO?.trim() || "info@dorokartes.gr";

  if (apiKey && from) {
    const plan = requestedPlan ? planLabel(requestedPlan) : "Δεν έχει αποφασίσει ακόμη";

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:720px;margin:auto;color:#18263d">
        <h2 style="margin:0 0 8px">Νέα εκδήλωση ενδιαφέροντος</h2>
        <p style="margin:0 0 24px;color:#66738a">
          Lead ID: ${escapeHtml(lead.id)}
        </p>
        <table style="width:100%;border-collapse:collapse;border:1px solid #eef1f6">
          ${row("Επιχείρηση", leadBusinessName)}
          ${row("Υπεύθυνος", contactName)}
          ${row("Email", email)}
          ${row("Τηλέφωνο", phone)}
          ${row("Website", leadWebsite || "")}
          ${row("Τύπος", businessType)}
          ${row("Περιφέρεια", region)}
          ${row("Κατηγορία", category)}
          ${row("Δωροκάρτες", giftCardStatus)}
          ${row("URL δωροκάρτας", giftCardUrl)}
          ${row("Πακέτο", plan)}
          ${row("Τύπος lead", claimMerchant ? "Διεκδίκηση υπάρχοντος προφίλ" : "Νέα συνεργασία")}
        </table>
        <div style="margin-top:22px;padding:16px;border-radius:12px;background:#f7f9fc">
          <strong>Μήνυμα</strong>
          <p style="white-space:pre-wrap;line-height:1.6">${escapeHtml(message || "-")}</p>
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
        subject: `${claimMerchant ? "Dorokartes claim" : "Dorokartes lead"}: ${leadBusinessName}`,
        html,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("Dorokartes lead email failed", response.status, detail.slice(0, 1000));
    }
  }

  return NextResponse.json({ ok: true, leadId: lead.id });
}
