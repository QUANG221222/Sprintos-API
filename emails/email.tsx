import { Body, Container, Head, Heading, Html, Img, Link, Section, Text } from '@react-email/components'

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
        <Img
          src={`https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExdDlpa21sc2NhNDdtZ2NoNXFmc2J4ODhkMWdocXB6b2YyMnBoaGw3YiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/OuQmhmAAdJFLi/giphy.gif`}
          width='212'
          height='88'
          alt='Plaid'
          style={logo}
        />
        <Text style={tertiary}>LINK TO {title}</Text>
        <Heading style={secondary}>Please click the link below:</Heading>
        <Section style={codeContainer}>
          <Link
            href={`${websiteDomain}/verification?email=${email}&code=${code}&type=${type}`}
            style={{
              ...OTPCode
            }}
          >
            Verify Email
          </Link>
        </Section>
        {/* User can copy the link to verify their email */}
        <Text style={paragraph}>Or copy the link below to verify your email:</Text>
        <Link
          href={`${websiteDomain}/verification?email=${email}&code=${code}&type=${type}`}
          style={{
            ...paragraph,
            textDecoration: 'underline',
            wordBreak: 'break-all',
            color: 'blue',
            textAlign: 'center'
          }}
        >
          {`${websiteDomain}/verification?email=${email}&code=${code}&type=${type}`}
        </Link>
        <Text style={paragraph}>This link will expire in 5 minutes.</Text>
        <Text style={paragraph}>Not expecting this email?</Text>
        <Text style={paragraph}>
          Contact{' '}
          <Link href='mailto:wangcode2k5@gmail.com' style={link}>
            wangcode2k5@gmail.com
          </Link>{' '}
          if you did not request this link.
        </Text>
      </Container>
    </Body>
  </Html>
)

LinkVerificationEmail.PreviewProps = {
  code: '144833',
  title: 'Verify Your Identity',
  email: 'user@example.com',
  websiteDomain: 'https://example.com'
} as LinkVerificationEmailProps

export default LinkVerificationEmail

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

const logo = {
  margin: '0 auto'
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
  marginBottom: '0',
  marginTop: '0',
  marginLeft: '40px',
  textAlign: 'center' as const
}

const codeContainer = {
  background: 'rgba(0,0,0,.05)',
  borderRadius: '4px',
  margin: '16px auto 14px',
  verticalAlign: 'middle',
  width: '280px'
}

const OTPCode = {
  color: '#000',
  display: 'inline-block',
  fontFamily: 'HelveticaNeue-Bold',
  fontSize: '32px',
  fontWeight: 700,
  letterSpacing: '6px',
  lineHeight: '40px',
  paddingBottom: '8px',
  paddingTop: '8px',
  margin: '0 auto',
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
