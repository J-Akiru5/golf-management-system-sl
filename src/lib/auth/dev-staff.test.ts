import { describe, expect, it } from "vitest";
import {
  DEV_STAFF_EMAIL,
  DEV_STAFF_PASSWORD,
  devStaffLoginEnabled,
  isDevStaffCredentials,
} from "./dev-staff-rules";
import { isAcceptablePassword, passwordStrength } from "./password-strength";

describe("development staff sign-in", () => {
  it("is on only in development with no Supabase project", () => {
    expect(devStaffLoginEnabled({ nodeEnv: "development", supabaseConfigured: false })).toBe(true);
    expect(devStaffLoginEnabled({ nodeEnv: "production", supabaseConfigured: false })).toBe(false);
    expect(devStaffLoginEnabled({ nodeEnv: "test", supabaseConfigured: false })).toBe(false);
    expect(devStaffLoginEnabled({ nodeEnv: "development", supabaseConfigured: true })).toBe(false);
  });

  it("uses the account the owner asked for", () => {
    expect(DEV_STAFF_EMAIL).toBe("staff@gmail.com");
  });

  it("uses a sample password the existing validator already accepts", () => {
    expect(isAcceptablePassword(DEV_STAFF_PASSWORD)).toBe(true);
    expect(passwordStrength(DEV_STAFF_PASSWORD).level).toBe("strong");
  });

  it("does not accept the weak password the rule rejects", () => {
    expect(isAcceptablePassword("password123")).toBe(false);
    expect(isDevStaffCredentials(DEV_STAFF_EMAIL, "password123")).toBe(false);
  });

  it("matches the email case-insensitively and the password exactly", () => {
    expect(isDevStaffCredentials(" Staff@Gmail.com ", DEV_STAFF_PASSWORD)).toBe(true);
    expect(isDevStaffCredentials(DEV_STAFF_EMAIL, `${DEV_STAFF_PASSWORD} `)).toBe(false);
  });
});
