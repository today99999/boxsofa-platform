export type DataHealthState = "current" | "delayed" | "failed" | "disconnected" | "manual" | "partial";

export type DataFreshness = {
  sourceKey: string;
  label: string;
  state: DataHealthState;
  lastSuccessAt: string | null;
  recordCount: number;
  message?: string;
};

export type DashboardAlert = {
  id: string;
  type: string;
  severity: "info" | "warning" | "critical";
  title: string;
  detail?: string;
  entityType?: string;
  entityId?: string;
  createdAt: string;
};

export type DataCenterOverview = {
  range: "today" | "7d" | "30d";
  metrics: {
    gmvEur: number;
    netSalesEur: number;
    paidOrders: number;
    averageOrderValueEur: number;
    conversionRate: number | null;
  };
  visitors: number;
  openAfterSales: number;
  alerts: DashboardAlert[];
  freshness: DataFreshness[];
};

export type AfterSalesCase = {
  id: string;
  caseNumber: string;
  orderNumber: string;
  customerName: string;
  type: "return" | "refund" | "replacement" | "damage" | "delivery" | "quality" | "other";
  status: "requested" | "reviewing" | "approved" | "return_in_transit" | "received" | "replacement_sent" | "refunded" | "resolved" | "rejected";
  reason: string;
  responsibility: "customer" | "boxsofa" | "carrier" | "supplier" | "unknown" | null;
  requestedRemedy: string | null;
  dueAt: string | null;
  refundAmountEur: number | null;
  internalNote: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type AfterSalesListResponse = {
  ok: true;
  mode: "supabase";
  cases: AfterSalesCase[];
  page: {
    limit: number;
    nextCursor?: string;
  };
};

export type AfterSalesMutationResponse = {
  ok: true;
  mode: "supabase";
  case: AfterSalesCase;
};

export type DataCenterApiError = {
  ok: false;
  message: string;
  code?: string;
};
