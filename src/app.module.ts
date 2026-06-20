import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { SharedModule } from './shared/shared.module'
import { AuthModule } from './routes/auth/auth.module'
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core'
import CustomZodValidationPipe from './shared/pipes/custom-zod.validation.pipe'
import { ZodSerializerInterceptor } from 'nestjs-zod'
import { HttpExceptionFilter } from './shared/filters/http-exception.filter'
import { ProjectModule } from './routes/project/project.module'
import { ProjectMemberModule } from './routes/project/project-member/project-member.module'
import { SprintModule } from './routes/sprint/sprint.module'
import { BoardColumnModule } from './routes/board-column/board-column.module'
import { TaskModule } from './routes/task/task.module'
import { PermissionModule } from './routes/permission/permission.module'
import { RoleModule } from './routes/role/role.module'
import { MediaModule } from './routes/media/media.module';

@Module({
  imports: [
    SharedModule,
    AuthModule,
    PermissionModule,
    RoleModule,
    ProjectModule,
    ProjectMemberModule,
    SprintModule,
    BoardColumnModule,
    TaskModule,
    MediaModule
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_PIPE,
      useClass: CustomZodValidationPipe
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ZodSerializerInterceptor
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter
    }
  ]
})
export class AppModule {}
