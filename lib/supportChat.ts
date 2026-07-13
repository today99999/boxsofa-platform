"use client";

export type ChatSender = "customer" | "service" | "system";
export type ChatStatus = "open" | "closed";

export type ChatMessage = {
  id: string;
  sender: ChatSender;
  body: string;
  createdAt: string;
};

export type ChatThread = {
  id: string;
  accessToken?: string;
  customerName: string;
  customerEmail: string;
  status: ChatStatus;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
};

export const SUPPORT_THREADS_KEY = "boxsofa_support_threads_v1";
export const SUPPORT_THREADS_EVENT = "boxsofa-support-threads-updated";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function newId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeThreads(value: unknown): ChatThread[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((thread): thread is ChatThread => Boolean(thread && typeof thread === "object" && "id" in thread))
    .map((thread) => ({
      id: String(thread.id),
      accessToken: typeof thread.accessToken === "string" ? thread.accessToken : undefined,
      customerName: thread.customerName || "Guest",
      customerEmail: thread.customerEmail || "",
      status: (thread.status === "closed" ? "closed" : "open") as ChatStatus,
      createdAt: thread.createdAt || new Date().toISOString(),
      updatedAt: thread.updatedAt || thread.createdAt || new Date().toISOString(),
      messages: Array.isArray(thread.messages)
        ? thread.messages.map((message) => ({
            id: message.id || newId("msg"),
            sender: ["customer", "service", "system"].includes(message.sender) ? message.sender : "customer",
            body: String(message.body || ""),
            createdAt: message.createdAt || new Date().toISOString()
          }))
        : []
    }))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export function readSupportThreads() {
  if (!canUseStorage()) return [];

  try {
    return normalizeThreads(JSON.parse(window.localStorage.getItem(SUPPORT_THREADS_KEY) || "[]"));
  } catch {
    return [];
  }
}

export function saveSupportThreads(threads: ChatThread[]) {
  if (!canUseStorage()) return;

  window.localStorage.setItem(SUPPORT_THREADS_KEY, JSON.stringify(normalizeThreads(threads)));
  window.dispatchEvent(new Event(SUPPORT_THREADS_EVENT));
}

export function createSupportThread(input: { customerName: string; customerEmail: string; body: string; id?: string; accessToken?: string }) {
  const now = new Date().toISOString();
  const thread: ChatThread = {
    id: input.id || newId("thread"),
    accessToken: input.accessToken,
    customerName: input.customerName.trim() || "Guest",
    customerEmail: input.customerEmail.trim(),
    status: "open",
    createdAt: now,
    updatedAt: now,
    messages: [
      {
        id: newId("msg"),
        sender: "customer",
        body: input.body.trim(),
        createdAt: now
      }
    ]
  };

  saveSupportThreads([thread, ...readSupportThreads()]);
  return thread;
}

export function addSupportMessage(threadId: string, sender: ChatSender, body: string) {
  const trimmedBody = body.trim();
  if (!trimmedBody) return null;

  const now = new Date().toISOString();
  let updatedThread: ChatThread | null = null;
  const threads = readSupportThreads().map((thread) => {
    if (thread.id !== threadId) return thread;
    updatedThread = {
      ...thread,
      status: "open",
      updatedAt: now,
      messages: [
        ...thread.messages,
        {
          id: newId("msg"),
          sender,
          body: trimmedBody,
          createdAt: now
        }
      ]
    };
    return updatedThread;
  });

  saveSupportThreads(threads);
  return updatedThread;
}

export function closeSupportThread(threadId: string) {
  const now = new Date().toISOString();
  const threads = readSupportThreads().map((thread) =>
    thread.id === threadId ? { ...thread, status: "closed" as const, updatedAt: now } : thread
  );
  saveSupportThreads(threads);
}
