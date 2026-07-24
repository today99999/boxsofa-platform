import { CircleAlert, CircleCheck, Clock3, Unplug } from "lucide-react";
import type { DataFreshness as Freshness } from "@/lib/data-center/types";

const stateLabels: Record<Freshness["state"], string> = {
  current: "正常",
  delayed: "延迟",
  failed: "失败",
  disconnected: "未连接",
  manual: "手动",
  partial: "部分可用"
};

const dateTime = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Europe/Madrid",
  dateStyle: "short",
  timeStyle: "short"
});

function formatLastSuccess(value: string | null) {
  if (!value) return "尚未同步";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "尚未同步" : dateTime.format(date);
}

export function DataFreshness({ item }: { item: Freshness }) {
  const Icon = item.state === "current"
    ? CircleCheck
    : item.state === "disconnected"
      ? Unplug
      : item.state === "failed"
        ? CircleAlert
        : Clock3;

  return (
    <li className={`dc-freshness ${item.state}`} title={item.message || stateLabels[item.state]}>
      <Icon aria-hidden size={17} />
      <span>
        <strong>{item.label}</strong>
        <small>{stateLabels[item.state]}</small>
      </span>
      <time dateTime={item.lastSuccessAt ?? undefined}>{formatLastSuccess(item.lastSuccessAt)}</time>
    </li>
  );
}
