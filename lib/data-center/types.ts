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
  dueAt: string | null;
  refundAmountEur: number | null;
  createdAt: string;
  updatedAt: string;
};
