import { LinkVerificationEmail } from 'emails/email'
import { Injectable } from '@nestjs/common'
import { Resend } from 'resend'
import envConfig from '../config'
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
}
