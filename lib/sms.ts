// VoIP.ms REST API client for sending the automated thank-you text.
// Needs VOIPMS_API_USERNAME, VOIPMS_API_PASSWORD, VOIPMS_DID in env.
// See SETUP.md for where to find these in the VoIP.ms portal.
//
// Docs: https://voip.ms/m/apidocs.php (method=sendSMS)
// Note: VoIP.ms limits SMS sent via the API to 100/day per account.

const VOIPMS_API_URL = "https://voip.ms/api/v1/rest.php";

// VoIP.ms wants a plain 10-digit US/Canada number, no leading "1" or "+1".
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits.slice(-10);
}

// This DID sends outbound only — there's no inbound texting set up on it,
// so the message points parents to a phone call instead of "reply anytime."
const SITE_PHONES: Record<string, string> = {
  "Noah's Arks": "(972) 564-0488",
  "Light House Academy": "(972) 772-5800",
};

export function thankYouMessage(params: {
  parentFirst: string;
  childFirst: string | null;
  child2First?: string | null;
  site: string;
}): string {
  const { parentFirst, childFirst, child2First, site } = params;
  // Two kids: keep it generic rather than naming only one.
  const child = child2First ? "your kids" : childFirst || "your family";
  const phone = SITE_PHONES[site];
  const cta = phone ? `Call us at ${phone} with any questions!` : "Call us with any questions!";
  // Kept under 160 characters so it always sends as a single SMS.
  return `Hi ${parentFirst}! Thanks for touring ${site} today. We'd love to have ${child} join us. ${cta}`;
}

export async function sendSms(to: string, body: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiUsername = process.env.VOIPMS_API_USERNAME;
  const apiPassword = process.env.VOIPMS_API_PASSWORD;
  const did = process.env.VOIPMS_DID;

  if (!apiUsername || !apiPassword || !did) {
    return { ok: false, error: "VoIP.ms is not configured (missing VOIPMS_API_USERNAME/API_PASSWORD/DID)." };
  }

  const dst = normalizePhone(to);
  if (dst.length !== 10) {
    return { ok: false, error: `Phone number "${to}" doesn't look like a valid 10-digit US/Canada number.` };
  }

  const params = new URLSearchParams({
    api_username: apiUsername,
    api_password: apiPassword,
    method: "sendSMS",
    did,
    dst,
    message: body,
  });

  try {
    const res = await fetch(`${VOIPMS_API_URL}?${params.toString()}`, { method: "GET" });
    if (!res.ok) {
      return { ok: false, error: `VoIP.ms HTTP error ${res.status}` };
    }
    const data = await res.json().catch(() => null);
    if (!data || data.status !== "success") {
      return { ok: false, error: `VoIP.ms error: ${data?.status ?? "unknown response"}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error sending SMS." };
  }
}
