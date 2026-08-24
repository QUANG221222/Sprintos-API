import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Job } from 'bullmq'
import { Logger } from '@nestjs/common'
import { MAIL_QUEUE, QUEUE_JOBS } from './queue.constant'
import { EmailService } from '~/shared/services/email.service'

@Processor(MAIL_QUEUE)
export class MailProcessor extends WorkerHost {
  private readonly logger = new Logger(MailProcessor.name)

  constructor(private readonly emailService: EmailService) {
    super()
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`Processing mail job: ${job.name} (Job ID: ${job.id})`)

    switch (job.name) {
      case QUEUE_JOBS.SEND_VERIFICATION_MAIL: {
        const {email, code, websiteDomain, type } = job.data
        const result = await this.emailService.sendLink({ email, code, websiteDomain, type })
        this.logger.log(`Verification mail sent to ${email}`)
        return result
      }

      case QUEUE_JOBS.SEND_INVITATION_MAIL: {
        const { email, token, websiteDomain, role, projectId } = job.data
        const result = await this.emailService.sendInvitationLink({
          email,
          token,
          websiteDomain,
          role,
          projectId
        })
        this.logger.log(`Invitation mail sent to ${email}`)
        return result
      }

      case QUEUE_JOBS.SEND_TASK_REMINDER_MAIL: {
        const result = await this.emailService.sendTaskReminderEmail(job.data)
        this.logger.log(`Task reminder mail sent to ${job.data.email}`)
        return result
      }

      default: {
        this.logger.warn(`Unknown mail job: ${job.name}`)
      }
    }
  }

}