import OpenAI from "openai";
import { z } from "zod/v4";
import { zodTextFormat } from "openai/helpers/zod";
import { VERIFICATION_MODEL } from "./config";
import type { EvidencePackage } from "./fetch-evidence";

const client = new OpenAI();

export const PROMPT_VERSION = "gift-card-verifier-v1.2";
export const VERIFICATION_TEMPERATURE: number | null = null;
export const REASONING_EFFORT = "none" as const;

export const VerificationClassification = z.object({
  isGiftCardProgram: z.boolean(),
  pageRole: z.enum([
    "CANONICAL_PURCHASE",
    "CHECKOUT",
    "TERMS",
    "PROMOTION",
    "CONTENT",
    "GIFT_GUIDE",
    "GAMING_VOUCHER",
    "GENERIC",
    "UNKNOWN",
  ]),
  confidence: z.number().min(0).max(1),
  merchantName: z.string().nullable(),
  giftCardType: z.enum([
    "DIGITAL",
    "PHYSICAL",
    "DIGITAL_AND_PHYSICAL",
    "CORPORATE",
    "EXPERIENCE",
    "THIRD_PARTY_PREPAID",
    "UNKNOWN",
  ]),
  purchasePossible: z.boolean(),
  reasonCodes: z.array(z.string()).max(12),
  evidence: z.array(z.string()).max(8),
});

export function buildVerificationPrompt(
  merchantName: string | null,
  merchantWebsite: string | null,
  evidence: EvidencePackage,
) {
  return `
You are the semantic verification layer for Dorokartes.gr.

Classify ONLY the supplied official-page evidence. Do not use outside knowledge.

Definitions:

CANONICAL_PURCHASE
A stable merchant page whose primary purpose is to present or sell the merchant's
general-purpose gift card, e-gift card, or gift voucher.

CHECKOUT
A page specifically used to purchase that gift card.

TERMS
Terms, FAQ, redemption instructions, legal text, or support documentation for a
gift-card program. It can prove a gift-card program exists, but it is NOT the
canonical purchase page.

PROMOTION
A campaign where a voucher/gift card is a reward, discount, or bonus for buying
something else. It is NOT the merchant's canonical gift-card product.

CONTENT / GIFT_GUIDE
Editorial content, events, gift suggestions, collections, wrapping, packaging,
engraving, or ordinary gift products.

GAMING_VOUCHER
Game currency, top-up, game code, or third-party gaming voucher rather than the
merchant's own general-purpose gift card.

Decision discipline:
- isGiftCardProgram=true only when the evidence demonstrates a real merchant gift-card program.
- Never infer DIGITAL or PHYSICAL without direct evidence.
- If evidence is insufficient, partial, blocked, contradictory, or mostly navigation/chrome,
  choose UNKNOWN or GENERIC and lower confidence.
- Confidence 0.95+ is reserved for direct, unambiguous evidence.
- Never call TERMS a CANONICAL_PURCHASE page merely because it proves the program exists.
- Do not assume a merchant has or lacks a gift-card program based on brand knowledge.
- Judge THIS URL only.

Merchant candidate: ${merchantName ?? "unknown"}
Merchant website: ${merchantWebsite ?? "unknown"}
Requested URL: ${evidence.requestedUrl}
Final URL: ${evidence.finalUrl}
Page title: ${evidence.title}
Headings: ${JSON.stringify(evidence.headings)}
CTA / button text: ${JSON.stringify(evidence.ctas)}
Visible page text: ${evidence.visibleText}
`.trim();
}

export async function classifyWithLlm(
  merchantName: string | null,
  merchantWebsite: string | null,
  evidence: EvidencePackage,
) {
  const response = await client.responses.parse({
    model: VERIFICATION_MODEL,
    reasoning: { effort: REASONING_EFFORT },
    input: buildVerificationPrompt(
      merchantName,
      merchantWebsite,
      evidence,
    ),
    text: {
      format: zodTextFormat(
        VerificationClassification,
        "gift_card_verification",
      ),
    },
  });

  if (!response.output_parsed) {
    throw new Error("LLM returned no parsed verification result.");
  }

  const usage: any = response.usage ?? {};

  return {
    classification: response.output_parsed,
    usage: {
      inputTokens:
        usage.input_tokens ??
        usage.inputTokens ??
        null,
      outputTokens:
        usage.output_tokens ??
        usage.outputTokens ??
        null,
      totalTokens:
        usage.total_tokens ??
        usage.totalTokens ??
        null,
    },
  };
}
