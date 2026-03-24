import { ValidateBy, ValidationOptions } from 'class-validator';
import { IsValidPlatformsConstraint } from './is-valid-platforms.validator';

/**
 * Validates that targetPlatforms is an array of supported platform strings.
 * Supported platforms: tiktok, instagram, youtube-shorts, youtube, facebook, twitter, snapchat
 * 
 * The validator checks:
 * - Value is an array
 * - All elements are strings
 * - All platforms are in the supported list (case-insensitive)
 */
export function IsValidPlatforms(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isValidPlatforms',
      constraints: [],
      validator: new IsValidPlatformsConstraint(),
    },
    validationOptions,
  );
}
