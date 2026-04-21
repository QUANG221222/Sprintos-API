import {
  EMAIL_RULE,
  EMAIL_RULE_MESSAGE,
  OBJECT_ID_RULE,
  OBJECT_ID_RULE_MESSAGE,
  PASSWORD_RULE,
  PASSWORD_RULE_MESSAGE,
  SECRET_KEY_MESSAGE,
  SECRET_KEY_RULE,
  USERNAME_RULE,
  USERNAME_RULE_MESSAGE,
  USER_ROLES,
  USER_ROLES_ON_PROJECT,
  NOTIFICATION_TYPES
} from '~/utils/validator'

describe('validator rules', () => {
  describe('OBJECT_ID_RULE', () => {
    test('matches valid object id', () => {
      // Arrange
      const value = '507f1f77bcf86cd799439011'

      // Act
      const isValid = OBJECT_ID_RULE.test(value)

      // Assert
      expect(isValid).toBe(true)
      expect(OBJECT_ID_RULE_MESSAGE).toContain('Object Id pattern')
    })

    test('rejects invalid object id', () => {
      // Arrange
      const value = 'invalid-object-id'

      // Act
      const isValid = OBJECT_ID_RULE.test(value)

      // Assert
      expect(isValid).toBe(false)
    })
  })

  describe('USERNAME_RULE', () => {
    test('accepts valid usernames', () => {
      // Arrange
      const validUsernames = ['john_doe', 'user123', 'A_B_9']

      // Act
      const results = validUsernames.map((value) => USERNAME_RULE.test(value))

      // Assert
      expect(results).toEqual([true, true, true])
      expect(USERNAME_RULE_MESSAGE).toContain('3-30 characters')
    })

    test('rejects usernames with invalid characters or length', () => {
      // Arrange
      const invalidUsernames = ['ab', 'has space', 'this-contains-dash']

      // Act
      const results = invalidUsernames.map((value) => USERNAME_RULE.test(value))

      // Assert
      expect(results).toEqual([false, false, false])
    })
  })

  describe('EMAIL_RULE', () => {
    test('accepts valid email', () => {
      // Arrange
      const email = 'john@example.com'

      // Act
      const isValid = EMAIL_RULE.test(email)

      // Assert
      expect(isValid).toBe(true)
      expect(EMAIL_RULE_MESSAGE).toContain('Email is invalid')
    })

    test('rejects invalid email', () => {
      // Arrange
      const email = 'john.example.com'

      // Act
      const isValid = EMAIL_RULE.test(email)

      // Assert
      expect(isValid).toBe(false)
    })
  })

  describe('PASSWORD_RULE', () => {
    test('accepts password with uppercase, number and special character', () => {
      // Arrange
      const password = 'Strong@123'

      // Act
      const isValid = PASSWORD_RULE.test(password)

      // Assert
      expect(isValid).toBe(true)
      expect(PASSWORD_RULE_MESSAGE).toContain('8-256 characters')
    })

    test('rejects weak password', () => {
      // Arrange
      const password = 'weakpass'

      // Act
      const isValid = PASSWORD_RULE.test(password)

      // Assert
      expect(isValid).toBe(false)
    })
  })

  describe('SECRET_KEY_RULE', () => {
    test('accepts valid 44-char base64 key', () => {
      // Arrange
      const key = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='

      // Act
      const isValid = SECRET_KEY_RULE.test(key)

      // Assert
      expect(isValid).toBe(true)
      expect(SECRET_KEY_MESSAGE).toContain('32-byte base64')
    })

    test('rejects invalid secret key format', () => {
      // Arrange
      const key = 'invalid-key'

      // Act
      const isValid = SECRET_KEY_RULE.test(key)

      // Assert
      expect(isValid).toBe(false)
    })
  })
})

describe('validator constants', () => {
  test('defines expected user roles', () => {
    // Arrange
    const expectedRoles = { ADMIN: 'admin', USER: 'user' }

    // Act
    const roles = USER_ROLES

    // Assert
    expect(roles).toEqual(expectedRoles)
  })

  test('defines expected project roles', () => {
    // Arrange
    const expectedProjectRoles = {
      OWNER: 'owner',
      MEMBER: 'member',
      VIEWER: 'viewer'
    }

    // Act
    const projectRoles = USER_ROLES_ON_PROJECT

    // Assert
    expect(projectRoles).toEqual(expectedProjectRoles)
  })

  test('contains key notification types used by the system', () => {
    // Arrange
    const requiredKeys = [
      'PROJECT_CREATED',
      'SPRINT_STARTED',
      'TASK_CREATED',
      'TASK_MOVED'
    ] as const

    // Act
    const existingKeys = requiredKeys.map((key) => NOTIFICATION_TYPES[key])

    // Assert
    expect(existingKeys).toEqual([
      'project_created',
      'sprint_started',
      'task_created',
      'task_moved'
    ])
  })
})
