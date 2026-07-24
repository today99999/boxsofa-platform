"use client";

import Link from "next/link";
import {
  AlertCircle,
  CalendarClock,
  Check,
  ChevronRight,
  ClipboardPlus,
  RefreshCw,
  Save,
  Search,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AfterSalesCase,
  AfterSalesListResponse,
  AfterSalesMutationResponse,
  DataCenterApiError
} from "@/lib/data-center/types";

type RequestState = "loading" | "ready" | "error";
type CaseType = AfterSalesCase["type"];
type CaseStatus = AfterSalesCase["status"];
type Responsibility = NonNullable<AfterSalesCase["responsibility"]>;

type CreateDraft = {
  orderNumber: string;
  type: CaseType;
  reason: string;
  requestedRemedy: string;
  dueAt: string;
};

type EditDraft = {
  status: CaseStatus;
  responsibility: AfterSalesCase["responsibility"];
  dueAt: string;
  refundAmountEur: string;
  internalNote: string;
};

const caseTypes: Array<{ value: CaseType; label: string }> = [
  { value: "return", label: "退货" },
  { value: "refund", label: "退款" },
  { value: "replacement", label: "换货" },
  { value: "damage", label: "运输破损" },
  { value: "delivery", label: "配送问题" },
  { value: "quality", label: "质量问题" },
  { value: "other", label: "其他" }
];

const caseStatuses: Array<{ value: CaseStatus; label: string }> = [
  { value: "requested", label: "待受理" },
  { value: "reviewing", label: "处理中" },
  { value: "approved", label: "已批准" },
  { value: "return_in_transit", label: "退货运输中" },
  { value: "received", label: "已收货" },
  { value: "replacement_sent", label: "换货已发出" },
  { value: "refunded", label: "已退款" },
  { value: "resolved", label: "已解决" },
  { value: "rejected", label: "已拒绝" }
];

const responsibilities: Array<{ value: Responsibility; label: string }> = [
  { value: "unknown", label: "待判定" },
  { value: "boxsofa", label: "BoxSofa" },
  { value: "customer", label: "客户" },
  { value: "carrier", label: "承运商" },
  { value: "supplier", label: "供应商" }
];

const terminalStatuses = new Set<CaseStatus>(["refunded", "resolved", "rejected"]);
const emptyCreateDraft: CreateDraft = {
  orderNumber: "",
  type: "return",
  reason: "",
  requestedRemedy: "",
  dueAt: ""
};

const madridDateTime = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Europe/Madrid",
  dateStyle: "medium",
  timeStyle: "short"
});
const money = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "EUR" });

function typeLabel(value: CaseType) {
  return caseTypes.find((item) => item.value === value)?.label ?? value;
}

function statusLabel(value: CaseStatus) {
  return caseStatuses.find((item) => item.value === value)?.label ?? value;
}

function formatMadridDateTime(value: string | null) {
  if (!value) return "未设置";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "日期无效" : madridDateTime.format(date);
}

function toDateTimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

function madridLocalToIso(value: string) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const desiredUtc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]));
  let candidate = desiredUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Madrid",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(new Date(candidate));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const representedUtc = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute)
    );
    candidate += desiredUtc - representedUtc;
  }
  const result = new Date(candidate);
  return Number.isNaN(result.getTime()) ? null : result.toISOString();
}

function isAfterSalesCase(value: unknown): value is AfterSalesCase {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<AfterSalesCase>;
  return (
    typeof item.id === "string"
    && typeof item.caseNumber === "string"
    && typeof item.orderNumber === "string"
    && typeof item.customerName === "string"
    && caseTypes.some((option) => option.value === item.type)
    && caseStatuses.some((option) => option.value === item.status)
    && typeof item.reason === "string"
    && (item.responsibility === null || responsibilities.some((option) => option.value === item.responsibility))
    && (item.requestedRemedy === null || typeof item.requestedRemedy === "string")
    && (item.dueAt === null || typeof item.dueAt === "string")
    && (item.refundAmountEur === null || typeof item.refundAmountEur === "number")
    && (item.internalNote === null || typeof item.internalNote === "string")
    && typeof item.version === "number"
    && Number.isInteger(item.version)
    && typeof item.createdAt === "string"
    && typeof item.updatedAt === "string"
  );
}

function publicMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const message = (payload as Partial<DataCenterApiError>).message;
  return typeof message === "string" && message.trim().length > 0 && message.length <= 300
    ? message
    : fallback;
}

function draftFor(item: AfterSalesCase): EditDraft {
  return {
    status: item.status,
    responsibility: item.responsibility,
    dueAt: toDateTimeLocal(item.dueAt),
    refundAmountEur: item.refundAmountEur === null ? "" : item.refundAmountEur.toFixed(2),
    internalNote: item.internalNote ?? ""
  };
}

export function AfterSalesSection() {
  const [requestState, setRequestState] = useState<RequestState>("loading");
  const [cases, setCases] = useState<AfterSalesCase[]>([]);
  const [loadError, setLoadError] = useState("");
  const [reloadVersion, setReloadVersion] = useState(0);
  const [statusFilter, setStatusFilter] = useState<"all" | CaseStatus>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | CaseType>("all");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<CreateDraft>(emptyCreateDraft);
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [editError, setEditError] = useState("");
  const [saving, setSaving] = useState(false);
  const requestId = useRef(0);

  const loadCases = useCallback((signal: AbortSignal, id: number) => {
    setRequestState("loading");
    setLoadError("");
    void fetch("/api/admin/after-sales?limit=200", {
      credentials: "include",
      cache: "no-store",
      signal
    })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) throw new Error(publicMessage(payload, "售后工单暂时无法载入。"));
        const result = payload as Partial<AfterSalesListResponse>;
        if (
          result.ok !== true
          || !Array.isArray(result.cases)
          || result.cases.length > 200
          || !result.cases.every(isAfterSalesCase)
        ) {
          throw new Error("售后工单返回格式无效。");
        }
        if (id !== requestId.current) return;
        setCases(result.cases);
        setRequestState("ready");
      })
      .catch((error: unknown) => {
        if (signal.aborted || id !== requestId.current) return;
        setLoadError(error instanceof Error ? error.message : "售后工单暂时无法载入。");
        setRequestState("error");
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const id = ++requestId.current;
    loadCases(controller.signal, id);
    return () => controller.abort();
  }, [loadCases, reloadVersion]);

  const filteredCases = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return cases.filter((item) => (
      (statusFilter === "all" || item.status === statusFilter)
      && (typeFilter === "all" || item.type === typeFilter)
      && (
        query.length === 0
        || item.caseNumber.toLocaleLowerCase().includes(query)
        || item.orderNumber.toLocaleLowerCase().includes(query)
        || item.customerName.toLocaleLowerCase().includes(query)
      )
    ));
  }, [cases, search, statusFilter, typeFilter]);

  const selectedCase = cases.find((item) => item.id === selectedId) ?? null;

  function selectCase(item: AfterSalesCase) {
    setSelectedId(item.id);
    setEditDraft(draftFor(item));
    setEditError("");
  }

  function closeEditor() {
    setSelectedId(null);
    setEditDraft(null);
    setEditError("");
  }

  async function createCase(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError("");
    const dueAt = madridLocalToIso(createDraft.dueAt);
    if (createDraft.dueAt && !dueAt) {
      setCreateError("请选择有效的跟进日期。");
      return;
    }
    const confirmed = window.confirm([
      "确认创建售后工单？",
      `订单号：${createDraft.orderNumber.trim()}`,
      `类型：${typeLabel(createDraft.type)}`,
      `原因：${createDraft.reason.trim()}`,
      `诉求：${createDraft.requestedRemedy.trim() || "未填写"}`,
      `跟进日期：${dueAt ? formatMadridDateTime(dueAt) : "未设置"}`
    ].join("\n"));
    if (!confirmed) return;

    setCreating(true);
    try {
      const response = await fetch("/api/admin/after-sales", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orderNumber: createDraft.orderNumber.trim(),
          type: createDraft.type,
          reason: createDraft.reason.trim(),
          ...(createDraft.requestedRemedy.trim() ? { requestedRemedy: createDraft.requestedRemedy.trim() } : {}),
          ...(dueAt ? { dueAt } : {})
        })
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setCreateError(publicMessage(payload, response.status === 404 || response.status === 409
          ? "找不到对应订单或订单状态已变化。"
          : "无法创建售后工单。"));
        return;
      }
      const result = payload as Partial<AfterSalesMutationResponse>;
      if (result.ok !== true || !isAfterSalesCase(result.case)) {
        setCreateError("售后工单返回格式无效。");
        return;
      }
      const createdCase = result.case;
      setCases((current) => [createdCase, ...current.filter((item) => item.id !== createdCase.id)].slice(0, 200));
      setCreateDraft(emptyCreateDraft);
      setCreateOpen(false);
      selectCase(createdCase);
    } catch {
      setCreateError("网络连接失败，已保留填写内容。");
    } finally {
      setCreating(false);
    }
  }

  async function saveCase(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCase || !editDraft) return;
    setEditError("");
    const dueAt = madridLocalToIso(editDraft.dueAt);
    if (editDraft.dueAt && !dueAt) {
      setEditError("请选择有效的跟进日期。");
      return;
    }
    if (
      terminalStatuses.has(editDraft.status)
      && editDraft.status !== selectedCase.status
      && !window.confirm(`确认将工单 ${selectedCase.caseNumber} 更新为“${statusLabel(editDraft.status)}”？该状态为终态。`)
    ) {
      return;
    }

    const normalizedCurrentDueAt = selectedCase.dueAt ? new Date(selectedCase.dueAt).getTime() : null;
    const normalizedNextDueAt = dueAt ? new Date(dueAt).getTime() : null;
    const currentRefund = selectedCase.refundAmountEur === null ? null : selectedCase.refundAmountEur.toFixed(2);
    const nextRefund = editDraft.refundAmountEur.trim() || null;
    const currentNote = selectedCase.internalNote?.trim() || null;
    const nextNote = editDraft.internalNote.trim() || null;
    const changes: Record<string, unknown> = { version: selectedCase.version };
    if (editDraft.status !== selectedCase.status) changes.status = editDraft.status;
    if (editDraft.responsibility !== selectedCase.responsibility) changes.responsibility = editDraft.responsibility;
    if (normalizedNextDueAt !== normalizedCurrentDueAt) changes.dueAt = dueAt;
    if (nextRefund !== currentRefund) changes.refundAmountEur = nextRefund;
    if (nextNote !== currentNote) changes.internalNote = nextNote;
    if (Object.keys(changes).length === 1) {
      setEditError("没有需要保存的变更。");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/admin/after-sales/${encodeURIComponent(selectedCase.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(changes)
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setEditError(publicMessage(payload, response.status === 409
          ? "工单已被其他操作更新，请刷新后再试。"
          : "无法保存工单，已保留编辑内容。"));
        return;
      }
      const result = payload as Partial<AfterSalesMutationResponse>;
      if (result.ok !== true || !isAfterSalesCase(result.case)) {
        setEditError("工单返回格式无效，已保留编辑内容。");
        return;
      }
      const updatedCase = result.case;
      setCases((current) => current.map((item) => item.id === updatedCase.id ? updatedCase : item));
      setEditDraft(draftFor(updatedCase));
    } catch {
      setEditError("网络连接失败，已保留编辑内容。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="dc-after-sales" aria-labelledby="dc-after-sales-heading">
      <div className="dc-after-sales-toolbar">
        <div>
          <h2 id="dc-after-sales-heading">售后工单</h2>
          <p>最多显示最近 200 条真实工单，时间均为 Europe/Madrid。</p>
        </div>
        <div className="dc-toolbar-actions">
          <Link className="dc-secondary-button" href="/admin/support">客服消息</Link>
          <button className="dc-primary-button" type="button" onClick={() => { setCreateOpen(true); setCreateError(""); }}>
            <ClipboardPlus aria-hidden size={16} />
            新建工单
          </button>
        </div>
      </div>

      {createOpen && (
        <section className="dc-create-panel" aria-labelledby="dc-create-heading">
          <div className="dc-panel-heading">
            <div><h3 id="dc-create-heading">新建售后工单</h3><p>提交前会显示完整确认摘要</p></div>
            <button className="dc-icon-button" type="button" aria-label="关闭新建工单" onClick={() => setCreateOpen(false)}>
              <X aria-hidden size={18} />
            </button>
          </div>
          <form className="dc-case-form" onSubmit={createCase}>
            <label>订单号<input required minLength={3} maxLength={80} value={createDraft.orderNumber} onChange={(event) => setCreateDraft((draft) => ({ ...draft, orderNumber: event.target.value }))} /></label>
            <label>工单类型<select value={createDraft.type} onChange={(event) => setCreateDraft((draft) => ({ ...draft, type: event.target.value as CaseType }))}>{caseTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            <label className="dc-form-wide">问题原因<textarea required minLength={5} maxLength={4000} rows={3} value={createDraft.reason} onChange={(event) => setCreateDraft((draft) => ({ ...draft, reason: event.target.value }))} /></label>
            <label className="dc-form-wide">客户期望处理方式<textarea maxLength={1000} rows={2} value={createDraft.requestedRemedy} onChange={(event) => setCreateDraft((draft) => ({ ...draft, requestedRemedy: event.target.value }))} /></label>
            <label>跟进日期<input type="datetime-local" value={createDraft.dueAt} onChange={(event) => setCreateDraft((draft) => ({ ...draft, dueAt: event.target.value }))} /></label>
            <div className="dc-form-actions">
              <button className="dc-secondary-button" type="button" onClick={() => setCreateOpen(false)}>取消</button>
              <button className="dc-primary-button" type="submit" disabled={creating}>{creating ? "正在创建…" : "检查并创建"}</button>
            </div>
            {createError && <p className="dc-form-error dc-form-wide" role="alert">{createError}</p>}
          </form>
        </section>
      )}

      <div className="dc-case-filters" aria-label="售后筛选">
        <label><span>状态</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}><option value="all">全部状态</option>{caseStatuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label><span>类型</span><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)}><option value="all">全部类型</option>{caseTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label className="dc-case-search"><span>搜索</span><span className="dc-search-input"><Search aria-hidden size={16} /><input type="search" placeholder="工单号、订单号或客户" value={search} onChange={(event) => setSearch(event.target.value)} /></span></label>
      </div>

      {requestState === "loading" && <CaseMessage title="正在载入售后工单" busy />}
      {requestState === "error" && (
        <CaseMessage
          title="售后工单载入失败"
          detail={loadError}
          action={<button className="dc-primary-button" type="button" onClick={() => setReloadVersion((value) => value + 1)}><RefreshCw aria-hidden size={16} />重新加载</button>}
        />
      )}
      {requestState === "ready" && cases.length === 0 && <CaseMessage title="还没有售后工单" detail="新建工单后会显示在这里。" />}
      {requestState === "ready" && cases.length > 0 && filteredCases.length === 0 && <CaseMessage title="没有符合筛选条件的工单" detail="尝试调整状态、类型或搜索内容。" />}
      {requestState === "ready" && filteredCases.length > 0 && (
        <div className={`dc-case-workspace${selectedCase ? " has-editor" : ""}`}>
          <div className="dc-case-list" aria-label={`售后工单列表，共 ${filteredCases.length} 条`}>
            {filteredCases.map((item) => <CaseRow key={item.id} item={item} selected={item.id === selectedId} onSelect={selectCase} />)}
          </div>
          {selectedCase && editDraft && (
            <CaseEditor
              item={selectedCase}
              draft={editDraft}
              error={editError}
              saving={saving}
              onDraft={setEditDraft}
              onClose={closeEditor}
              onSubmit={saveCase}
            />
          )}
        </div>
      )}
    </section>
  );
}

function CaseRow({ item, selected, onSelect }: { item: AfterSalesCase; selected: boolean; onSelect: (item: AfterSalesCase) => void }) {
  const overdue = Boolean(item.dueAt && !terminalStatuses.has(item.status) && Date.parse(item.dueAt) < Date.now());
  return (
    <button className={`dc-case-row${selected ? " is-selected" : ""}`} type="button" aria-pressed={selected} onClick={() => onSelect(item)}>
      <span className="dc-case-main"><strong>{item.caseNumber}</strong><small>{item.orderNumber} · {item.customerName || "未记录客户名"}</small></span>
      <span className="dc-case-kind">{typeLabel(item.type)}</span>
      <span className={`dc-status-badge status-${item.status}`}>{statusLabel(item.status)}</span>
      <span className={`dc-case-due${overdue ? " is-overdue" : ""}`}><CalendarClock aria-hidden size={14} />{overdue ? "已逾期 · " : ""}{formatMadridDateTime(item.dueAt)}</span>
      <ChevronRight aria-hidden size={17} />
    </button>
  );
}

function CaseEditor({
  item,
  draft,
  error,
  saving,
  onDraft,
  onClose,
  onSubmit
}: {
  item: AfterSalesCase;
  draft: EditDraft;
  error: string;
  saving: boolean;
  onDraft: React.Dispatch<React.SetStateAction<EditDraft | null>>;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <aside className="dc-case-editor" aria-labelledby="dc-case-editor-heading">
      <div className="dc-panel-heading">
        <div><h3 id="dc-case-editor-heading">{item.caseNumber}</h3><p>{item.orderNumber} · 版本 {item.version}</p></div>
        <button className="dc-icon-button" type="button" aria-label="关闭工单编辑" onClick={onClose}><X aria-hidden size={18} /></button>
      </div>
      <div className="dc-case-context">
        <span>{typeLabel(item.type)}</span>
        <p><strong>问题原因</strong>{item.reason}</p>
        <p><strong>客户诉求</strong>{item.requestedRemedy || "未填写"}</p>
      </div>
      <form className="dc-case-form dc-edit-form" onSubmit={onSubmit}>
        <label>状态<select value={draft.status} onChange={(event) => onDraft((current) => current ? { ...current, status: event.target.value as CaseStatus } : current)}>{caseStatuses.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label>责任归属<select value={draft.responsibility ?? ""} onChange={(event) => onDraft((current) => current ? { ...current, responsibility: (event.target.value || null) as AfterSalesCase["responsibility"] } : current)}><option value="">未设置</option>{responsibilities.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label>跟进日期<input type="datetime-local" value={draft.dueAt} onChange={(event) => onDraft((current) => current ? { ...current, dueAt: event.target.value } : current)} /></label>
        <label>记录退款金额（EUR）<input inputMode="decimal" pattern="^(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$" placeholder="仅记录，不会调用 Stripe" value={draft.refundAmountEur} onChange={(event) => onDraft((current) => current ? { ...current, refundAmountEur: event.target.value } : current)} /><small>仅作售后台账记录，不会触发 Stripe 退款。</small></label>
        <label className="dc-form-wide">内部备注<textarea maxLength={4000} rows={5} value={draft.internalNote} onChange={(event) => onDraft((current) => current ? { ...current, internalNote: event.target.value } : current)} /></label>
        {item.refundAmountEur !== null && <p className="dc-recorded-refund dc-form-wide">当前已记录：{money.format(item.refundAmountEur)}</p>}
        {error && <p className="dc-form-error dc-form-wide" role="alert">{error}</p>}
        <div className="dc-form-actions dc-form-wide">
          <button className="dc-primary-button" type="submit" disabled={saving}><Save aria-hidden size={16} />{saving ? "正在保存…" : "保存变更"}</button>
        </div>
      </form>
    </aside>
  );
}

function CaseMessage({ title, detail, busy = false, action }: { title: string; detail?: string; busy?: boolean; action?: React.ReactNode }) {
  const Icon = busy ? RefreshCw : detail ? AlertCircle : Check;
  return (
    <section className="dc-case-message" aria-busy={busy} role={detail ? "status" : undefined}>
      <Icon aria-hidden className={busy ? "is-spinning" : ""} size={24} />
      <h3>{title}</h3>
      {detail && <p>{detail}</p>}
      {action}
    </section>
  );
}
