/** Login Did you know facts (P9-01). Keep in sync with docs/PHASE9_DID_YOU_KNOW.md. */

export const DID_YOU_KNOW_FACTS = [
  "Did you know? Using someone else's password without permission can be a computer-related offence.",
  "Did you know? Guessing or sharing login credentials is a common way firms leak client secrets.",
  "Did you know? Sending a client file to a personal webmail account can break confidentiality.",
  "Did you know? Phishing emails often copy a bank or court crest to steal passwords.",
  "Did you know? A USB stick from an unknown person can install malware on a practice PC.",
  "Did you know? Public Wi-Fi can expose an unencrypted login if you are not on a trusted connection.",
  "Did you know? Leaving a logged-in screen unlocked at reception is an open door to the file.",
  "Did you know? Taking a photo of a client identity document and posting it in a chat group is a data risk.",
  "Did you know? Ransomware is often started by one opened attachment, not a Hollywood hacker.",
  "Did you know? Changing a document after it was signed, without agreement, can be fraudulent.",
  "Did you know? Pretending to be a lawyer to give legal advice can be a criminal impersonation issue.",
  "Did you know? Destroying records that a court has asked you to keep can amount to obstruction.",
  "Did you know? Client money and firm fees must never sit in the same mental bucket. Trust is not income.",
  "Did you know? A verbal promise can still matter. Write down what was agreed.",
  "Did you know? A deadline missed by one day can still lose a right of audience or a claim.",
  "Did you know? Privileged advice is easier to protect when it stays inside the firm's systems.",
  "Did you know? Forwarding a whole matter folder \"for convenience\" can disclose third-party data.",
  "Did you know? Two-factor prompts that arrive when you did not try to log in mean someone else did.",
  "Did you know? Recycled passwords from a leaked site are how many office accounts get taken over.",
  "Did you know? A fake invoice PDF is a frequent way criminals redirect fee payments.",
  "Did you know? Confirming bank details by a second channel (call the known number) stops many scams.",
  "Did you know? Screenshots of a child's school report in a family matter still need careful handling.",
  "Did you know? Turning off your screen lock to \"save time\" is how visitors read the diary.",
  "Did you know? Cloud links set to \"anyone with the link\" are not a private client portal.",
  "Did you know? Installing a cracked PDF tool can hide spyware beside the \"free\" licence.",
  "Did you know? Deleting WhatsApp chats does not always delete the other person's copy.",
  "Did you know? A matter is not closed in the client's mind until you have said so in writing.",
  "Did you know? Dating a letter in the future to \"buy time\" can destroy credibility later.",
  "Did you know? Witnesses should not be coached to memorise a script. That can taint their evidence.",
  "Did you know? Recording a call without checking the rules can create a new legal problem.",
  "Did you know? Using a client's identity number in an email subject line is sloppy data hygiene.",
  "Did you know? Admin staff see as much confidential detail as lawyers. Their access still needs limits.",
  "Did you know? A strong unique password manager beat a sticky note under the keyboard every time.",
  "Did you know? \"Reply all\" on a counsel chain is a classic way to copy the other side by accident.",
  "Did you know? Drafts marked without prejudice still deserve care. They can be forwarded.",
  "Did you know? Paying a bribe to speed a file is a crime, not a filing fee.",
  "Did you know? Ignoring a court order because it feels unfair is still contempt territory.",
  "Did you know? Backdating a signature is not a small clerical trick. It is a lie on paper.",
  "Did you know? Client conflict checks exist so you do not act against someone you already advise.",
  "Did you know? Encryption at rest does not help if the unlocked laptop is left in a taxi.",
  "Did you know? QR codes on posters can send a phone to a fake login page.",
  "Did you know? \"Urgent: pay this new account\" messages should be treated as hostile until proven.",
  "Did you know? Keeping every email forever without a retention idea can also be a risk.",
  "Did you know? A junior's curiosity click on a strange link can lock the whole firm out of files.",
  "Did you know? Court papers served on the wrong person still need a calm, recorded response.",
  "Did you know? Your browser password prompt on a lookalike domain is not your real LexZim login.",
  "Did you know? Printing a trust statement and leaving it on the shared printer is a leak.",
  "Did you know? Saying \"the system did it\" does not excuse a file with no human review.",
  "Did you know? Access you no longer need should be switched off the day the person leaves.",
  "Did you know? The safest extra click is the one that checks the recipient before Send.",
] as const;

export const AUTH_TAGLINE = "You will never go wrong";

export const AUTH_SPLASH_STORAGE_KEY = "lz_auth_splash_played";

const AUTH_SPLASH_DONE = "lz-auth-splash-done";

export function notifyAuthSplashDone() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(AUTH_SPLASH_DONE));
}

export function onAuthSplashDone(handler: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(AUTH_SPLASH_DONE, handler);
  return () => window.removeEventListener(AUTH_SPLASH_DONE, handler);
}

export function pickDidYouKnowFact(random = Math.random): string {
  const i = Math.floor(random() * DID_YOU_KNOW_FACTS.length);
  return DID_YOU_KNOW_FACTS[i] ?? DID_YOU_KNOW_FACTS[0];
}

export function factBody(full: string): string {
  return full.replace(/^Did you know\?\s*/i, "");
}
