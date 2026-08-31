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
      "Could not reach the mail server (mail.tpfiguattorneys.com). Confirm port 465 with SSL/TLS is enabled. If this persists, your host or cloud provider may block outbound SMTP; try port 587 without SSL/TLS and ask your mail host to allow relay from LexZim.",
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
