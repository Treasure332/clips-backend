# targetPlatforms Validation Flow

## Request Processing Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Client Request                                               │
│    POST /videos                                                 │
│    {                                                            │
│      "userId": 1,                                               │
│      "sourceUrl": "https://youtube.com/...",                    │
│      "targetPlatforms": ["TikTok", "TIKTOK", "Instagram"]       │
│    }                                                            │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. NestJS ValidationPipe (with transform: true)                 │
│    - Converts plain object to CreateVideoDto instance           │
│    - Applies @Transform decorators                              │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. @Transform Decorator (in CreateVideoDto)                     │
│    Input:  ["TikTok", "TIKTOK", "Instagram"]                    │
│    Step 1: Convert to lowercase                                 │
│            ["tiktok", "tiktok", "instagram"]                    │
│    Step 2: Remove duplicates with Set                           │
│            ["tiktok", "instagram"]                              │
│    Output: ["tiktok", "instagram"]                              │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. @IsValidPlatforms Validator                                  │
│    - Check if value is an array                                 │
│    - Check if all elements are strings                          │
│    - Check if all platforms are in SUPPORTED_PLATFORMS          │
│                                                                 │
│    SUPPORTED_PLATFORMS = [                                      │
│      'tiktok', 'instagram', 'youtube-shorts',                   │
│      'youtube', 'facebook', 'twitter', 'snapchat'               │
│    ]                                                            │
└────────────────────────┬────────────────────────────────────────┘
                         │
                    ┌────┴────┐
                    │         │
              Valid │         │ Invalid
                    ▼         ▼
    ┌───────────────────┐   ┌──────────────────────────────────┐
    │ 5a. Success       │   │ 5b. Validation Error             │
    │                   │   │                                  │
    │ Controller        │   │ Return 400 Bad Request           │
    │ receives DTO:     │   │ {                                │
    │ {                 │   │   "statusCode": 400,             │
    │   userId: 1,      │   │   "message": [                   │
    │   sourceUrl: "...",│   │     "Invalid platform(s): ..."  │
    │   targetPlatforms:│   │   ],                             │
    │   ["tiktok",      │   │   "error": "Bad Request"         │
    │    "instagram"]   │   │ }                                │
    │ }                 │   │                                  │
    └─────────┬─────────┘   └──────────────────────────────────┘
              │
              ▼
    ┌───────────────────┐
    │ 6. Save to DB     │
    │                   │
    │ prisma.video      │
    │   .create({       │
    │     data: {       │
    │       ...dto,     │
    │       targetPlatforms: │
    │       ["tiktok",  │
    │        "instagram"]│
    │     }             │
    │   })              │
    └───────────────────┘
```

## Validation Examples

### ✅ Valid Inputs

| Input | After Transform | Validation | Result |
|-------|----------------|------------|--------|
| `["tiktok"]` | `["tiktok"]` | ✅ Pass | Saved as-is |
| `["TikTok", "Instagram"]` | `["tiktok", "instagram"]` | ✅ Pass | Normalized |
| `["TIKTOK", "tiktok"]` | `["tiktok"]` | ✅ Pass | Deduplicated |
| `[]` | `[]` | ✅ Pass | Empty array OK |
| `undefined` | `undefined` | ✅ Pass | Optional field |

### ❌ Invalid Inputs

| Input | Error | HTTP Status |
|-------|-------|-------------|
| `"tiktok"` | "targetPlatforms must be an array" | 400 |
| `["reddit"]` | "Invalid platform(s): reddit. Supported..." | 400 |
| `["tiktok", 123]` | "All platform values must be strings" | 400 |
| `null` | "targetPlatforms must be an array" | 400 |
| `["tiktok", "invalid"]` | "Invalid platform(s): invalid. Supported..." | 400 |

## Code Flow

```typescript
// 1. Client sends request
POST /videos
Body: { targetPlatforms: ["TikTok", "TIKTOK", "Instagram"] }

// 2. NestJS applies ValidationPipe
@Post()
create(@Body() dto: CreateVideoDto) { ... }

// 3. CreateVideoDto class processes the data
export class CreateVideoDto {
  @IsOptional()
  @IsArray()
  @IsValidPlatforms()  // ← Custom validator
  @Transform(({ value }) => {
    // Normalize: lowercase + dedupe
    const normalized = value.map(p => p.toLowerCase());
    return [...new Set(normalized)];
  })
  targetPlatforms?: SupportedPlatform[];
}

// 4. IsValidPlatformsConstraint validates
validate(value: any): boolean {
  if (!Array.isArray(value)) return false;
  
  for (const platform of value) {
    if (typeof platform !== 'string') return false;
    if (!SUPPORTED_PLATFORMS.includes(platform.toLowerCase())) {
      return false;
    }
  }
  
  return true;
}

// 5. If valid, controller receives normalized data
// dto.targetPlatforms = ["tiktok", "instagram"]
```

## Key Components

1. **@Transform** - Normalizes data (lowercase + dedupe)
2. **@IsValidPlatforms** - Validates against supported platforms
3. **IsValidPlatformsConstraint** - Core validation logic
4. **SUPPORTED_PLATFORMS** - Single source of truth for valid platforms

## Benefits

- 🛡️ **Type Safety** - TypeScript ensures compile-time correctness
- ✅ **Runtime Validation** - Prevents bad data at API boundary
- 🔄 **Automatic Normalization** - Consistent data format
- 📝 **Clear Errors** - Developers know exactly what's wrong
- 🧪 **Well Tested** - Comprehensive test coverage
