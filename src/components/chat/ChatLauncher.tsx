"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { chatCopy, chatLocaleFromAppLocale } from "@/lib/chat/copy";
import { useI18n } from "@/lib/i18n/context";
import "./chat.css";
import { TeeoAvatar } from "./TeeoAvatar";

/**
 * The panel is a separate chunk: a player who never opens the chat downloads none of it. The
 * conversation logic, the storage helpers and the summary card all live behind this boundary.
 */
const ChatPanel = dynamic(() => import("./ChatPanel").then((module) => module.ChatPanel), {
  ssr: false,
  loading: () => null,
});

/**
 * The floating way into the concern chat.
 *
 * Mount this once in the public layout, after the page content and before the footer, so it appears
 * on every public page including `/`. It sits above the phone bottom bar; the design pass styles the
 * `tl-chat-` classes. The label is the button's visible text, so the control has a real name without
 * a tooltip.
 */
export function ChatLauncher() {
  const { locale } = useI18n();
  const copy = chatCopy(chatLocaleFromAppLocale(locale));
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  function close() {
    setOpen(false);
    window.requestAnimationFrame(() => buttonRef.current?.focus());
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="tl-chat-launcher"
        data-hidden={open ? "true" : undefined}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <TeeoAvatar size={40} />
        <span>{copy.openLabel}</span>
      </button>
      {open && <ChatPanel onClose={close} />}
    </>
  );
}
