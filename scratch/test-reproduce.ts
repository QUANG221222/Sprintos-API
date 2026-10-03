import { NestFactory } from '@nestjs/core'
import { AppModule } from '../src/app.module'
import { AgentHarness } from '../src/routes/ai/agent/harness/agent.harness'
import { ContextBuilder } from '../src/routes/ai/agent/context/context.builder'

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule)
  const harness = app.get(AgentHarness)
  const contextBuilder = app.get(ContextBuilder)

  const context = await contextBuilder.resolveContext('default', undefined)
  context.webSearchMode = 'always'

  // Giả lập đúng 3 tin nhắn trong ảnh người dùng
  const messages = [
    { role: 'user' as const, content: 'tìm sinh viên 094205009997' },
    { role: 'assistant' as const, content: 'Không tìm thấy sinh viên trong hệ thống.' },
    { role: 'user' as const, content: 'tìm trên web á' },
    { role: 'assistant' as const, content: 'Tôi đã hoàn tất xử lý yêu cầu của bạn.' },
    { role: 'user' as const, content: 'thông tin đã tìm kiếm đâu' }
  ]

  console.log('=== BẮT ĐẦU CHẠY TEST TÁI HIỆN ===')
  await harness.executeStream(
    messages,
    context,
    (event) => {
      if (event.type === 'text') {
        process.stdout.write(`[TEXT: ${JSON.stringify(event.data.chunk)}] `)
      } else if (event.type === 'tool_start') {
        console.log(`\n[TOOL_START: ${event.data.name}]`, event.data.args)
      } else if (event.type === 'tool_end') {
        console.log(`\n[TOOL_END: ${event.data.name}] status=${event.data.status} outputLength=${event.data.outputSnippet?.length}`)
      } else if (event.type === 'status') {
        console.log(`\n[STATUS: ${event.data.stage}] ${event.data.message}`)
      } else if (event.type === 'done') {
        console.log(`\n[DONE] replyLength=${event.data.reply?.length}`)
        console.log('Reply Preview:', event.data.reply?.slice(0, 300))
      } else if (event.type === 'error') {
        console.log(`\n[ERROR]`, event.data.message)
      }
    }
  )

  await app.close()
}

run().catch(console.error)
