import {
  isValidBase64,
  normalizeBase64,
  sanitizeFileName
} from '~/utils/formatBase64File'

describe('sanitizeFileName', () => {
  test('sanitizes invalid characters and keeps extension', () => {
    // Arrange
    const fileName = 'my file@2026!.png'

    // Act
    const result = sanitizeFileName(fileName)

    // Assert
    expect(result).toBe('my_file_2026_.png')
  })

  test('truncates file name by max length (excluding extension)', () => {
    // Arrange
    const fileName = 'this_is_a_very_long_file_name_for_avatar_upload.jpg'

    // Act
    const result = sanitizeFileName(fileName, 10)

    // Assert
    expect(result).toBe('this_is_a_.jpg')
  })

  test('works with file name without extension', () => {
    // Arrange
    const fileName = 'file name with spaces'

    // Act
    const result = sanitizeFileName(fileName)

    // Assert
    expect(result).toBe('file_name_with_spaces')
  })
})

describe('normalizeBase64', () => {
  test('returns input as-is when data prefix already exists', () => {
    // Arrange
    const input = 'data:image/png;base64,abc123'

    // Act
    const result = normalizeBase64(input, 'image/png')

    // Assert
    expect(result).toBe('data:image/png;base64,abc123')
  })

  test('adds missing data prefix using provided mime type', () => {
    // Arrange
    const input = 'abc123'

    // Act
    const result = normalizeBase64(input, 'image/jpeg')

    // Assert
    expect(result).toBe('data:image/jpeg;base64,abc123')
  })

  test('uses default mime type when file type is empty', () => {
    // Arrange
    const input = 'abc123'

    // Act
    const result = normalizeBase64(input, '')

    // Assert
    expect(result).toBe('data:application/octet-stream;base64,abc123')
  })
})

describe('isValidBase64', () => {
  test('returns true for valid normalized base64 string', () => {
    // Arrange
    const value = 'data:image/png;base64,abc123'

    // Act
    const result = isValidBase64(value)

    // Assert
    expect(result).toBe(true)
  })

  test('returns false when missing data prefix', () => {
    // Arrange
    const value = 'abc123'

    // Act
    const result = isValidBase64(value)

    // Assert
    expect(result).toBe(false)
  })

  test('returns false when missing base64 marker', () => {
    // Arrange
    const value = 'data:image/png,abc123'

    // Act
    const result = isValidBase64(value)

    // Assert
    expect(result).toBe(false)
  })

  test('returns false when base64 content is empty', () => {
    // Arrange
    const value = 'data:image/png;base64,'

    // Act
    const result = isValidBase64(value)

    // Assert
    expect(result).toBe(false)
  })
})
