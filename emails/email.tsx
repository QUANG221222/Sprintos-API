import { Body, Container, Head, Heading, Html, Link, Section, Text } from '@react-email/components'

interface LinkVerificationEmailProps {
  code?: string
  title?: string
  email?: string
  type?: string
  websiteDomain?: string
}

export const LinkVerificationEmail = ({ code, title, email, type, websiteDomain }: LinkVerificationEmailProps) => (
  <Html>
    <title>{title}</title>
    <Head />
    <Body style={main}>
      <Container style={container}>
        {/* <Text style={tertiary}>EMAIL VERIFICATION</Text> */}
        <Heading style={secondary}>Verify your email address</Heading>
        <Text style={paragraph}>
          Thanks for signing up. Please confirm this email address to complete your registration.
        </Text>
        <Section style={codeContainer}>
          <Link
            href={`${websiteDomain}/verification?email=${email}&code=${code}&type=${type}`}
            style={{
              ...OTPCode
            }}
          >
            Verify email
          </Link>
        </Section>
        <Text style={paragraph}>
          If the button does not work, copy and paste this link into your browser:
        </Text>
        <Link
          href={`${websiteDomain}/verification?email=${email}&code=${code}&type=${type}`}
          style={{
            ...paragraph,
            textDecoration: 'underline',
            wordBreak: 'break-all',
            color: '#0d9488',
            textAlign: 'center',
            fontSize: '12px',
            margin: '0 auto 16px'
          }}
        >
          {`${websiteDomain}/verification?email=${email}&code=${code}&type=${type}`}
        </Link>
        <Text style={paragraph}>This link will expire in 5 minutes.</Text>
        <Text style={paragraph}>If you did not request this email, you can ignore it.</Text>
        <Text style={paragraph}>
          Need help? Contact{' '}
          <Link href='mailto:wangcode2k5@gmail.com' style={link}>
            wangcode2k5@gmail.com
          </Link>{' '}
          if you have questions.
        </Text>
      </Container>
    </Body>
  </Html>
)

LinkVerificationEmail.PreviewProps = {
  code: '144833',
  title: 'Verify your email',
  email: 'user@example.com',
  websiteDomain: 'https://example.com'
} as LinkVerificationEmailProps

export default LinkVerificationEmail

const main = {
  backgroundColor: '#f8fafc',
  fontFamily: 'HelveticaNeue,Helvetica,Arial,sans-serif'
}

const container = {
  backgroundColor: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  boxShadow: '0 4px 12px rgba(13, 148, 136, 0.08)',
  marginTop: '24px',
  maxWidth: '560px',
  margin: '24px auto',
  padding: '48px 24px 60px'
}

const tertiary = {
  color: '#0d9488',
  fontSize: '11px',
  fontWeight: 700,
  fontFamily: 'HelveticaNeue,Helvetica,Arial,sans-serif',
  height: '16px',
  letterSpacing: '0.05em',
  lineHeight: '16px',
  margin: '16px 8px 8px 8px',
  textTransform: 'uppercase' as const,
  textAlign: 'center' as const
}

const secondary = {
  color: '#0f172a',
  display: 'inline-block',
  fontFamily: 'HelveticaNeue-Medium,Helvetica,Arial,sans-serif',
  fontSize: '22px',
  fontWeight: 700,
  lineHeight: '28px',
  margin: '0 8px 16px 8px',
  textAlign: 'center' as const,
}

const codeContainer = {
  margin: '24px auto 20px',
  verticalAlign: 'middle',
  width: '260px'
}

const OTPCode = {
  backgroundColor: '#0d9488',
  borderRadius: '8px',
  color: '#ffffff',
  display: 'inline-block',
  fontFamily: 'HelveticaNeue-Bold,Helvetica,Arial,sans-serif',
  fontSize: '15px',
  fontWeight: 600,
  letterSpacing: '0',
  lineHeight: '44px',
  margin: '0 auto',
  textDecoration: 'none',
  width: '100%',
  textAlign: 'center' as const
}

const paragraph = {
  color: '#475569',
  fontSize: '14px',
  fontFamily: 'HelveticaNeue,Helvetica,Arial,sans-serif',
  letterSpacing: '0',
  lineHeight: '22px',
  padding: '0 20px',
  margin: '0 0 12px 0',
  textAlign: 'center' as const
}

const link = {
  color: '#0d9488',
  textDecoration: 'underline'
}

const footer = {
  color: '#000',
  fontSize: '12px',
  fontWeight: 800,
  letterSpacing: '0',
  lineHeight: '23px',
  margin: '0',
  marginTop: '20px',
  fontFamily: 'HelveticaNeue,Helvetica,Arial,sans-serif',
  textAlign: 'center' as const,
  textTransform: 'uppercase' as const
}
