import { lazy, Suspense } from 'react';

const WpMonitorPage = lazy(() => import('./wp-monitor'));

export default function PagesIndex() {
  return (
    <Suspense fallback={null}>
      <WpMonitorPage />
    </Suspense>
  );
}
