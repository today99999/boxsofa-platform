# BoxSofa 厂家资料整理模板

更新时间：2026-07-04

## 当前资料状态

`D:\沙发网站\厂家资料-待整理` 当前未发现可读取的厂家文件。等厂家图片、视频、表格或目录放入该目录后，先按下面字段整理，再批量导入网站。

## 款式表

| 字段 | 说明 | 示例 |
| --- | --- | --- |
| style_id | 款式编号，同一款不同颜色共用 | style-solo |
| style_name_zh | 中文款式名 | Solo 单人压缩沙发 |
| category | 分类：single、double、triple、combo | single |
| description_zh | 款式描述 | 适合公寓、出租屋、小客厅 |
| detail_image_file | 每个款式 1 张详情长图 | detail-solo.jpg |
| video_file | 每个款式 1 个视频 | solo-demo.mp4 |
| active | 是否上架 | yes |

## SKU 表

| 字段 | 说明 | 示例 |
| --- | --- | --- |
| sku | 唯一 SKU 编码 | BS-SOLO-BLUE |
| style_id | 对应款式编号 | style-solo |
| slug | 网页地址英文短名 | solo-star-blue |
| name_zh | 中文商品名 | Solo 星空蓝 |
| name_en | 英文商品名，后续翻译 | Solo Star Blue |
| name_es | 西语商品名，后续翻译 | Sofa Solo Azul |
| color_zh | 中文颜色 | 星空蓝 |
| category | 分类：single、double、triple、combo | single |
| price_eur | 欧洲售价 | 129 |
| compare_at_price_eur | 划线价，可为空 | 159 |
| stock | 库存 | 18 |
| dimensions | 成品尺寸 | 80 x 85 x 72 cm |
| package_dimensions | 包装尺寸 | 75 x 38 x 38 cm |
| weight_kg | 重量 | 18 |
| material | 材质 | 高密度压缩海绵、布艺外套 |
| packaging_method | 包装方式 | 真空压缩卷包，外箱加固 |
| rebound_time | 回弹时间 | 开箱后 24-72 小时基本回弹 |
| main_image_file | 主图文件 | sku-1-blue.jpg |
| active | 是否上架 | yes |

## SKU 图片表

每个 SKU 建议整理 3-5 张主图。

| 字段 | 说明 | 示例 |
| --- | --- | --- |
| sku | 对应 SKU | BS-SOLO-BLUE |
| file_name | 图片文件名 | bs-solo-blue-01.jpg |
| sort_order | 排序，从 1 开始 | 1 |
| usage | 用途：main、gallery | main |

## 文件命名建议

- SKU 主图：`sku/BS-SOLO-BLUE-01.jpg`
- SKU 其他图：`sku/BS-SOLO-BLUE-02.jpg`
- 款式详情长图：`detail/style-solo-detail.jpg`
- 款式视频：`video/style-solo-demo.mp4`

## 导入前核对

- 每个 SKU 必须有唯一 `sku` 和 `slug`。
- 每个 SKU 至少 1 张主图，正式上架建议 3-5 张。
- 每个款式只保留 1 张详情长图和 1 个视频。
- 尺寸、包装尺寸、重量必须带单位。
- 价格统一使用 EUR。
- 定价规则：人民币成本价除以 7.9，再乘以 3，得到欧元售价。
- 价格尾数规则：最终 EUR 价格取整数后，个位数统一改为 9。例如 8100 RMB / 7.9 * 3 = 3076，最终填 EUR 3079。
- 库存按 SKU 管理，不按款式合并。
- 会员规则仍按订单已确认付款金额累计，满 EUR 300 后 9 折。
