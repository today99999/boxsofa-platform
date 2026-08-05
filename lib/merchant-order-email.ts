export type PaidOrderMerchantEmailInput = {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  countryCode: string;
  totalEur: number;
  items: Array<{
    name: string;
    color?: string | null;
    quantity: number;
  }>;
  recipient?: string;
  siteUrl?: string;
};

const chineseRegionNames = new Intl.DisplayNames(["zh-CN"], { type: "region" });

function display(value: string) {
  return value.trim() || "未提供";
}

function formatCountry(countryCode: string) {
  const code = countryCode.trim().toUpperCase();
  if (!code) return "未提供";
  return `${chineseRegionNames.of(code) || code}（${code}）`;
}

function formatItems(items: PaidOrderMerchantEmailInput["items"]) {
  if (items.length === 0) return ["商品明细：请登录商家后台查看"];

  return [
    "商品明细：",
    ...items.map((item) => {
      const color = item.color?.trim() ? `，颜色：${item.color.trim()}` : "";
      return `- ${item.name}${color}，数量：${item.quantity}`;
    })
  ];
}

export function buildPaidOrderMerchantEmail(input: PaidOrderMerchantEmailInput) {
  const siteUrl = (input.siteUrl || "https://boxsofa.eu").replace(/\/+$/, "");

  return {
    to: input.recipient?.trim() || "info@boxsofa.eu",
    subject: `【新订单】已付款 ${input.orderNumber} · EUR ${input.totalEur.toFixed(2)}`,
    bodyText: [
      "BoxSofa 收到一笔新的已付款订单。",
      "",
      `订单号：${input.orderNumber}`,
      "付款状态：Stripe 已确认付款",
      `订单金额：EUR ${input.totalEur.toFixed(2)}`,
      `配送国家：${formatCountry(input.countryCode)}`,
      "",
      ...formatItems(input.items),
      "",
      `客户姓名：${display(input.customerName)}`,
      `客户邮箱：${display(input.customerEmail)}`,
      `客户电话：${display(input.customerPhone)}`,
      "",
      "请登录商家后台查看完整订单和收货地址：",
      `${siteUrl}/admin`
    ].join("\n")
  };
}
