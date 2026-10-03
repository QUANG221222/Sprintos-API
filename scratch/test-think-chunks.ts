import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: 'ollama',
  baseURL: 'http://192.168.1.4:11434/v1'
})

async function testChunks() {
  const stream = await client.chat.completions.create({
    model: 'qwen3.5:4b',
    messages: [
      { role: 'user', content: 'hãy suy nghĩ rồi trả lời: 1 + 1 bằng mấy' }
    ],
    stream: true
  })

  let count = 0
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta
    const content = delta?.content || ''
    const reasoning = (delta as any)?.reasoning_content || (delta as any)?.reasoning || ''
    count++
    if (content.includes('<think>') || content.includes('</think>') || content.includes('<') || content.includes('>')) {
      console.log(`Chunk #${count}: content=${JSON.stringify(content)}, reasoning=${JSON.stringify(reasoning)}`)
    }
  }
}

testChunks().catch(console.error)
