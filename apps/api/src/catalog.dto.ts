import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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

  @ApiProperty({ type: LocalizedTextDto })
  name: LocalizedTextDto;

  @ApiPropertyOptional({ type: LocalizedTextDto })
  description?: LocalizedTextDto;

  @ApiPropertyOptional()
  defaultCapacity?: number;

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

export type CatalogActivityInput = Readonly<{
  name?: unknown;
  description?: unknown;
  defaultCapacity?: unknown;
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
