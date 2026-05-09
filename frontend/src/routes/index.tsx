import { createBrowserRouter, type DOMRouterOpts, Outlet } from 'react-router';
import routes from '~react-pages';

export const createRouter = (options: DOMRouterOpts) =>
  createBrowserRouter(
    [
      {
        path: '/',
        element: <Outlet />,
        children: routes,
      },
    ],
    options,
  );

export default createRouter;
