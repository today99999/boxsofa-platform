import { europeDeliveryCountries } from "./europeShipping.ts";

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

const countryNames = new Map<string, string>(
  europeDeliveryCountries.map((country) => [country.code, country.name] as const)
);

const chineseCountryNames: Record<string, string> = {
  AT: "奥地利",
  BE: "比利时",
  BG: "保加利亚",
  HR: "克罗地亚",
  CY: "塞浦路斯",
  CZ: "捷克",
  DE: "德国",
  DK: "丹麦",
  EE: "爱沙尼亚",
  ES: "西班牙",
  FI: "芬兰",
  FR: "法国",
  GB: "英国",
  GR: "希腊",
  HU: "匈牙利",
  IE: "爱尔兰",
  IS: "冰岛",
  IT: "意大利",
  LT: "立陶宛",
  LU: "卢森堡",
  LV: "拉脱维亚",
  MT: "马耳他",
  NL: "荷兰",
  NO: "挪威",
  PL: "波兰",
  PT: "葡萄牙",
  RO: "罗马尼亚",
  SE: "瑞典",
  SI: "斯洛文尼亚",
  SK: "斯洛伐克",
  TR: "土耳其",
  UA: "乌克兰"
};

function display(value: string) {
  return value.trim() || "未提供";
}

function formatCountry(countryCode: string) {
  const code = countryCode.trim().toUpperCase();
  if (!code) return "未提供";
  return `${chineseCountryNames[code] || countryNames.get(code) || code}（${code}）`;
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
