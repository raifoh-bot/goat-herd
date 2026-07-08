import { Resend } from "resend";
import { logger } from "./logger";

/**
 * Email delivery is gated behind configuration so the app degrades gracefully
 * when it isn't set up (e.g. local dev). Sending requires BOTH a Resend API key
 * (`RESEND_API_KEY`) and a verified from-address (`EMAIL_FROM_ADDRESS`). When
 * either is missing we skip the network call and log the intended link instead,
 * so the forgot-password flow still works end-to-end for developers.
 */
function getFromAddress(): string | undefined {
  const from = process.env.EMAIL_FROM_ADDRESS?.trim();
  return from ? from : undefined;
}

function getResendClient(): Resend | undefined {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  return apiKey ? new Resend(apiKey) : undefined;
}

/** True when Resend delivery is fully configured (API key + from-address). */
export function isEmailConfigured(): boolean {
  return getResendClient() !== undefined && getFromAddress() !== undefined;
}

/**
 * Sends a password reset email containing the one-time reset link. If email is
 * not configured, the link is logged (never the token to a user) and the call
 * resolves successfully so the caller's flow is unaffected. Delivery failures
 * are logged and swallowed — the API always returns a neutral response to avoid
 * leaking whether an account (or its email) exists.
 */
export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const resend = getResendClient();
  const from = getFromAddress();

  if (!resend || !from) {
    logger.warn(
      { to, resetUrl },
      "Email not configured (set RESEND_API_KEY and EMAIL_FROM_ADDRESS); logging reset link instead of sending",
    );
    return;
  }

  try {
    const { error } = await resend.emails.send({
      from,
      to,
      subject: "Reset your MyGoatHerd password",
      html: renderResetEmailHtml(resetUrl),
      text: renderResetEmailText(resetUrl),
    });
    if (error) {
      logger.error({ err: error, to }, "Resend reported an error sending the reset email");
      return;
    }
    logger.info({ to }, "Sent password reset email");
  } catch (err) {
    logger.error({ err, to }, "Failed to send password reset email");
  }
}

function renderResetEmailHtml(resetUrl: string): string {
  return `
    <div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1f2937;">
      <h1 style="font-size: 20px; margin-bottom: 8px;">Reset your password</h1>
      <p style="font-size: 14px; line-height: 1.6; color: #4b5563;">
        We received a request to reset your MyGoatHerd password. Click the button
        below to choose a new one. This link expires in 1 hour.
      </p>
      <p style="margin: 24px 0;">
        <a href="${resetUrl}"
           style="background: #16a34a; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 8px; font-size: 14px; font-weight: 600; display: inline-block;">
          Reset Password
        </a>
      </p>
      <p style="font-size: 12px; line-height: 1.6; color: #6b7280;">
        If the button doesn't work, copy and paste this link into your browser:<br />
        <a href="${resetUrl}" style="color: #16a34a; word-break: break-all;">${resetUrl}</a>
      </p>
      <p style="font-size: 12px; line-height: 1.6; color: #6b7280;">
        If you didn't request this, you can safely ignore this email — your
        password won't change.
      </p>
    </div>
  `;
}

function renderResetEmailText(resetUrl: string): string {
  return [
    "Reset your MyGoatHerd password",
    "",
    "We received a request to reset your password. Open the link below to choose a new one. This link expires in 1 hour.",
    "",
    resetUrl,
    "",
    "If you didn't request this, you can safely ignore this email — your password won't change.",
  ].join("\n");
}
