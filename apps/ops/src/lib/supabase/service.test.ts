import { describe, expect, it } from "vitest";
import { getServiceRoleSupabase, serviceRoleAvailable, serviceRoleSettings } from "./service";

describe("serviceRoleSettings", () => {
  it("reads the service-role key and the project URL together", () => {
    expect(
      serviceRoleSettings({
        NEXT_PUBLIC_SUPABASE_URL: " https://project.supabase.co ",
        SUPABASE_SERVICE_ROLE_KEY: " service-key ",
      }),
    ).toEqual({ url: "https://project.supabase.co", key: "service-key" });
  });

  it("accepts the secret-role alias", () => {
    expect(
      serviceRoleSettings({
        NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_SECRET_ROLE_KEY: "secret-key",
      }),
    ).toEqual({ url: "https://project.supabase.co", key: "secret-key" });
  });

  it("is null when either half is missing", () => {
    expect(serviceRoleSettings({ SUPABASE_SERVICE_ROLE_KEY: "key" })).toBeNull();
    expect(
      serviceRoleSettings({ NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co" }),
    ).toBeNull();
  });
});

describe("availability", () => {
  it("is false without a key, so the controls are disabled", () => {
    expect(serviceRoleAvailable({ NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co" })).toBe(
      false,
    );
    expect(
      getServiceRoleSupabase({ NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co" }),
    ).toBeNull();
  });

  it("builds a client when both values are present", () => {
    const client = getServiceRoleSupabase({
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "key",
    });
    expect(client).not.toBeNull();
    expect(
      serviceRoleAvailable({
        NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "key",
      }),
    ).toBe(true);
  });
});
