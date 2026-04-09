import { UnauthorizedException } from '@nestjs/common'
import { randomInt } from 'crypto'
import { Prisma } from '~/generated/prisma/client'

// Type predicates for Prisma errors
export function isUniqueConstraintPrismaError(error: any): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

export function isNotFoundPrismaError(error: any): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025'
}

export function isForeignKeyConstraintPrismaError(error: any): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003'
}

// Create OTP
export function generateOTP() {
  return String(randomInt(100000, 1000000))
}

// Get token from cookie
export function extractTokenFromCookie(request: any, tokenName: string): string {
  const cookieHeader = request.headers.cookie
  if (!cookieHeader) {
    throw new UnauthorizedException(`${tokenName} not found`)
  }

  const token = cookieHeader
    .split(';')
    .find((cookie: string) => cookie.trim().startsWith(`${tokenName}=`))
    ?.split('=')[1]

  if (!token) {
    throw new UnauthorizedException(`${tokenName} not found`)
  }

  return token
}
