import {
  ACTIVITY_CATEGORY_CODES,
  type ActivityCategoryCode,
} from '@dive-center/database';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DashboardCapabilitiesDto {
  @ApiProperty()
  canReadActivities: boolean;

  @ApiProperty()
  canReadSessions: boolean;

  @ApiProperty()
  canCreateActivity: boolean;

  @ApiProperty()
  canUpdateActivity: boolean;

  @ApiProperty()
  canPublishActivity: boolean;

  @ApiProperty()
  canScheduleSession: boolean;
}

export class LocalizedTextDto {
  @ApiPropertyOptional()
  es?: string;

  @ApiPropertyOptional()
  en?: string;
}

export class ActivityDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: ['Draft', 'Published', 'Disabled'] })
  status: 'Draft' | 'Published' | 'Disabled';

  @ApiProperty({ enum: ['es', 'en'] })
  baseLocale: 'es' | 'en';

  @ApiProperty({ type: LocalizedTextDto })
  name: LocalizedTextDto;

  @ApiPropertyOptional({ type: LocalizedTextDto })
  description?: LocalizedTextDto;

  @ApiPropertyOptional()
  defaultCapacity?: number;

  @ApiPropertyOptional({ enum: ACTIVITY_CATEGORY_CODES })
  category?: ActivityCategoryCode;

  @ApiPropertyOptional({ type: LocalizedTextDto })
  otherDescription?: LocalizedTextDto;

  @ApiProperty()
  createdAt: string;
}

export class SlotDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  activityId: string;

  @ApiProperty({ enum: ['Available', 'Full', 'Closed', 'Cancelled'] })
  status: 'Available' | 'Full' | 'Closed' | 'Cancelled';

  @ApiProperty({
    description: 'RFC3339 instant rendered with the center offset',
  })
  startsAt: string;

  @ApiProperty()
  durationMinutes: number;

  @ApiProperty()
  capacity: number;

  @ApiProperty()
  createdAt: string;
}

export class ActivityListDto {
  @ApiProperty({ type: [ActivityDto] })
  items: ActivityDto[];

  @ApiProperty()
  page: number;

  @ApiProperty()
  pageSize: number;

  @ApiProperty()
  hasNext: boolean;
}

export class SlotListDto {
  @ApiProperty({ type: [SlotDto] })
  items: SlotDto[];

  @ApiProperty()
  page: number;

  @ApiProperty()
  pageSize: number;

  @ApiProperty()
  hasNext: boolean;
}

export class CatalogActivityInputDto {
  @ApiPropertyOptional({ type: LocalizedTextDto })
  name?: Record<string, string>;

  @ApiPropertyOptional({ type: LocalizedTextDto })
  description?: Record<string, string>;

  @ApiPropertyOptional()
  defaultCapacity?: number;

  @ApiPropertyOptional({ enum: ACTIVITY_CATEGORY_CODES, nullable: true })
  category?: ActivityCategoryCode | null;

  @ApiPropertyOptional({ type: LocalizedTextDto })
  otherDescription?: Record<string, string>;
}

export class CatalogSettingsDto {
  @ApiProperty({ enum: ['es', 'en'], nullable: true })
  defaultActivityLocale: 'es' | 'en' | null;
}

export class CatalogTranslationValuesDto {
  @ApiProperty()
  name: string;

  @ApiProperty()
  description: string;
}

export class CatalogCommonValuesDto {
  @ApiProperty({ type: Number, nullable: true })
  defaultCapacity: number | null;
}

export class CatalogCommercialValuesDto {
  @ApiProperty({ enum: ACTIVITY_CATEGORY_CODES, nullable: true })
  category: ActivityCategoryCode | null;

  @ApiProperty({
    type: LocalizedTextDto,
    description:
      'Complete localized form; empty values clear. Required in the base locale only for category other',
  })
  otherDescription: LocalizedTextDto;
}

export class CatalogTranslationEditDto {
  @ApiProperty({ enum: ['translation'] })
  group: 'translation';

  @ApiProperty({ enum: ['es', 'en'] })
  locale: 'es' | 'en';

  @ApiProperty({ type: CatalogTranslationValuesDto })
  values: CatalogTranslationValuesDto;
}

export class CatalogCommonEditDto {
  @ApiProperty({ enum: ['common'] })
  group: 'common';

  @ApiProperty({ type: CatalogCommonValuesDto })
  values: CatalogCommonValuesDto;
}

export class CatalogCommercialEditDto {
  @ApiProperty({ enum: ['commercial'] })
  group: 'commercial';

  @ApiProperty({ type: CatalogCommercialValuesDto })
  values: CatalogCommercialValuesDto;
}

export class CatalogSettingsInputDto {
  @ApiProperty({ enum: ['es', 'en'] })
  defaultActivityLocale: 'es' | 'en';
}

export class CatalogSlotInputDto {
  @ApiProperty({ description: 'RFC3339 instant' })
  startsAt?: string;

  @ApiProperty()
  durationMinutes?: number;

  @ApiProperty()
  capacity?: number;
}

export class CatalogListQueryDto {
  @ApiPropertyOptional({ type: Number })
  page?: number;

  @ApiPropertyOptional({ type: Number })
  pageSize?: number;

  @ApiPropertyOptional()
  status?: string;

  @ApiPropertyOptional()
  from?: string;

  @ApiPropertyOptional()
  to?: string;
}

export type CatalogActivityInput = Readonly<{
  name?: unknown;
  description?: unknown;
  defaultCapacity?: unknown;
  category?: unknown;
  otherDescription?: unknown;
}>;

export type CatalogActivityEditInput =
  | Readonly<{
      group: 'translation';
      locale: 'es' | 'en';
      values: { name: string; description: string };
    }>
  | Readonly<{
      group: 'common';
      values: { defaultCapacity: number | null };
    }>
  | Readonly<{
      group: 'commercial';
      values: {
        category: ActivityCategoryCode | null;
        otherDescription: { es?: string; en?: string };
      };
    }>;

export type CatalogSettingsInput = Readonly<{
  defaultActivityLocale: 'es' | 'en';
}>;

export type CatalogSlotInput = Readonly<{
  startsAt?: unknown;
  durationMinutes?: unknown;
  capacity?: unknown;
}>;

export type CatalogListQueryInput = Readonly<{
  page?: unknown;
  pageSize?: unknown;
  status?: unknown;
  from?: unknown;
  to?: unknown;
}>;

export type CatalogUpcomingQueryInput = Readonly<{
  from: string;
}>;
