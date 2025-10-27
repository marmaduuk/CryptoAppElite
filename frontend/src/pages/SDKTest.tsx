import { useEffect, useState } from 'react'
import { Card, Typography, Space, Button, message } from 'antd'
import { CheckCircleOutlined, CloseCircleOutlined, ReloadOutlined } from '@ant-design/icons'

export default function SDKTest() {
  const [sdkStatus, setSdkStatus] = useState<{
    loaded: boolean
    version?: string
    methods?: string[]
  }>({ loaded: false })

  const checkSDK = () => {
    if (window.relayerSDK) {
      const methods = Object.keys(window.relayerSDK)
      setSdkStatus({
        loaded: true,
        version: '0.1.0-9',
        methods
      })
      message.success('FHEVM SDK 已加载')
    } else {
      setSdkStatus({ loaded: false })
      message.error('FHEVM SDK 未加载')
    }
  }

  useEffect(() => {
    checkSDK()
  }, [])

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
      <Typography.Title level={2}>FHEVM SDK 状态检查</Typography.Title>
      
      <Card>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {sdkStatus.loaded ? (
              <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 20 }} />
            ) : (
              <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 20 }} />
            )}
            <Typography.Text strong>
              SDK 状态: {sdkStatus.loaded ? '已加载' : '未加载'}
            </Typography.Text>
          </div>

          {sdkStatus.loaded && (
            <>
              <div>
                <Typography.Text strong>版本: </Typography.Text>
                <Typography.Text code>{sdkStatus.version}</Typography.Text>
              </div>
              
              <div>
                <Typography.Text strong>可用方法: </Typography.Text>
                <div style={{ marginTop: 8 }}>
                  {sdkStatus.methods?.map((method, index) => (
                    <Typography.Text key={index} code style={{ marginRight: 8 }}>
                      {method}
                    </Typography.Text>
                  ))}
                </div>
              </div>
            </>
          )}

          <Button 
            type="primary" 
            icon={<ReloadOutlined />} 
            onClick={checkSDK}
          >
            重新检查
          </Button>

          <Typography.Paragraph type="secondary">
            如果SDK未加载，请检查：
            <br />1. 网络连接是否正常
            <br />2. CDN链接是否可访问: https://cdn.zama.ai/relayer-sdk-js/0.1.0-9/relayer-sdk-js.umd.cjs
            <br />3. 浏览器控制台是否有错误信息
          </Typography.Paragraph>
        </Space>
      </Card>
    </div>
  )
}
