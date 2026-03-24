# Video DTOs and Validators

## Overview

This module provides validation for Video entities, specifically addressing the `targetPlatforms` field validation issue.

## Problem Solved

Previously, `targetPlatforms` was a JSON field that accepted any input, which could cause downstream posting failures. This implementation adds:

1. Custom validator `@IsValidPlatforms()` to ensure only supported platforms are accepted
2. Automatic normalization (lowercase + deduplication) on save
3. Returns 400 Bad Request on invalid values

## Supported Platforms

The following platforms are supported:
- `tiktok`
- `instagram`
- `youtube-shorts`
- `youtube`
- `facebook`
- `twitter`
- `snapchat`

## Usage

### Creating a Video

```typescript
import { CreateVideoDto } from './dto/create-video.dto';

// Valid request
const dto: CreateVideoDto = {
  userId: 1,
  sourceUrl: 'https://youtube.com/watch?v=test',
  targetPlatforms: ['TikTok', 'Instagram', 'YOUTUBE-SHORTS']
};

// After transformation:
// dto.targetPlatforms = ['tiktok', 'instagram', 'youtube-shorts']
```

### Updating a Video

```typescript
import { UpdateVideoDto } from './dto/update-video.dto';

const dto: UpdateVideoDto = {
  targetPlatforms: ['TIKTOK', 'tiktok', 'Instagram']
};

// After transformation:
// dto.targetPlatforms = ['tiktok', 'instagram']
```

## Validation Behavior

### Valid Inputs

✅ `['tiktok', 'instagram']` - Valid platforms
✅ `['TikTok', 'Instagram']` - Mixed case (normalized to lowercase)
✅ `['tiktok', 'TIKTOK', 'TikTok']` - Duplicates (deduplicated to `['tiktok']`)
✅ `[]` - Empty array
✅ `undefined` - Optional field

### Invalid Inputs (Returns 400)

❌ `'tiktok'` - Not an array
❌ `['tiktok', 'invalid-platform']` - Contains unsupported platform
❌ `['tiktok', 123]` - Contains non-string value
❌ `null` - Not an array

## Error Messages

When validation fails, the API returns a 400 Bad Request with detailed error messages:

```json
{
  "statusCode": 400,
  "message": [
    "Invalid platform(s): invalid-platform. Supported platforms: tiktok, instagram, youtube-shorts, youtube, facebook, twitter, snapchat"
  ],
  "error": "Bad Request"
}
```

## Implementation Details

### Files Created

1. **validators/is-valid-platforms.validator.ts** - Core validation logic
2. **validators/decorators.ts** - `@IsValidPlatforms()` decorator
3. **dto/create-video.dto.ts** - DTO for creating videos
4. **dto/update-video.dto.ts** - DTO for updating videos
5. **validators/is-valid-platforms.validator.spec.ts** - Unit tests for validator
6. **dto/create-video.dto.spec.ts** - Integration tests for DTO

### Transformation Pipeline

The `@Transform` decorator in the DTOs handles:
1. Converting all platform strings to lowercase
2. Removing duplicates using `Set`
3. Preserving array order (first occurrence)

### Testing

Run the tests with:

```bash
npm test -- --testPathPattern=is-valid-platforms
npm test -- --testPathPattern=create-video.dto
```

## Integration with Controllers

To use these DTOs in your controllers:

```typescript
import { Controller, Post, Body } from '@nestjs/common';
import { CreateVideoDto } from './dto/create-video.dto';

@Controller('videos')
export class VideosController {
  @Post()
  create(@Body() createVideoDto: CreateVideoDto) {
    // createVideoDto.targetPlatforms is now validated and normalized
    return this.videosService.create(createVideoDto);
  }
}
```

## Extending Supported Platforms

To add new platforms, update the `SUPPORTED_PLATFORMS` array in `validators/is-valid-platforms.validator.ts`:

```typescript
export const SUPPORTED_PLATFORMS = [
  'tiktok',
  'instagram',
  'youtube-shorts',
  'youtube',
  'facebook',
  'twitter',
  'snapchat',
  'linkedin', // Add new platform here
] as const;
```
