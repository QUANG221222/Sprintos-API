import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: 'ollama',
  baseURL: 'http://192.168.1.4:11434/v1'
})

async function test() {
  const toolCallId = 'call_test_123'
  const messages: any[] = [
    {
      role: 'system',
      content: 'Bạn là trợ lý AI. Toàn bộ dữ liệu thực tế từ các công cụ đã được cung cấp đầy đủ ở trên. Bạn hãy đọc dữ liệu đó và trả lời trực tiếp câu hỏi của người dùng bằng tiếng Việt tự nhiên, chuyên nghiệp. TUYỆT ĐỐI KHÔNG gọi thêm công cụ, KHÔNG sinh bất kỳ thẻ <tool_call> hay mã gọi hàm nào nữa.'
    },
    {
      role: 'user',
      content: 'thông tin đã tìm kiếm đâu'
    },
    {
      role: 'assistant',
      content: '⚠️ LỜI GIẢI MÃI CHÍNH XÁC:\nTôi xin làm rõ: Tôi KHÔNG ĐÃ THỰC SỰ GỌI TOOL webSearch trong lần trả lời trước đó 😅\n\n🔍 Bây giờ tôi sẽ tra cứu thật sự!\nĐể tìm thông tin sinh viên có mã số 094205009997, tôi sẽ gọi webSearch với từ khóa tối ưu:',
      tool_calls: [
        {
          id: toolCallId,
          type: 'function',
          function: {
            name: 'webSearch',
            arguments: JSON.stringify({ query: 'sinh viên 094205009997 thông tin' })
          }
        }
      ]
    },
    {
      role: 'tool',
      tool_call_id: toolCallId,
      content: JSON.stringify({
        results: [
          { title: 'Danh sách sinh viên HCMUS', url: 'https://example.com/1', content: 'Danh sách sinh viên...' },
          { title: 'Cách cập nhật số điện thoại sinh viên', url: 'https://example.com/2', content: 'Bài viết...' }
        ]
      })
    }
  ]

  console.log('--- TEST 1: TRUYỀN TOOLS VÀO KÈM ---')
  const stream1 = await client.chat.completions.create({
    model: 'qwen3.5:4b',
    messages,
    tools: [
      {
        type: 'function',
        function: {
          name: 'webSearch',
          description: 'Search web',
          parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }
        }
      }
    ],
    tool_choice: 'auto',
    stream: true,
    temperature: 0.5
  })

  let output1 = ''
  let reasoning1 = ''
  let toolCalls1: any[] = []
  for await (const chunk of stream1) {
    const delta = chunk.choices[0]?.delta
    if (delta?.content) output1 += delta.content
    if ((delta as any)?.reasoning || (delta as any)?.reasoning_content) reasoning1 += ((delta as any)?.reasoning || (delta as any)?.reasoning_content)
    if (delta?.tool_calls) toolCalls1.push(...delta.tool_calls)
  }
  console.log('Output length:', output1.length)
  console.log('Output preview:', output1.slice(0, 200))
  console.log('Reasoning length:', reasoning1.length)
  console.log('Tool calls length:', toolCalls1.length)
}

test().catch(console.error)
