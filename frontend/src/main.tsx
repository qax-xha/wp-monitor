import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider, App as AntApp } from 'antd';
import antdZhCN from 'antd/es/locale/zh_CN';
import { RouterProvider } from 'react-router';
import { createRouter } from '@/routes';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import '@/styles/index.css';

function AntdConfig({ children }: { children: React.ReactNode }) {
  const { accentColor, antdAlgorithm } = useTheme();
  return (
    <ConfigProvider
      theme={{
        algorithm: antdAlgorithm,
        token: { colorPrimary: accentColor, borderRadius: 6 },
      }}
      componentSize="middle"
      locale={antdZhCN}
    >
      <AntApp>{children}</AntApp>
    </ConfigProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AntdConfig>
        <RouterProvider router={createRouter({})} />
      </AntdConfig>
    </ThemeProvider>
  </StrictMode>,
);
