import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import envConfig from './shared/config'
import cookieParser from 'cookie-parser'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  await app.listen(envConfig.LOCAL_APP_PORT ?? 8080)
  app.use(cookieParser())
}
bootstrap()
