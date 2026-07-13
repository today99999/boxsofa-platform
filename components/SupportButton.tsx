"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  addSupportMessage,
  createSupportThread,
  readSupportThreads,
  SUPPORT_THREADS_KEY,
  SUPPORT_THREADS_EVENT,
  type ChatThread
} from "@/lib/supportChat";
import { createSupabaseBrowserClient, hasSupabaseBrowserConfig } from "@/lib/supabase/browser";
import { useTranslation } from "@/components/useTranslation";

type SupportCreateResponse = { ok: boolean; mode: "local" | "supabase"; threadId?: string; accessToken?: string; message?: string };
type SupportUpdateResponse = { ok: boolean; mode: "local" | "supabase"; message?: string };
type SupportThreadResponse = { ok: boolean; mode: "local" | "supabase"; thread?: ChatThread | null; message?: string };

const supportCopy = {
  zh: {
    title: "在线客服",
    subtitle: "留下问题后，商家会在后台回复。",
    name: "姓名",
    email: "邮箱",
    message: "问题",
    namePlaceholder: "例如：Maria",
    emailPlaceholder: "用于接收后续联系",
    messagePlaceholder: "请描述想咨询的款式、颜色、配送或订单问题",
    start: "提交咨询",
    reply: "继续留言",
    close: "关闭",
    sent: "已发送，商家后台可以看到这条留言。",
    threadClosed: "这条会话已关闭，如需继续请重新提交咨询。",
    service: "客服",
    customer: "我"
  },
  en: {
    title: "Online Support",
    subtitle: "Send a question and the seller can reply from the dashboard.",
    name: "Name",
    email: "Email",
    message: "Message",
    namePlaceholder: "e.g. Maria",
    emailPlaceholder: "For follow-up contact",
    messagePlaceholder: "Ask about a sofa, color, delivery, or order",
    start: "Send request",
    reply: "Send message",
    close: "Close",
    sent: "Sent. The seller can see this message in the dashboard.",
    threadClosed: "This conversation is closed. Start a new request to continue.",
    service: "Support",
    customer: "Me"
  },
  es: {
    title: "Atención online",
    subtitle: "Envía tu consulta y el vendedor responderá desde el panel.",
    name: "Nombre",
    email: "Correo",
    message: "Mensaje",
    namePlaceholder: "Ej.: Maria",
    emailPlaceholder: "Para contacto posterior",
    messagePlaceholder: "Consulta sobre sofá, color, entrega o pedido",
    start: "Enviar consulta",
    reply: "Enviar mensaje",
    close: "Cerrar",
    sent: "Enviado. El vendedor puede verlo en el panel.",
    threadClosed: "Esta conversación está cerrada. Inicia otra consulta.",
    service: "Soporte",
    customer: "Yo"
  },
  fr: {
    title: "Support en ligne",
    subtitle: "Envoyez une question, le vendeur répondra depuis le tableau de bord.",
    name: "Nom",
    email: "E-mail",
    message: "Message",
    namePlaceholder: "Ex. : Maria",
    emailPlaceholder: "Pour vous recontacter",
    messagePlaceholder: "Question sur un canapé, une couleur, la livraison ou une commande",
    start: "Envoyer",
    reply: "Répondre",
    close: "Fermer",
    sent: "Envoyé. Le vendeur peut voir ce message.",
    threadClosed: "Cette conversation est fermée. Lancez une nouvelle demande.",
    service: "Support",
    customer: "Moi"
  },
  de: {
    title: "Online-Support",
    subtitle: "Senden Sie eine Frage, der Verkäufer antwortet im Dashboard.",
    name: "Name",
    email: "E-Mail",
    message: "Nachricht",
    namePlaceholder: "z. B. Maria",
    emailPlaceholder: "Für spätere Rückfragen",
    messagePlaceholder: "Frage zu Sofa, Farbe, Lieferung oder Bestellung",
    start: "Anfrage senden",
    reply: "Nachricht senden",
    close: "Schließen",
    sent: "Gesendet. Der Verkäufer sieht die Nachricht im Dashboard.",
    threadClosed: "Diese Unterhaltung ist geschlossen. Starten Sie eine neue Anfrage.",
    service: "Support",
    customer: "Ich"
  }
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function SupportButton() {
  const { language, t } = useTranslation();
  const copy = supportCopy[language];
  const [open, setOpen] = useState(false);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    function refreshThreads() {
      const nextThreads = readSupportThreads();
      setThreads(nextThreads);
      if (!activeThreadId) {
        const latestOpenThread = nextThreads.find((thread) => thread.status === "open");
        if (latestOpenThread) setActiveThreadId(latestOpenThread.id);
      }
    }

    refreshThreads();
    window.addEventListener(SUPPORT_THREADS_EVENT, refreshThreads);
    return () => window.removeEventListener(SUPPORT_THREADS_EVENT, refreshThreads);
  }, [activeThreadId]);

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) ?? threads.find((thread) => thread.status === "open") ?? null,
    [activeThreadId, threads]
  );

  async function refreshSupportThread(thread: ChatThread) {
    if (!thread.accessToken) return;

    try {
      const params = new URLSearchParams({
        threadId: thread.id,
        accessToken: thread.accessToken
      });
      const response = await fetch(`/api/support?${params.toString()}`);
      const result = (await response.json()) as SupportThreadResponse;
      if (!response.ok || !result.ok || result.mode !== "supabase" || !result.thread) return;

      const nextThread = { ...result.thread, accessToken: thread.accessToken };
      const nextThreads = readSupportThreads().map((item) => (item.id === nextThread.id ? nextThread : item));
      localStorage.setItem(SUPPORT_THREADS_KEY, JSON.stringify(nextThreads));
      window.dispatchEvent(new Event(SUPPORT_THREADS_EVENT));
    } catch {
      // Keep the local conversation usable when the database is not reachable.
    }
  }

  useEffect(() => {
    if (!activeThread?.accessToken || !hasSupabaseBrowserConfig()) return;
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`support-thread-${activeThread.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_messages", filter: `thread_id=eq.${activeThread.id}` },
        () => {
          void refreshSupportThread(activeThread);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_threads", filter: `id=eq.${activeThread.id}` },
        () => {
          void refreshSupportThread(activeThread);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeThread?.id, activeThread?.accessToken]);

  useEffect(() => {
    if (!open || !activeThread?.accessToken) return;

    const intervalId = window.setInterval(() => {
      void refreshSupportThread(activeThread);
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, [activeThread?.id, activeThread?.accessToken, open]);

  async function submitSupportThread(input: { customerName: string; customerEmail: string; body: string }) {
    try {
      const response = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input)
      });
      return (await response.json()) as SupportCreateResponse;
    } catch {
      return { ok: false, mode: "local" as const };
    }
  }

  async function submitSupportReply(threadId: string, accessToken: string | undefined, body: string) {
    try {
      const response = await fetch("/api/support", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, accessToken, body })
      });
      return (await response.json()) as SupportUpdateResponse;
    } catch {
      return { ok: false, mode: "local" as const };
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedMessage = message.trim();
    if (!trimmedMessage) return;

    if (activeThread && activeThread.status === "open") {
      addSupportMessage(activeThread.id, "customer", trimmedMessage);
      void submitSupportReply(activeThread.id, activeThread.accessToken, trimmedMessage);
    } else {
      const result = await submitSupportThread({
        customerName,
        customerEmail,
        body: trimmedMessage
      });
      const thread = createSupportThread({
        customerName,
        customerEmail,
        body: trimmedMessage,
        id: result.ok && result.mode === "supabase" ? result.threadId : undefined,
        accessToken: result.ok && result.mode === "supabase" ? result.accessToken : undefined
      });
      setActiveThreadId(thread.id);
    }

    setMessage("");
    setNotice(copy.sent);
    setThreads(readSupportThreads());
  }

  return (
    <>
      {open ? (
        <div className="support-panel" role="dialog" aria-modal="false" aria-label={copy.title}>
          <div className="support-panel-head">
            <div>
              <strong>{copy.title}</strong>
              <span>{copy.subtitle}</span>
            </div>
            <button type="button" aria-label={copy.close} onClick={() => setOpen(false)}>
              ×
            </button>
          </div>

          {activeThread ? (
            <div className="support-message-list">
              {activeThread.messages.slice(-6).map((item) => (
                <div className={`support-message ${item.sender}`} key={item.id}>
                  <span>{item.sender === "customer" ? copy.customer : copy.service}</span>
                  <p>{item.body}</p>
                  <small>{formatTime(item.createdAt)}</small>
                </div>
              ))}
            </div>
          ) : null}

          {notice ? <p className="support-notice">{notice}</p> : null}
          {activeThread?.status === "closed" ? <p className="support-notice">{copy.threadClosed}</p> : null}

          <form className="support-form" onSubmit={handleSubmit}>
            {!activeThread ? (
              <div className="support-form-grid">
                <label>
                  {copy.name}
                  <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder={copy.namePlaceholder} />
                </label>
                <label>
                  {copy.email}
                  <input
                    type="email"
                    value={customerEmail}
                    onChange={(event) => setCustomerEmail(event.target.value)}
                    placeholder={copy.emailPlaceholder}
                  />
                </label>
              </div>
            ) : null}

            <label>
              {copy.message}
              <textarea
                disabled={activeThread?.status === "closed"}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder={copy.messagePlaceholder}
                rows={4}
              />
            </label>
            <button className="button primary" disabled={activeThread?.status === "closed"} type="submit">
              {activeThread ? copy.reply : copy.start}
            </button>
          </form>
        </div>
      ) : null}

      <button className="chat-button" type="button" onClick={() => setOpen((value) => !value)}>
        {t("support")}
      </button>
    </>
  );
}
