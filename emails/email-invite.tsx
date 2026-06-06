import { Body, Container, Head, Heading, Html, Link, Section, Text } from '@react-email/components'

interface LinkVerificationInvitationEmailProps {
  token?: string
  title?: string
  email?: string
  role?: string
  websiteDomain?: string
  projectId?: number
}

export const LinkVerificationInvitationEmail = ({ token, title, email, role, websiteDomain, projectId }: LinkVerificationInvitationEmailProps) => (
  <Html>
    <title>{title}</title>
    <Head />
    <Body style={main}>
      <Container style={container}>
        {/* <Text style={tertiary}>EMAIL VERIFICATION</Text> */}
        <Heading style={secondary}>Project Invitation</Heading>
        <Text style={paragraph}>
          You have been invited to join a project on Sprintos as a {role}. Please click the button below to accept this invitation.
        </Text>
        <Section style={codeContainer}>
          <Link
            href={`${websiteDomain}/verify?email=${email}&token=${token}&role=${role}&projectId=${projectId}`}
            style={{
              ...OTPCode
            }}
          >
            Accept Invitation
          </Link>
        </Section>
        <Text style={paragraph}>
          If the button does not work, copy and paste this link into your browser:
        </Text>
        <Link
          href={`${websiteDomain}/verify?email=${email}&token=${token}&role=${role}&projectId=${projectId}`}
          style={{
            ...paragraph,
            textDecoration: 'underline',
            wordBreak: 'break-all',
            color: 'blue',
            textAlign: 'center',
            fontSize: '12px',
            margin: '0 auto 16px'
          }}
        >
          {`${websiteDomain}/verify?email=${email}&token=${token}&role=${role}&projectId=${projectId}`}
        </Link>
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

LinkVerificationInvitationEmail.PreviewProps = {
  token: '144833',
  title: 'Verify your email',
  email: 'user@example.com',
  role: 'user',
  websiteDomain: 'https://example.com',
  projectId: 1
} as LinkVerificationInvitationEmailProps

export default LinkVerificationInvitationEmail

const main = {
  backgroundColor: '#ffffff',
  fontFamily: 'HelveticaNeue,Helvetica,Arial,sans-serif'
}

const container = {
  backgroundColor: '#ffffff',
  border: '1px solid #eee',
  borderRadius: '5px',
  boxShadow: '0 5px 10px rgba(20,50,70,.2)',
  marginTop: '20px',
  maxWidth: '700px',
  margin: '0 auto',
  padding: '68px 0 130px'
}

const tertiary = {
  color: '#0a85ea',
  fontSize: '11px',
  fontWeight: 700,
  fontFamily: 'HelveticaNeue,Helvetica,Arial,sans-serif',
  height: '16px',
  letterSpacing: '0',
  lineHeight: '16px',
  margin: '16px 8px 8px 8px',
  textTransform: 'uppercase' as const,
  textAlign: 'center' as const
}

const secondary = {
  color: '#000',
  display: 'inline-block',
  fontFamily: 'HelveticaNeue-Medium,Helvetica,Arial,sans-serif',
  fontSize: '20px',
  fontWeight: 500,
  lineHeight: '24px',
  margin: '0 8px 16px 8px',
  textAlign: 'center' as const,
}

const codeContainer = {
  margin: '20px auto 16px',
  verticalAlign: 'middle',
  width: '280px'
}

const OTPCode = {
  backgroundColor: '#0a85ea',
  borderRadius: '6px',
  color: '#ffffff',
  display: 'inline-block',
  fontFamily: 'HelveticaNeue-Bold',
  fontSize: '16px',
  fontWeight: 700,
  letterSpacing: '0',
  lineHeight: '44px',
  margin: '0 auto',
  textDecoration: 'none',
  width: '100%',
  textAlign: 'center' as const
}

const paragraph = {
  color: '#444',
  fontSize: '15px',
  fontFamily: 'HelveticaNeue,Helvetica,Arial,sans-serif',
  letterSpacing: '0',
  lineHeight: '23px',
  padding: '0 40px',
  margin: '0',
  textAlign: 'center' as const
}

const link = {
  color: '#444',
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
