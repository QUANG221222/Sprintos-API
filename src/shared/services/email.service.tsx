import { LinkVerificationEmail } from 'emails/email'
import { Injectable } from '@nestjs/common'
import { Resend } from 'resend'
import envConfig from '../config'
import { LinkVerificationInvitationEmail } from 'emails/email-invite'
// import fs from 'fs'
// import path from 'path'
// const otpTemplate = fs.readFileSync(path.resolve('src/shared/view/otp.html'), 'utf8')
@Injectable()
export class EmailService {
  private resend: Resend
  constructor() {
    this.resend = new Resend(envConfig.RESEND_API_KEY)
  }

  sendLink(payload: { email: string; code: string; websiteDomain: string; type: string }) {
    const subject = 'Your Link Verification Code'

    return this.resend.emails.send({
      from: 'Sprintos <no-reply@nhatquangdev2005.id.vn>',
      to: [payload.email],
      subject: subject,
      react: (
        <LinkVerificationEmail
          code={payload.code}
          email={payload.email}
          title={subject}
          websiteDomain={payload.websiteDomain}
          type={payload.type}
        />
      )
      // html: otpTemplate.replace('{{subject}}', subject).replace('{{code}}', payload.code)
    })
  }

  sendInvitationLink(payload: { email: string; token: string; websiteDomain: string; role: string; projectId: string }) {
    const subject = 'Your Link Invitation Verification Code'

    return this.resend.emails.send({
      from: 'Sprintos <no-reply@nhatquangdev2005.id.vn>',
      to: [payload.email],
      subject: subject,
      react: (
        <LinkVerificationInvitationEmail
          token={payload.token}
          email={payload.email}
          title={subject}
          websiteDomain={payload.websiteDomain}
          role={payload.role}
          projectId={payload.projectId}
        />
      )
      // html: otpTemplate.replace('{{subject}}', subject).replace('{{code}}', payload.code)
    })
  }

  sendTaskReminderEmail(payload: {
    email: string
    taskTitle: string
    projectName: string
    dueDate: string
    reminderText: string
    isUrgent?: boolean
  }) {
    const subject = payload.isUrgent
      ? `[Urgent] Task Due Tomorrow: ${payload.taskTitle}`
      : `[Reminder] Task Due Soon: ${payload.taskTitle}`

    return this.resend.emails.send({
      from: 'Sprintos <no-reply@nhatquangdev2005.id.vn>',
      to: [payload.email],
      subject: subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #0d9488; margin-top: 0;">SprintOS Task Due Reminder</h2>
          <p style="color: #334155; font-size: 15px;">${payload.reminderText}</p>
          <div style="background-color: #f8fafc; padding: 16px; border-radius: 6px; margin: 20px 0; border: 1px solid #f1f5f9;">
            <p style="margin: 6px 0; color: #475569;"><strong>Project:</strong> ${payload.projectName}</p>
            <p style="margin: 6px 0; color: #475569;"><strong>Task:</strong> ${payload.taskTitle}</p>
            <p style="margin: 6px 0; color: #475569;"><strong>Due Date:</strong> ${payload.dueDate}</p>
          </div>
          <p style="color: #64748b; font-size: 13px;">Please access your SprintOS Workspace to complete or update the task progress.</p>
        </div>
      `
    })
  }
}
