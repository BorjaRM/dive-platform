import { ForbiddenException } from '@nestjs/common';

export function denied(): never {
  throw new ForbiddenException('Access denied');
}
