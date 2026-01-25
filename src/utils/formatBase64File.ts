/**
 * Sanitize file name
 * @param fileName Original file name
 * @param maxLength Maximum length (default 30)
 * @returns Processed file name WITH extension
 */
export const sanitizeFileName = (
  fileName: string,
  maxLength: number = 30
): string => {
  const lastDotIndex = fileName.lastIndexOf('.')
  const name = lastDotIndex > 0 ? fileName.substring(0, lastDotIndex) : fileName
  const ext = lastDotIndex > 0 ? fileName.substring(lastDotIndex) : ''

  // Limit length of name (excluding extension)
  let cleanName = name.replace(/[^a-zA-Z0-9-_]/g, '_')
  if (cleanName.length > maxLength) {
    cleanName = cleanName.substring(0, maxLength)
  }

  // Return name + extension
  return cleanName + ext
}

/**
 * Normalize base64 string - add data URL prefix if missing
 * @param base64String Base64 string
 * @param fileType MIME type of the file
 * @returns Normalized base64 string with data URL prefix
 */
export const normalizeBase64 = (
  base64String: string,
  fileType: string
): string => {
  // If already has data URL prefix, return as is
  if (base64String.startsWith('data:')) {
    return base64String
  }

  // If missing prefix, add it
  // Detect MIME type from fileType or default
  const mimeType = fileType || 'application/octet-stream'
  return `data:${mimeType};base64,${base64String}`
}

/**
 * Validate base64 string after normalization
 * @param base64String Base64 string to validate
 * @returns boolean
 */
export const isValidBase64 = (base64String: string): boolean => {
  // Check if string starts with data URL prefix
  if (!base64String.startsWith('data:')) {
    return false
  }

  // Check if contains base64 data
  if (!base64String.includes('base64,')) {
    return false
  }

  // Check if has actual base64 content after prefix
  const base64Content = base64String.split('base64,')[1]
  if (!base64Content || base64Content.length === 0) {
    return false
  }

  return true
}
