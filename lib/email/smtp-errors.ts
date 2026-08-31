import { AuthError } from "@/lib/auth/types";

type SmtpErr = {
  code?: string;
  responseCode?: number;
  message?: string;
};

/** Map nodemailer / Node network errors to safe user-facing messages. */
export function mapSmtpError(err: unknown): AuthError {
  if (err instanceof AuthError) return err;

  const e = err as SmtpErr;
  const code = e.code ?? "";
  const responseCode = e.responseCode;
  const message = typeof e.message === "string" ? e.message : "";

  if (code === "EAUTH" || responseCode === 535 || responseCode === 534) {
    return new AuthError(
      "validation",
      "SMTP login failed. Check the mailbox username and password, then save Settings → Email again.",
    );
  }

  if (
    code === "ECONNECTION" ||
    code === "ETIMEDOUT" ||
    code === "ESOCKET" ||
    code === "ECONNRESET" ||
    message.includes("Greeting never received")
  ) {
    return new AuthError(
      "validation",
      "Could not reach the mail server. If LexZim runs on Railway Hobby or Trial, outbound SMTP (ports 465 and 587) is blocked by Railway, not your cPanel host. Upgrade to Railway Pro and redeploy, then test again with the same settings. On Pro, also try port 587 with SSL/TLS off if 465 fails. See docs/user/Email_Setup.md.",
    );
  }

  if (code === "EENVELOPE" || responseCode === 550 || responseCode === 553) {
    return new AuthError(
      "validation",
      "The mail server rejected the sender or recipient address. Check From email matches the mailbox (info@tpfiguattorneys.com).",
    );
  }

  if (code === "ECERT" || /certificate|TLS|SSL/i.test(message)) {
    return new AuthError(
      "validation",
      "TLS/SSL handshake with the mail server failed. Try port 587 with SSL/TLS unchecked, or contact your mail host about the server certificate.",
    );
  }

  const brief = message.replace(/\s+/g, " ").trim().slice(0, 180);
  return new AuthError(
    "validation",
    brief
      ? `Could not send email: ${brief}`
      : "Could not send email. Check SMTP settings and try again.",
  );
}
