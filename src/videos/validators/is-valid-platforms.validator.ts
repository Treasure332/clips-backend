import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

export const SUPPORTED_PLATFORMS = [
  'tiktok',
  'instagram',
  'youtube-shorts',
  'youtube',
  'facebook',
  'twitter',
  'snapchat',
] as const;

export type SupportedPlatform = (typeof SUPPORTED_PLATFORMS)[number];

@ValidatorConstraint({ name: 'isValidPlatforms', async: false })
export class IsValidPlatformsConstraint implements ValidatorConstraintInterface {
  validate(value: any): boolean {
    // Must be an array
    if (!Array.isArray(value)) {
      return false;
    }

    // Check if all values are supported platforms
    for (const platform of value) {
      if (typeof platform !== 'string') {
        return false;
      }
      const normalized = platform.toLowerCase();
      if (!SUPPORTED_PLATFORMS.includes(normalized as SupportedPlatform)) {
        return false;
      }
    }

    return true;
  }

  defaultMessage(args: ValidationArguments): string {
    const value = args.value;

    if (!Array.isArray(value)) {
      return 'targetPlatforms must be an array';
    }

    const invalidPlatforms: string[] = [];
    for (const platform of value) {
      if (typeof platform !== 'string') {
        return 'All platform values must be strings';
      }
      const normalized = platform.toLowerCase();
      if (!SUPPORTED_PLATFORMS.includes(normalized as SupportedPlatform)) {
        invalidPlatforms.push(platform);
      }
    }

    if (invalidPlatforms.length > 0) {
      return `Invalid platform(s): ${invalidPlatforms.join(', ')}. Supported platforms: ${SUPPORTED_PLATFORMS.join(', ')}`;
    }

    return 'targetPlatforms validation failed';
  }
}
