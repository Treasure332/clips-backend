# Quick Start: targetPlatforms Validation

## What Was Fixed

The `targetPlatforms` JSON field now has proper validation to prevent downstream posting failures.

## Supported Platforms

```typescript
['tiktok', 'instagram', 'youtube-shorts', 'youtube', 'facebook', 'twitter', 'snapchat']
```

## Quick Integration (3 Steps)

### 1. Enable Global Validation (if not already enabled)

In `src/main.ts`:

```typescript
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  app.useGlobalPipes(new ValidationPipe({
    transform: true,  // Enable @Transform decorators
    whitelist: true,
  }));
  
  await app.listen(3000);
}
```

### 2. Use DTOs in Your Controller

```typescript
import { Controller, Post, Body } from '@nestjs/common';
import { CreateVideoDto } from './dto';

@Controller('videos')
export class VideosController {
  @Post()
  create(@Body() dto: CreateVideoDto) {
    // dto.targetPlatforms is now validated and normalized
    return this.videosService.create(dto);
  }
}
```

### 3. Test It

```bash
# Valid request - will succeed
curl -X POST http://localhost:3000/videos \
  -H "Content-Type: application/json" \
  -d '{
    "userId": 1,
    "sourceUrl": "https://youtube.com/watch?v=test",
    "targetPlatforms": ["TikTok", "Instagram"]
  }'

# Result: targetPlatforms = ["tiktok", "instagram"]

# Invalid request - will return 400
curl -X POST http://localhost:3000/videos \
  -H "Content-Type: application/json" \
  -d '{
    "userId": 1,
    "sourceUrl": "https://youtube.com/watch?v=test",
    "targetPlatforms": ["tiktok", "invalid"]
  }'

# Response: 400 Bad Request with error message
```

## What Happens Automatically

✅ **Validation** - Only supported platforms accepted  
✅ **Lowercase** - "TikTok" → "tiktok"  
✅ **Deduplication** - ["tiktok", "TIKTOK"] → ["tiktok"]  
✅ **Error Messages** - Clear 400 responses with details  

## Files You Need

- `src/videos/dto/create-video.dto.ts` - For POST endpoints
- `src/videos/dto/update-video.dto.ts` - For PATCH/PUT endpoints
- `src/videos/validators/*` - Validation logic (imported by DTOs)

## Example Controller

See `src/videos/videos.controller.example.ts` for a complete working example.

## Run Tests

```bash
npm install
npm test -- --testPathPattern=videos
```

## Need Help?

See `src/videos/README.md` for detailed documentation.
