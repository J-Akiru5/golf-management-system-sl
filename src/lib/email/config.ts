/**
 * The mail channel is optional. The inbox stays usable when it is absent; only the digest button and
 * the provider sender depend on it. Both values must be present, and a whitespace value is not a
 * configuration.
 */
export interface MailEnvironment {
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  [key: string]: string | undefined;
}

export function mailChannelConfigured(env: MailEnvironment = process.env): boolean {
  return Boolean(env.RESEND_API_KEY?.trim() && env.EMAIL_FROM?.trim());
}
