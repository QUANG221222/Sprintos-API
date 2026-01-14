import { pick } from 'lodash'

/**
 * Pick user fields to return
 * @param user The user object
 * @returns The picked user object
 */
export const pickUser = (user: any): any => {
  return pick(user, [
    '_id',
    'email',
    'displayName',
    'role',
    'isActive',
    'address',
    'dob',
    'gender',
    'avatar',
    'avatarPublicId',
    'createdAt',
    'updatedAt'
  ])
}

export const pickProject = (project: any): any => {
  return pick(project, [
    '_id',
    'ownerId',
    'name',
    'description',
    'imageUrl',
    'imagePublicId',
    'members',
    'createdAt',
    'updatedAt'
  ])
}
