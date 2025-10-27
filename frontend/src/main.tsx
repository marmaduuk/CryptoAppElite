import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import App from './App.tsx'
import Results from './pages/Results'
import SDKTest from './pages/SDKTest'
import './index.css'
import { ConfigProvider, theme, App as AntdApp } from 'antd'
import 'antd/dist/reset.css'

// 自动推导 basename：
// - 如果仓库名为 <user>.github.io，则 base 为 '/'
// - 否则 base 为 '/<repo>'。
// Vite 在运行时暴露 import.meta.env.BASE_URL（通常以斜杠结尾），这里做去尾斜杠处理
const rawBaseUrl = (import.meta as any)?.env?.BASE_URL ?? '/'
const basename = rawBaseUrl !== '/' && rawBaseUrl.endsWith('/') ? rawBaseUrl.slice(0, -1) : rawBaseUrl
const router = createBrowserRouter([
	{ path: '/', element: <App /> },
	{ path: '/results', element: <Results /> },
	{ path: '/sdk-test', element: <SDKTest /> }
], { basename })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#13c2c2',
        }
      }}
    >
      <AntdApp>
        <RouterProvider router={router} />
      </AntdApp>
    </ConfigProvider>
  </StrictMode>,
)
