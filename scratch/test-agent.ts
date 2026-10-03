import { NestFactory } from '@nestjs/core'
import { AppModule } from '../src/app.module'
import { AgentService } from '../src/routes/ai/agent/agent.service'
import { OpenRouterService } from '../src/shared/services/openrouter.service'

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule)
  const agentService = app.get(AgentService)
  const openRouterService = app.get(OpenRouterService)

  console.log('--- TEST CHAT STREAM RE-PRODUCING ---')
  const messages = [
    { role: 'user' as const, content: 'thông tin đã tìm kiếm đâu' }
  ]

  await agentService.chatStream(
    messages,
    'default',
    undefined,
    (event) => {
      console.log(`[EVENT: ${event.type}]`, JSON.stringify(event.data).slice(0, 150))
    },
    undefined,
    'always' // Bật webSearch để test
  )

  await app.close()
}

run().catch(console.error)
