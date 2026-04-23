import { Resend } from "resend";

type AnalysisCompleteParams = {
  to: string;
  claimNumber: string;
  liabilityScore: number | null;
  scorecardUrl: string;
};

/**
 * Sends a completion notification when Gemini analysis finishes.
 * Silently no-ops if RESEND_API_KEY is not configured.
 */
export async function sendAnalysisCompleteEmail({
  to,
  claimNumber,
  liabilityScore,
  scorecardUrl,
}: AnalysisCompleteParams): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) return;

  const resend = new Resend(apiKey);

  const faultLine =
    liabilityScore != null
      ? `<p style="font-size:15px;color:#374151;">AI Liability Score: <strong>${liabilityScore}%</strong></p>`
      : "";

  await resend.emails.send({
    from,
    to,
    subject: `Analysis complete: Claim ${claimNumber}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <h2 style="font-size:20px;font-weight:600;color:#111827;margin-bottom:8px;">
          Analysis complete
        </h2>
        <p style="font-size:15px;color:#374151;">
          Claim <strong>${claimNumber}</strong> has finished processing.
        </p>
        ${faultLine}
        <p style="font-size:13px;color:#6b7280;margin-top:16px;">
          This analysis is AI-assisted. Final liability determination remains the
          responsibility of the human adjuster and carrier.
        </p>
        <a href="${scorecardUrl}"
           style="display:inline-block;margin-top:20px;padding:10px 20px;background:#111827;color:#fff;
                  border-radius:6px;text-decoration:none;font-size:14px;font-weight:500;">
          View scorecard
        </a>
      </div>
    `,
  });
}
