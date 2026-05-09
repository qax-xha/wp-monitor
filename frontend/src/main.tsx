import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider, App as AntApp, theme } from 'antd';
import antdZhCN from 'antd/es/locale/zh_CN';
import { RouterProvider } from 'react-router';
import { createRouter } from '@/routes';
import '@/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: { colorPrimary: '#e44d26', borderRadius: 6 },
      }}
      componentSize="middle"
      locale={antdZhCN}
    >
      <AntApp>
        <RouterProvider router={createRouter({})} />
      </AntApp>
    </ConfigProvider>
  </StrictMode>,
);
