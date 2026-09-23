type InviteEmailInput = {
  to: string;
  contactName?: string | null;
  merchantName: string;
  inviteUrl: string;
};

type LoginLink = {
  merchantName: string;
  url: string;
};

function emailConfig() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from =
    process.env.DOROKARTES_MERCHANT_FROM?.trim() ||
    process.env.DOROKARTES_LEADS_FROM?.trim();

  return { apiKey, from };
}

async function sendEmail(payload: {
  to: string;
  subject: string;
  html: string;
}) {
  const { apiKey, from } = emailConfig();
  if (!apiKey || !from) return { sent: false as const, reason: "not-configured" as const };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [payload.to],
      subject: payload.subject,
      html: payload.html,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("Dorokartes merchant email failed", response.status, detail.slice(0, 1000));
    return { sent: false as const, reason: "provider-error" as const };
  }

  return { sent: true as const };
}

export async function sendMerchantInvite(input: InviteEmailInput) {
  const greeting = input.contactName
    ? `Γεια σου ${escapeHtml(input.contactName)},`
    : "Γεια σου,";

  return sendEmail({
    to: input.to,
    subject: `Dorokartes — πρόσκληση για το ${input.merchantName}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#14213d">
        <h2 style="margin:0 0 18px">Η επιχείρησή σου εγκρίθηκε στο Dorokartes</h2>
        <p>${greeting}</p>
        <p style="line-height:1.7">
          Η πρόσβαση για το <strong>${escapeHtml(input.merchantName)}</strong> είναι έτοιμη.
          Πάτησε το κουμπί για να ενεργοποιήσεις τον merchant λογαριασμό σου.
        </p>
        <p style="margin:28px 0">
          <a href="${escapeHtml(input.inviteUrl)}"
             style="display:inline-block;padding:14px 20px;border-radius:12px;background:#315fe9;color:white;text-decoration:none;font-weight:700">
             Ενεργοποίηση λογαριασμού
          </a>
        </p>
        <p style="font-size:12px;color:#77839a;line-height:1.6">
          Ο σύνδεσμος είναι προσωπικός και λήγει σε 7 ημέρες.
        </p>
      </div>
    `,
  });
}

export async function sendMerchantLoginLinks(input: {
  to: string;
  links: LoginLink[];
}) {
  const items = input.links
    .map(
      (link) => `
        <p style="margin:12px 0">
          <a href="${escapeHtml(link.url)}"
             style="display:block;padding:13px 16px;border:1px solid #e4e8f2;border-radius:12px;text-decoration:none;color:#21395e">
            <strong>${escapeHtml(link.merchantName)}</strong><br>
            <span style="font-size:12px;color:#728098">Σύνδεση στο merchant portal →</span>
          </a>
        </p>
      `,
    )
    .join("");

  return sendEmail({
    to: input.to,
    subject: "Dorokartes — σύνδεση στο Merchant Portal",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#14213d">
        <h2 style="margin:0 0 18px">Σύνδεση στο Dorokartes Merchant Portal</h2>
        <p style="line-height:1.7">
          Επίλεξε την επιχείρηση στην οποία θέλεις να συνδεθείς.
          Οι σύνδεσμοι λήγουν σε 15 λεπτά.
        </p>
        ${items}
      </div>
    `,
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
