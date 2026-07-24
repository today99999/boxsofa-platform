"use client";

import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { isSafeOwnerSearchHref, normalizeOwnerSearchQuery } from "@/lib/data-center/universal-search";

type SearchKind = "order" | "customer" | "product" | "after-sales";
type SearchResult = {
  id: string;
  kind: SearchKind;
  title: string;
  subtitle: string;
  href: string;
};
type SearchState = "idle" | "loading" | "ready" | "error";

const kindLabels: Record<SearchKind, string> = {
  order: "订单",
  customer: "客户",
  product: "产品",
  "after-sales": "售后"
};
const kindOrder: SearchKind[] = ["order", "customer", "product", "after-sales"];

function isResult(value: unknown): value is SearchResult {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<SearchResult>;
  return (
    typeof item.id === "string" &&
    (item.kind === "order" || item.kind === "customer" || item.kind === "product" || item.kind === "after-sales") &&
    typeof item.title === "string" &&
    typeof item.subtitle === "string" &&
    typeof item.href === "string" &&
    isSafeOwnerSearchHref(item.href)
  );
}

export function UniversalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [state, setState] = useState<SearchState>("idle");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const normalized = normalizeOwnerSearchQuery(query);
    const id = ++requestIdRef.current;
    if (!normalized.ok) {
      setResults([]);
      setState("idle");
      setActiveIndex(-1);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setState("loading");
      setOpen(true);
      void fetch(`/api/admin/data-center/search?q=${encodeURIComponent(normalized.value)}`, {
        credentials: "include",
        cache: "no-store",
        signal: controller.signal
      })
        .then(async (response) => {
          const payload: unknown = await response.json().catch(() => null);
          if (!response.ok) throw new Error("search unavailable");
          const items = payload && typeof payload === "object"
            ? (payload as { results?: unknown }).results
            : null;
          if (!Array.isArray(items) || items.length > 32 || !items.every(isResult)) {
            throw new Error("invalid search response");
          }
          if (id !== requestIdRef.current) return;
          setResults(items);
          setActiveIndex(items.length ? 0 : -1);
          setState("ready");
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted || id !== requestIdRef.current) return;
          if (error instanceof DOMException && error.name === "AbortError") return;
          setResults([]);
          setActiveIndex(-1);
          setState("error");
        });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const groups = useMemo(
    () => kindOrder
      .map((kind) => ({ kind, items: results.filter((item) => item.kind === kind) }))
      .filter((group) => group.items.length > 0),
    [results]
  );

  function clearSearch() {
    requestIdRef.current += 1;
    setQuery("");
    setResults([]);
    setState("idle");
    setActiveIndex(-1);
    setOpen(false);
  }

  function navigate(result: SearchResult) {
    if (!isSafeOwnerSearchHref(result.href)) return;
    clearSearch();
    router.push(result.href);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      clearSearch();
      return;
    }
    if (!open || results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1 + results.length) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + results.length) % results.length);
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      navigate(results[activeIndex]);
    }
  }

  let resultIndex = -1;
  const showPanel = open && normalizeOwnerSearchQuery(query).ok;

  return (
    <div
      className="dc-universal-search"
      onFocus={() => normalizeOwnerSearchQuery(query).ok && setOpen(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <label className="dc-visually-hidden" htmlFor="dc-owner-search">全局搜索</label>
      <div className="dc-universal-input">
        <Search aria-hidden size={17} />
        <input
          id="dc-owner-search"
          type="search"
          role="combobox"
          aria-label="搜索订单、客户、产品和售后"
          aria-autocomplete="list"
          aria-expanded={showPanel}
          aria-controls="dc-owner-search-results"
          aria-activedescendant={activeIndex >= 0 ? `dc-owner-search-option-${activeIndex}` : undefined}
          autoComplete="off"
          placeholder="搜索订单、客户、产品、售后"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
        />
        {query && (
          <button type="button" aria-label="清除搜索" onClick={() => clearSearch()}>
            <X aria-hidden size={15} />
          </button>
        )}
      </div>

      {showPanel && (
        <div className="dc-search-results" id="dc-owner-search-results" role="listbox" aria-label="搜索结果">
          {state === "loading" && <p role="status">正在搜索…</p>}
          {state === "error" && <p role="alert">搜索暂时不可用，请稍后重试。</p>}
          {state === "ready" && results.length === 0 && <p role="status">没有找到匹配结果。</p>}
          {state === "ready" && groups.map((group) => (
            <section key={group.kind} role="group" aria-label={kindLabels[group.kind]}>
              <h3>{kindLabels[group.kind]}</h3>
              {group.items.map((result) => {
                resultIndex += 1;
                const index = resultIndex;
                return (
                  <button
                    key={`${result.kind}-${result.id}`}
                    id={`dc-owner-search-option-${index}`}
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    className={index === activeIndex ? "is-active" : ""}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => navigate(result)}
                  >
                    <strong>{result.title}</strong>
                    <span>{result.subtitle}</span>
                  </button>
                );
              })}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
