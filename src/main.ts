import { NestExpressApplication } from '@nestjs/platform-express'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import envConfig from './shared/config'
import cookieParser from 'cookie-parser'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { cleanupOpenApiDoc } from 'nestjs-zod'

import * as path from 'path'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const processors = require(path.join(process.cwd(), 'node_modules/zod/v4/core/json-schema-processors.cjs'))

// Monkeypatch Zod v4 date processor to support date types in JSON Schema / Swagger
if (processors && processors.allProcessors) {
  const customDateProcessor = (_schema: any, _ctx: any, json: any) => {
    json.type = 'string'
    json.format = 'date-time'
  }
  processors.dateProcessor = customDateProcessor
  processors.allProcessors.date = customDateProcessor
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)

  app.set('trust proxy', 1)
  app.setGlobalPrefix('api')

  app.enableCors({
    origin: [envConfig.WEBSITE_DOMAIN_PRODUCTION, envConfig.WEBSITE_DOMAIN_DEVELOPMENT],
    credentials: true
  })

  const config = new DocumentBuilder()
    .setTitle('Sprintos API')
    .setDescription('Sprintos Task and Project Management API description')
    .setVersion('1.0')
    .addCookieAuth('accessToken', {
      type: 'apiKey',
      in: 'cookie',
      name: 'accessToken',
      description: 'Access Token cookie'
    })
    .build()

  const document = SwaggerModule.createDocument(app, config)
  SwaggerModule.setup('api/docs', app, cleanupOpenApiDoc(document))

  app.use(cookieParser())
  await app.listen(envConfig.LOCAL_APP_PORT ?? 8080)

  console.log('Application is running on port:', envConfig.LOCAL_APP_PORT ?? 8080)
}
void bootstrap()
