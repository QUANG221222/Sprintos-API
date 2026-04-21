// Define permission in system
const PERMISSIONS = {
  // Project permissions
  PROJECT_CREATE: 'project:create',
  PROJECT_READ: 'project:read',
  PROJECT_UPDATE: 'project:update',
  PROJECT_DELETE: 'project:delete',
  PROJECT_MANAGE_MEMBERS: 'project:manage_members'
} as const

enum ProjectRole {
  //   PM = 'PM', 'Project Manager',
  //   SCRUM_MASTER = 'Scrum Master',
  //   PRODUCT_OWNER = 'Product Owner',
  //   DEVELOPER = 'Developer',
  //   TESTER = 'Tester',
  OWNER = 'Owner', // Full access
  MEMBER = 'Member', // Can be customized with specific permissions
  VIEWER = 'Viewer' // Read-only access
}

const PROJECT_ROLE_PERMISSIONS: Record<ProjectRole, string[]> = {
  [ProjectRole.OWNER]: [
    // Project permissions
    PERMISSIONS.PROJECT_CREATE,
    PERMISSIONS.PROJECT_READ,
    PERMISSIONS.PROJECT_UPDATE,
    PERMISSIONS.PROJECT_DELETE,
    PERMISSIONS.PROJECT_MANAGE_MEMBERS
  ],
  [ProjectRole.MEMBER]: [
    // Project permissions
    PERMISSIONS.PROJECT_READ,
    PERMISSIONS.PROJECT_UPDATE
  ],
  [ProjectRole.VIEWER]: [
    // Project permissions
    PERMISSIONS.PROJECT_READ
  ]
}

/**
 * Get permissions by project role
 * @param role role of the project
 * @returns returns an array of permissions for the given role
 */
const getPermissionsByProjectRole = (role: ProjectRole): string[] => {
  return PROJECT_ROLE_PERMISSIONS[role] || []
}

/**
 * Check if a user role has a specific permission
 * @param userRole role of the user
 * @param requiredPermission permission to check
 * @returns returns true if the user role has the required permission, false otherwise
 */
const hasProjectPermission = (
  userRole: ProjectRole,
  requiredPermission: string
): boolean => {
  const rolePermissions = PROJECT_ROLE_PERMISSIONS[userRole]
  return rolePermissions.includes(requiredPermission)
}

/**
 * Check if a user role has any of the required permissions
 * @param userRole role of the user
 * @param requiredPermissions array of permissions to check
 * @returns returns true if the user role has any of the required permissions, false otherwise
 */
const hasAnyProjectPermission = (
  userRole: ProjectRole,
  requiredPermissions: string[]
): boolean => {
  const permissions = getPermissionsByProjectRole(userRole)
  return requiredPermissions.some((permission) =>
    permissions.includes(permission)
  )
}

/**
 * Check if a user role has all of the required permissions
 * @param userRole role of the user
 * @param requiredPermissions array of permissions to check
 * @returns returns true if the user role has all of the required permissions, false otherwise
 */
const hasAllProjectPermissions = (
  userRole: ProjectRole,
  requiredPermissions: string[]
): boolean => {
  const permissions = getPermissionsByProjectRole(userRole)
  return requiredPermissions.every((permission) =>
    permissions.includes(permission)
  )
}

/**
 * Check if the user is the owner of the resource
 * @param userId id of the user
 * @param resourceOwnerId id of the resource owner
 * @returns returns true if the user is the owner of the resource, false otherwise
 */
const isResourceOwner = (userId: string, resourceOwnerId: string): boolean => {
  return userId === resourceOwnerId
}

export {
  PERMISSIONS,
  ProjectRole,
  PROJECT_ROLE_PERMISSIONS,
  hasProjectPermission,
  hasAnyProjectPermission,
  hasAllProjectPermissions,
  isResourceOwner
}
