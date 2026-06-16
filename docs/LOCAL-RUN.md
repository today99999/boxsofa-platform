# 本地运行说明

Codex 当前终端已经能找到 Node.js，但是网络出口无法连接 npm 下载源，所以我这边暂时不能完成 `npm install`。

你可以在电脑自己的 PowerShell 里运行：

```powershell
cd "C:\Users\老叶的电脑\Documents\Codex\2026-06-14\https-www-allbirds-com\boxsofa-platform"
npm install
npm run dev
```

如果官方源很慢，可以先设置镜像：

```powershell
npm config set registry https://registry.npmmirror.com
npm install
npm run dev
```

启动后打开：

```text
http://localhost:3000
```

如果 PowerShell 提示找不到 `npm`，请关闭并重新打开 PowerShell，或者重启电脑。
