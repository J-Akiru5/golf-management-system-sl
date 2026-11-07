"use server";

import { revalidatePath } from "next/cache";
import { getI18n } from "@/lib/i18n/server";
import {
  type ContactErrorKey,
  hasContactChanges,
  mapOwnProfile,
  type OwnProfile,
  validateContact,
} from "@/lib/player/profile";
import { signedInClient } from "@/lib/player/session";

/**
 * The contact form's state. Every field is always present so nothing the player typed is lost when
 * the write fails or the database is not ready yet: the client seeds its inputs from `values`.
 */
export interface ContactFormState {
  status: "idle" | "saved" | "error" | "unavailable" | "unchanged";
  message: string;
  values: { phone: string; email: string; nickname: string };
  errors: Partial<Record<"phone" | "email" | "nickname", string>>;
}

const FIELDS = ["phone", "email", "nickname"] as const;

/** A posted value is a string; a file or a missing field becomes the empty string. */
const text = (value: FormDataEntryValue | null): string => (typeof value === "string" ? value : "");

/**
 * Saves the three fields a player owns: phone, contact email and the nickname on boards.
 *
 * The order matters. The values are validated first, in the player's language, so a bad number is
 * answered without a round trip. Then the current record is read, so an unchanged form does not
 * write. The database is the last line and only ever touches the caller's own row.
 *
 * No database message is returned to the browser: a missing migration, a refused write and a
 * connection failure each get one sentence from the dictionary.
 */
export async function saveContact(
  _prev: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const { t } = await getI18n();

  const check = validateContact({
    phone: text(formData.get("phone")),
    email: text(formData.get("email")),
    nickname: text(formData.get("nickname")),
  });
  const values = check.values;

  if (!check.ok) {
    const errors: ContactFormState["errors"] = {};
    for (const field of FIELDS) {
      const key: ContactErrorKey | undefined = check.errors[field];
      if (key) errors[field] = t(key);
    }
    return { status: "error", message: t("profile.contact.fix"), values, errors };
  }

  const client = await signedInClient("/my/profile");

  // The record may predate this page's migration, so a failed read is not a failed save: the write
  // below is tried and answers for itself.
  let current: OwnProfile | null = null;
  try {
    const { data } = await client.rpc("player_own_profile");
    current = mapOwnProfile(data);
  } catch {
    current = null;
  }

  if (current && !hasContactChanges(current.contact, values)) {
    return {
      status: "unchanged",
      message: t("profile.contact.unchanged"),
      values,
      errors: {},
    };
  }

  const { error } = await client.rpc("player_update_own_contact", {
    p_phone: values.phone || null,
    p_email: values.email || null,
    p_nickname: values.nickname || null,
  });

  if (error) {
    const missing =
      error.code === "PGRST202" || /could not find the function/i.test(error.message ?? "");
    return {
      status: missing ? "unavailable" : "error",
      message: t(missing ? "profile.contact.notReady" : "profile.contact.failed"),
      values,
      errors: {},
    };
  }

  revalidatePath("/my/profile");
  return { status: "saved", message: t("profile.contact.saved"), values, errors: {} };
}
