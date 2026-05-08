# WP Monitor Frontend

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

开发时后端 API 通过 Vite 代理转发，配置在 `vite.config.ts`：

```ts
server: {
  proxy: {
    '/api': {
      target: 'https://monitor.alpha.warpparse.ai',
      changeOrigin: true,
    }
  }
}
```

前端请求 `/api/v1/...` 会被代理到目标服务，无需处理跨域。

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
