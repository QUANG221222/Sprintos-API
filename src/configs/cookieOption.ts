import ms from 'ms'
const isProduction = process.env.BUILD_MODE === 'production'

const cookieOptions = {
  httpOnly: true, // prevent client-side JS access
  secure: isProduction, // prevent cookie access in non-HTTPS
  sameSite: isProduction ? ('none' as const) : ('lax' as const), // CSRF protection
  path: '/', // cookie available for entire site
  domain: isProduction ? process.env.COOKIE_DOMAIN : undefined, // set domain in production
  maxAge: ms('14 days') // cookie expiry time
}
export { cookieOptions }
