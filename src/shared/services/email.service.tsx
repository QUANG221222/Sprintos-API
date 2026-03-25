import { OTPEmail } from 'emails/email'
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

  sendOTP(payload: { email: string; code: string }) {
    const subject = 'Your OTP Code'

    return this.resend.emails.send({
      from: 'E-commerce <no-reply@nhatquangdev2005.id.vn>',
      to: [payload.email],
      subject: subject,
      react: <OTPEmail code={payload.code} title={subject} />
      // html: otpTemplate.replace('{{subject}}', subject).replace('{{code}}', payload.code)
    })
  }
}
