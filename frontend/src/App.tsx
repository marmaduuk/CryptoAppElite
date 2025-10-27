import { useEffect, useState } from 'react'
import './App.css'
import { getSigner, addLocalNetwork, isWalletInstalled } from './lib/ethers'
import { Link } from 'react-router-dom'
import { Layout, Button, InputNumber, Typography, Space, Tag, message, Select, App as AntdApp } from 'antd'
import { WalletOutlined, SendOutlined, ThunderboltOutlined, BarChartOutlined } from '@ant-design/icons'
import { submitEncryptedSteps } from './lib/fhevm'
import { initMockSDK } from './lib/mock-fhevm'
import { LOCAL_CONFIG, SEPOLIA_CONFIG } from './config'

function App() {
  const { notification: appNotification } = AntdApp.useApp()
  const [account, setAccount] = useState<string>('')
  const [steps, setSteps] = useState<string>('0')
  const [contracts, setContracts] = useState<{token?: string, rewards?: string, encRewards?: string}>({})
  const [chainId, setChainId] = useState<number>(31337) // 默认本地网络
  const [currentConfig, setCurrentConfig] = useState(LOCAL_CONFIG)
  const [sdkLoaded, setSdkLoaded] = useState(false)
  const [lastSubmitTime, setLastSubmitTime] = useState<number>(0)
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [showCircuitBreakerHelp, setShowCircuitBreakerHelp] = useState<boolean>(false)

  useEffect(() => {
    setContracts({
      token: currentConfig.token,
      rewards: currentConfig.rewards,
      encRewards: currentConfig.encRewards
    })
    
    // 初始化Mock SDK（如果需要在没有FHEVM环境时使用）
    initMockSDK()
  }, [currentConfig])

  useEffect(() => {
    // 检查FHEVM SDK是否加载（包括Mock模式）
    const checkSDK = () => {
      if (window.relayerSDK) {
        setSdkLoaded(true)
        console.log('FHEVM SDK已加载')
      } else {
        // 在开发环境或本地网络，即使没有真实SDK也允许使用Mock模式
        if (process.env.NODE_ENV === 'development' || chainId === 31337) {
          setSdkLoaded(true)
          console.log('使用Mock FHEVM模式')
        } else {
          setSdkLoaded(false)
          console.log('FHEVM SDK未加载')
        }
      }
    }
    
    checkSDK()
    // 每2秒检查一次，直到SDK加载完成
    const interval = setInterval(checkSDK, 2000)
    
    return () => clearInterval(interval)
  }, [chainId])

  // 自动连接钱包
  useEffect(() => {
    const autoConnect = async () => {
      try {
        // 检查钱包是否已安装
        if (!isWalletInstalled()) {
          console.log('未检测到钱包插件，跳过自动连接')
          return
        }

        const accounts = await (window as any).ethereum.request({ method: 'eth_accounts' })
        if (accounts.length > 0) {
          const signer = await getSigner()
          setAccount(await signer.getAddress())
          const network = await signer.provider.getNetwork()
          setChainId(Number(network.chainId))
          console.log('自动连接钱包成功:', await signer.getAddress())
        }
      } catch (error) {
        console.log('自动连接钱包失败:', error)
        // 自动连接失败时不显示错误提示，避免干扰用户体验
      }
    }

    autoConnect()
  }, [])

  const connect = async () => {
    try {
      // 检查钱包是否已安装
      if (!isWalletInstalled()) {
        message.error('未检测到钱包插件。请先安装 MetaMask 或其他 Web3 钱包扩展程序。')
        return
      }

      const signer = await getSigner()
      setAccount(await signer.getAddress())
      const network = await signer.provider.getNetwork()
      setChainId(Number(network.chainId))
      message.success('钱包连接成功！')
    } catch (error: any) {
      console.error('连接钱包失败:', error)

      // 根据错误类型显示不同的提示信息
      let errorMessage = '连接钱包失败'

      if (error?.message?.includes('用户拒绝了')) {
        errorMessage = '用户取消了连接请求'
      } else if (error?.message?.includes('未检测到钱包')) {
        errorMessage = '未检测到钱包插件，请安装 MetaMask 或其他 Web3 钱包'
      } else if (error?.message?.includes('network')) {
        errorMessage = '网络连接失败，请检查网络设置'
      } else {
        errorMessage = `连接失败: ${error?.message || error}`
      }

      message.error(errorMessage)
    }
  }

  const switchNetwork = async (networkType: 'local' | 'sepolia') => {
    try {
      // 检查钱包是否已安装
      if (!isWalletInstalled()) {
        message.error('未检测到钱包插件。请先安装 MetaMask 或其他 Web3 钱包扩展程序。')
        return
      }

      if (networkType === 'local') {
        await addLocalNetwork()
        setCurrentConfig(LOCAL_CONFIG)
        message.success('已切换到测试网络')
      } else {
        // TODO: 实现切换到Sepolia的逻辑
        setCurrentConfig(SEPOLIA_CONFIG)
        message.success('已切换到Sepolia测试网')
      }
    } catch (error: any) {
      console.error('网络切换失败:', error)

      // 根据错误类型显示不同的提示信息
      let errorMessage = '网络切换失败'

      if (error?.message?.includes('未检测到钱包')) {
        errorMessage = '未检测到钱包插件，请安装 MetaMask 或其他 Web3 钱包'
      } else if (error?.message?.includes('用户拒绝了')) {
        errorMessage = '用户取消了网络切换请求'
      } else if (error?.code === 4902) {
        errorMessage = '该网络尚未添加到钱包中，请先手动添加'
      } else {
        errorMessage = `网络切换失败: ${error?.message || error}`
      }

      message.error(errorMessage)
    }
  }

  const submitSteps = async () => {
    if (!sdkLoaded) {
      message.error('SDK正在加载中，请稍候再试')
      return
    }

    if (!steps || steps === '0') {
      message.warning('请输入有效的步数')
      return
    }

    // 检查是否正在提交中
    if (isSubmitting) {
      message.warning('正在提交中，请稍候...')
      return
    }

    // 频率限制：至少间隔3秒
    const now = Date.now()
    const timeSinceLastSubmit = now - lastSubmitTime
    if (timeSinceLastSubmit < 3000) {
      const remainingTime = Math.ceil((3000 - timeSinceLastSubmit) / 1000)
      message.warning(`请等待 ${remainingTime} 秒后再提交，以避免网络请求过于频繁`)
      return
    }

    setIsSubmitting(true)
    setLastSubmitTime(now)

    let loadingMessage: any = null

    try {
      const signer = await getSigner()
      const userAddress = await signer.getAddress()
      
      console.log('🚀 开始提交流程...')
      console.log('👤 用户地址:', userAddress)
      console.log('📊 步数:', steps)
      
      loadingMessage = message.loading('正在处理数据并提交...', 0)
      
      // 检查是否有加密合约地址，优先使用加密提交
      if (contracts.encRewards && contracts.encRewards !== '0x0000000000000000000000000000000000000000') {
        console.log('🔐 使用加密提交模式')
        console.log('📝 加密合约地址:', contracts.encRewards)
        
        const tx = await submitEncryptedSteps(signer, contracts.encRewards, BigInt(steps))
        console.log('📋 交易哈希:', tx.hash)
        
        loadingMessage = message.loading('等待交易确认...', 0)
        
        const receipt = await tx.wait()
        console.log('✅ 交易确认成功')
        console.log('📈 区块号:', receipt?.blockNumber)
        console.log('⛽ Gas使用量:', receipt?.gasUsed?.toString())
        
        message.destroy()
        appNotification.success({
          message: '🎉 加密提交成功！',
          description: `步数: ${steps}\n交易哈希: ${tx.hash.slice(0, 10)}...\n区块号: ${receipt?.blockNumber}`,
          duration: 8,
          placement: 'topRight'
        })
        
      } else if (contracts.rewards) {
        console.log('📝 使用普通提交模式')
        console.log('📝 普通合约地址:', contracts.rewards)
        
        const abi = ["function submitDaily(uint256 steps)"]
        const { ethers } = await import('ethers')
        const contract = new ethers.Contract(contracts.rewards, abi, signer)
        
        const tx = await contract.submitDaily(BigInt(steps))
        console.log('📋 交易哈希:', tx.hash)
        
        loadingMessage = message.loading('等待交易确认...', 0)
        
        const receipt = await tx.wait()
        console.log('✅ 交易确认成功')
        console.log('📈 区块号:', receipt?.blockNumber)
        console.log('⛽ Gas使用量:', receipt?.gasUsed?.toString())
        
        message.destroy()
        appNotification.success({
          message: '🎉 普通提交成功！',
          description: `步数: ${steps}\n交易哈希: ${tx.hash.slice(0, 10)}...\n区块号: ${receipt?.blockNumber}`,
          duration: 8,
          placement: 'topRight'
        })
        
      } else {
        message.destroy()
        message.error('没有可用的合约地址，请检查网络连接')
        return
      }
      
    } catch (e: any) {
      console.error('❌ 提交错误:', e)
      
      if (loadingMessage) {
        message.destroy()
      }
      
      // 根据错误类型显示不同的提示信息
      let errorMessage = '提交失败'
      let errorDescription = ''

      // 检查是否是Circuit Breaker相关错误
      if (e?.message?.includes('circuit breaker') ||
          e?.message?.includes('Execution prevented') ||
          e?.data?.cause?.isBrokenCircuitError) {
        errorMessage = 'MetaMask Circuit Breaker 触发'
        errorDescription = `MetaMask 的保护机制被激活，阻止了交易。

请尝试刷新页面或重新连接钱包来解决此问题。`
        setShowCircuitBreakerHelp(true)
      } else if (e?.message?.includes('already submitted today')) {
        errorMessage = '今日已提交过'
        errorDescription = '您今天已经提交过步数记录，请明天再试'
      } else if (e?.message?.includes('user rejected')) {
        errorMessage = '交易已取消'
        errorDescription = '您取消了交易操作'
      } else if (e?.message?.includes('insufficient funds')) {
        errorMessage = '账户余额不足'
        errorDescription = '您的账户余额不足以支付交易的Gas费用'
      } else if (e?.message?.includes('network')) {
        errorMessage = '网络连接失败'
        errorDescription = '请检查您的网络连接，或尝试切换到其他RPC节点'
      } else if (e?.message?.includes('execution reverted')) {
        errorMessage = '合约执行失败'
        errorDescription = `智能合约执行失败: ${e.message}`
      } else if (e?.message?.includes('UNKNOWN_ERROR')) {
        errorMessage = '未知网络错误'
        errorDescription = '发生了未知的网络错误，可能是RPC节点问题，请稍后重试'
      } else {
        errorMessage = '提交失败'
        errorDescription = `错误详情: ${e?.message || e}`
      }
      
      appNotification.error({
        message: `❌ ${errorMessage}`,
        description: errorDescription,
        duration: 10, // 增加显示时间，让用户有更多时间阅读
        placement: 'topRight'
      })
    } finally {
      // 重置提交状态
      setIsSubmitting(false)
    }
  }

  return (
    <Layout style={{minHeight: '100vh'}}>
      <Layout.Header style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
        <Space size={12}>
          <ThunderboltOutlined style={{color:'#13c2c2'}} />
          <Typography.Title level={4} style={{margin:0}}>Move to Earn</Typography.Title>
          <Tag color={chainId === 31337 ? 'green' : chainId === 11155111 ? 'geekblue' : 'default'}>
            {chainId === 31337 ? '测试网络' : chainId === 11155111 ? 'Sepolia' : `Chain ${chainId}`}
          </Tag>
        </Space>
        <Space>
          <Select
            value={currentConfig.network}
            onChange={(value) => switchNetwork(value as 'local' | 'sepolia')}
            style={{ width: 120 }}
            options={[
              { value: 'local', label: '测试网络' },
              { value: 'sepolia', label: 'Sepolia' }
            ]}
          />
          <Button
            type="primary"
            icon={<WalletOutlined />}
            onClick={connect}
            disabled={!isWalletInstalled()}
          >
            {account
              ? `${account.slice(0,6)}...${account.slice(-4)}`
              : (!isWalletInstalled() ? '请安装钱包' : '连接钱包')
            }
          </Button>
          <Button icon={<BarChartOutlined />}><Link to="/results" style={{color:'inherit'}}>查看结果</Link></Button>
          <Button><Link to="/sdk-test" style={{color:'inherit'}}>SDK测试</Link></Button>
        </Space>
      </Layout.Header>
      <Layout.Content style={{padding: 24, maxWidth: 900, margin: '0 auto', width: '100%'}}>
        <Space direction="vertical" size="large" style={{width:'100%'}}>
          <Typography.Title level={2}>每日步数提交</Typography.Title>
          <Space wrap>
            <InputNumber
              min={0}
              value={Number(steps)}
              onChange={(v)=> setSteps(String(v ?? 0))}
              placeholder="输入步数, 0=签到"
            />
            <Button
              type="primary"
              onClick={submitSteps}
              disabled={!sdkLoaded || isSubmitting}
              icon={<SendOutlined />}
              loading={isSubmitting}
            >
              {isSubmitting ? '提交中...' : (!sdkLoaded ? 'SDK加载中...' : '提交步数')}
            </Button>
          </Space>

          {/* Circuit Breaker 帮助区域 */}
          {showCircuitBreakerHelp && (
            <Space direction="vertical" size="small" style={{width: '100%', marginTop: 16}}>
              <Typography.Text type="danger" strong>
                🔧 Circuit Breaker 解决方案
              </Typography.Text>
              <Space direction="vertical" size="small">
                <Button
                  type="default"
                  onClick={() => window.location.reload()}
                  style={{width: '100%'}}
                >
                  🔄 刷新页面
                </Button>
                <Button
                  type="default"
                  onClick={connect}
                  style={{width: '100%'}}
                >
                  🔗 重新连接钱包
                </Button>
                <Button
                  type="default"
                  onClick={() => setShowCircuitBreakerHelp(false)}
                  style={{width: '100%'}}
                >
                  隐藏此帮助
                </Button>
              </Space>
              <Typography.Text type="secondary" style={{fontSize: '12px'}}>
                Circuit Breaker 通常会在几分钟后自动重置。如果问题持续存在，请尝试重启浏览器。
              </Typography.Text>
            </Space>
          )}
        </Space>
      </Layout.Content>
      <Layout.Footer style={{textAlign:'center'}}>
        Move to Earn © {new Date().getFullYear()}
      </Layout.Footer>
    </Layout>
  )
}

export default App
