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

/**
 * Real delivery is restricted to the published production app. Development and
 * test runs (including automated test agents exercising the sign-up flow) log
 * the would-be email instead of sending it.
 *
 * NOTE: tests run with NODE_ENV=production, so the gate keys off
 * REPLIT_DEPLOYMENT (set only in the deployed environment). Set
 * EMAIL_DELIVERY_OVERRIDE=true to deliberately send real emails from dev.
 */
function isEmailDeliveryEnabled(): boolean {
  if (process.env.EMAIL_DELIVERY_OVERRIDE?.trim().toLowerCase() === "true") return true;
  return Boolean(process.env.REPLIT_DEPLOYMENT?.trim());
}

/**
 * Returns true when the email should actually be sent. Otherwise logs the
 * would-be email (recipient + subject + any extra context) and returns false.
 */
function shouldDeliver(to: string, subject: string, extra: Record<string, unknown> = {}): boolean {
  if (isEmailDeliveryEnabled()) return true;
  logger.info(
    { to, subject, ...extra },
    "Email delivery disabled outside production (set EMAIL_DELIVERY_OVERRIDE=true to send from dev); logging instead of sending",
  );
  return false;
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

  if (!shouldDeliver(to, "Reset your MyGoatHerd password", { resetUrl })) return;

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

export type NewFarmNotification = {
  farmName: string;
  farmSlug: string;
  adminUsername: string;
  adminEmail: string;
  registeredAt: Date;
  /** Absolute link to the super-admin farms panel. */
  panelUrl: string;
  /** Secure one-click approval link (token-based, expiring, single-use). */
  approveUrl: string;
};

/**
 * Notifies a platform super-admin that a new farm self-registered. Follows the
 * same degrade-gracefully contract as the reset email: with no Resend config
 * the details are logged instead of sent, and delivery failures are swallowed
 * so a failed email can never affect the registration itself.
 */
export async function sendNewFarmNotificationEmail(
  to: string,
  details: NewFarmNotification,
): Promise<void> {
  const resend = getResendClient();
  const from = getFromAddress();

  if (!resend || !from) {
    logger.warn(
      { to, ...details },
      "Email not configured (set RESEND_API_KEY and EMAIL_FROM_ADDRESS); logging new-farm notification instead of sending",
    );
    return;
  }

  if (!shouldDeliver(to, `New farm registered: ${details.farmName}`, { farmSlug: details.farmSlug })) return;

  try {
    const { error } = await resend.emails.send({
      from,
      to,
      subject: `New farm registered: ${details.farmName}`,
      html: renderNewFarmEmailHtml(details),
      text: renderNewFarmEmailText(details),
    });
    if (error) {
      logger.error({ err: error, to }, "Resend reported an error sending the new-farm notification");
      return;
    }
    logger.info({ to, farmSlug: details.farmSlug }, "Sent new-farm notification email");
  } catch (err) {
    logger.error({ err, to }, "Failed to send new-farm notification email");
  }
}

function renderNewFarmEmailHtml(details: NewFarmNotification): string {
  const registered = details.registeredAt.toISOString();
  return `
    <div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1f2937;">
      <h1 style="font-size: 20px; margin-bottom: 8px;">New farm awaiting approval</h1>
      <p style="font-size: 14px; line-height: 1.6; color: #4b5563;">
        A new farm just signed up on MyGoatHerd and is waiting for your approval
        before it goes live.
      </p>
      <table style="font-size: 14px; line-height: 1.8; color: #1f2937; border-collapse: collapse;">
        <tr><td style="padding-right: 12px; color: #6b7280;">Farm name</td><td>${escapeHtml(details.farmName)}</td></tr>
        <tr><td style="padding-right: 12px; color: #6b7280;">Address</td><td>${escapeHtml(details.farmSlug)}</td></tr>
        <tr><td style="padding-right: 12px; color: #6b7280;">First admin</td><td>${escapeHtml(details.adminUsername)}</td></tr>
        <tr><td style="padding-right: 12px; color: #6b7280;">Email</td><td><a href="mailto:${escapeHtml(details.adminEmail)}" style="color: #16a34a;">${escapeHtml(details.adminEmail)}</a></td></tr>
        <tr><td style="padding-right: 12px; color: #6b7280;">Registered</td><td>${registered}</td></tr>
      </table>
      <p style="margin: 24px 0;">
        <a href="${details.approveUrl}"
           style="background: #16a34a; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 8px; font-size: 14px; font-weight: 600; display: inline-block;">
          Approve this farm
        </a>
      </p>
      <p style="font-size: 12px; line-height: 1.6; color: #6b7280;">
        The approval link expires in 7 days and can only be used once. To review
        the registration first, or to reject it, open the
        <a href="${details.panelUrl}" style="color: #16a34a;">super-admin panel</a>.
      </p>
    </div>
  `;
}

function renderNewFarmEmailText(details: NewFarmNotification): string {
  return [
    "New farm awaiting approval on MyGoatHerd",
    "",
    `Farm name: ${details.farmName}`,
    `Address: ${details.farmSlug}`,
    `First admin: ${details.adminUsername}`,
    `Email: ${details.adminEmail}`,
    `Registered: ${details.registeredAt.toISOString()}`,
    "",
    `Approve this farm (expires in 7 days, single-use): ${details.approveUrl}`,
    `Review or reject in the super-admin panel: ${details.panelUrl}`,
  ].join("\n");
}

export type FarmRegistrationReceivedNotification = {
  farmName: string;
  farmSlug: string;
  /** Absolute URL to the farm's future home page, including the slug. */
  farmUrl: string;
};

/**
 * Confirms to the registrant that their farm registration was received and is
 * awaiting super-admin approval. Degrades gracefully: logs instead of sending
 * when email isn't configured, and swallows delivery failures.
 */
export async function sendFarmRegistrationReceivedEmail(
  to: string,
  details: FarmRegistrationReceivedNotification,
): Promise<void> {
  const resend = getResendClient();
  const from = getFromAddress();

  if (!resend || !from) {
    logger.warn(
      { to, ...details },
      "Email not configured (set RESEND_API_KEY and EMAIL_FROM_ADDRESS); logging registration-received notification instead of sending",
    );
    return;
  }

  if (!shouldDeliver(to, `We received your MyGoatHerd registration for ${details.farmName}`, { farmSlug: details.farmSlug })) return;

  try {
    const { error } = await resend.emails.send({
      from,
      to,
      subject: `We received your MyGoatHerd registration for ${details.farmName}`,
      html: renderRegistrationReceivedEmailHtml(details),
      text: renderRegistrationReceivedEmailText(details),
    });
    if (error) {
      logger.error({ err: error, to }, "Resend reported an error sending the registration-received email");
      return;
    }
    logger.info({ to, farmSlug: details.farmSlug }, "Sent registration-received email");
  } catch (err) {
    logger.error({ err, to }, "Failed to send registration-received email");
  }
}

function renderRegistrationReceivedEmailHtml(
  details: FarmRegistrationReceivedNotification,
): string {
  return `
    <div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1f2937;">
      <h1 style="font-size: 20px; margin-bottom: 8px;">Registration received</h1>
      <p style="font-size: 14px; line-height: 1.6; color: #4b5563;">
        Thanks for registering ${escapeHtml(details.farmName)} on MyGoatHerd.
        Your registration is now waiting for review by an administrator.
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #4b5563;">
        You'll get another email as soon as a decision is made. Once approved,
        your farm's address will be<br />
        <a href="${details.farmUrl}" style="color: #16a34a; word-break: break-all;"><strong>${details.farmUrl}</strong></a><br />
        and you'll be able to sign in right away.
      </p>
      <p style="font-size: 12px; line-height: 1.6; color: #6b7280;">
        You can't sign in until your farm is approved. No action is needed from
        you in the meantime.
      </p>
    </div>
  `;
}

function renderRegistrationReceivedEmailText(
  details: FarmRegistrationReceivedNotification,
): string {
  return [
    `We received your MyGoatHerd registration for ${details.farmName}`,
    "",
    "Thanks for registering. Your registration is now waiting for review by an administrator.",
    "",
    `You'll get another email as soon as a decision is made. Once approved, your farm's address will be ${details.farmUrl} and you'll be able to sign in right away.`,
    "",
    "You can't sign in until your farm is approved. No action is needed from you in the meantime.",
  ].join("\n");
}

export type FarmRejectedNotification = {
  farmName: string;
  /** Reason the super-admin recorded for the rejection. */
  reason: string;
};

/**
 * Tells the registrant their farm registration was not approved, including the
 * recorded reason. Same degrade-gracefully contract as the other emails.
 */
export async function sendFarmRejectedEmail(
  to: string,
  details: FarmRejectedNotification,
): Promise<void> {
  const resend = getResendClient();
  const from = getFromAddress();

  if (!resend || !from) {
    logger.warn(
      { to, farmName: details.farmName },
      "Email not configured (set RESEND_API_KEY and EMAIL_FROM_ADDRESS); logging farm-rejected notification instead of sending",
    );
    return;
  }

  if (!shouldDeliver(to, `Your MyGoatHerd registration for ${details.farmName} was not approved`)) return;

  try {
    const { error } = await resend.emails.send({
      from,
      to,
      subject: `Your MyGoatHerd registration for ${details.farmName} was not approved`,
      html: renderFarmRejectedEmailHtml(details),
      text: renderFarmRejectedEmailText(details),
    });
    if (error) {
      logger.error({ err: error, to }, "Resend reported an error sending the farm-rejected email");
      return;
    }
    logger.info({ to }, "Sent farm-rejected email");
  } catch (err) {
    logger.error({ err, to }, "Failed to send farm-rejected email");
  }
}

function renderFarmRejectedEmailHtml(details: FarmRejectedNotification): string {
  return `
    <div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1f2937;">
      <h1 style="font-size: 20px; margin-bottom: 8px;">Registration not approved</h1>
      <p style="font-size: 14px; line-height: 1.6; color: #4b5563;">
        Unfortunately, your MyGoatHerd registration for
        ${escapeHtml(details.farmName)} was not approved.
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #4b5563;">
        <strong>Reason:</strong> ${escapeHtml(details.reason)}
      </p>
      <p style="font-size: 12px; line-height: 1.6; color: #6b7280;">
        If you believe this was a mistake, simply reply to this email or contact
        the administrator who manages MyGoatHerd.
      </p>
    </div>
  `;
}

function renderFarmRejectedEmailText(details: FarmRejectedNotification): string {
  return [
    `Your MyGoatHerd registration for ${details.farmName} was not approved`,
    "",
    `Reason: ${details.reason}`,
    "",
    "If you believe this was a mistake, reply to this email or contact the administrator who manages MyGoatHerd.",
  ].join("\n");
}

export type FarmApprovedNotification = {
  farmName: string;
  /** Absolute link to the farm's own sign-in page. */
  loginUrl: string;
};

/**
 * Tells the registrant their farm has been approved and they can sign in.
 * Same degrade-gracefully contract: logs instead of sending when email isn't
 * configured, and swallows delivery failures so approval always succeeds.
 */
export async function sendFarmApprovedEmail(
  to: string,
  details: FarmApprovedNotification,
): Promise<void> {
  const resend = getResendClient();
  const from = getFromAddress();

  if (!resend || !from) {
    logger.warn(
      { to, ...details },
      "Email not configured (set RESEND_API_KEY and EMAIL_FROM_ADDRESS); logging farm-approved notification instead of sending",
    );
    return;
  }

  if (!shouldDeliver(to, `${details.farmName} is approved on MyGoatHerd`, { loginUrl: details.loginUrl })) return;

  try {
    const { error } = await resend.emails.send({
      from,
      to,
      subject: `${details.farmName} is approved on MyGoatHerd`,
      html: renderFarmApprovedEmailHtml(details),
      text: renderFarmApprovedEmailText(details),
    });
    if (error) {
      logger.error({ err: error, to }, "Resend reported an error sending the farm-approved email");
      return;
    }
    logger.info({ to }, "Sent farm-approved email");
  } catch (err) {
    logger.error({ err, to }, "Failed to send farm-approved email");
  }
}

function renderFarmApprovedEmailHtml(details: FarmApprovedNotification): string {
  return `
    <div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1f2937;">
      <h1 style="font-size: 20px; margin-bottom: 8px;">Your farm is approved</h1>
      <p style="font-size: 14px; line-height: 1.6; color: #4b5563;">
        Good news — ${escapeHtml(details.farmName)} has been approved on
        MyGoatHerd. You can now sign in and start managing your herd.
      </p>
      <p style="margin: 24px 0;">
        <a href="${details.loginUrl}"
           style="background: #16a34a; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 8px; font-size: 14px; font-weight: 600; display: inline-block;">
          Sign in to your farm
        </a>
      </p>
    </div>
  `;
}

function renderFarmApprovedEmailText(details: FarmApprovedNotification): string {
  return [
    `${details.farmName} is approved on MyGoatHerd`,
    "",
    "Good news — your farm has been approved. You can now sign in and start managing your herd.",
    "",
    `Sign in: ${details.loginUrl}`,
  ].join("\n");
}

/** Minimal HTML-escaping for user-provided values embedded in email markup. */
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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
