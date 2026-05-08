# WP Monitor Frontend

## 环境变量配置

开发环境变量在 `.env.local` 文件中配置，此文件不进 Git 仓库。仓库中提供了 `.env.example` 模板文件，新开发者复制并改名即可：

```bash
cp .env.example .env.local   # 复制模板，按需修改
```

| 变量 | 默认值 | 说明 |
|------|------|------|
| `VITE_DEV_SERVER_PORT` | `5173` | 开发服务器端口 |
| `VITE_PROXY_TARGET` | `https://monitor.alpha.warpparse.com` | API 代理目标地址 |

环境变量通过 Vite 的 `loadEnv` 在 `vite.config.ts` 中读取，不会注入到客户端代码。

## 包管理器

采用 **pnpm**，利用硬链接节省磁盘空间，安装速度显著快于其它 npm 包管理器。

## 初始化与运行

```bash
pnpm install      # 安装依赖
pnpm dev          # 启动开发服务器 (localhost:5173)
pnpm build        # 生产构建 (tsc + vite)
pnpm preview      # 预览构建产物
```

## API 代理

开发时后端 API 通过 Vite 代理转发，目标地址由 `.env.local` 中的 `VITE_PROXY_TARGET` 指定。前端请求 `/api/v1/...` 会被代理到目标服务，无需处理跨域。

## 文件路由

基于 `vite-plugin-pages` 实现文件系统路由，`src/views/pages/` 下的文件自动映射为路由：

| 文件 | 路由 |
|------|------|
| `src/views/pages/index.tsx` | `/` |
| `src/views/pages/wp-monitor/index.tsx` | `/wp-monitor` |

`src/views/components/` 存放页面所需的组件，不会被注册为路由。

## 主要依赖

| 包 | 作用 |
|------|------|
| [antd](https://www.npmjs.com/package/antd) | 企业级组件库（Layout、Drawer、DatePicker、Button 等） |
| [apexcharts](https://www.npmjs.com/package/apexcharts) | 时间序列图表 |
| [dayjs](https://www.npmjs.com/package/dayjs) | 日期处理 |
| [lucide-react](https://www.npmjs.com/package/lucide-react) | 图标库 |
| [vite-plugin-pages](https://www.npmjs.com/package/vite-plugin-pages) | 文件系统路由 |
