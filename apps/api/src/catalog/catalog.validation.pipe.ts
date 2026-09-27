import { Injectable, type PipeTransform } from '@nestjs/common';
import type {
  CatalogActivityInput,
  CatalogListQueryInput,
  CatalogSlotInput,
} from './catalog.dto.js';
import {
  parseCatalogActivityInput,
  parseCatalogListQueryInput,
  parseCatalogSlotInput,
} from './catalog.validation.js';

@Injectable()
export class CatalogActivityInputPipe
  implements PipeTransform<unknown, CatalogActivityInput>
{
  transform(value: unknown): CatalogActivityInput {
    return parseCatalogActivityInput(value);
  }
}

@Injectable()
export class CatalogSlotInputPipe
  implements PipeTransform<unknown, CatalogSlotInput>
{
  transform(value: unknown): CatalogSlotInput {
    return parseCatalogSlotInput(value);
  }
}

@Injectable()
export class CatalogListQueryPipe
  implements PipeTransform<unknown, CatalogListQueryInput>
{
  transform(value: unknown): CatalogListQueryInput {
    return parseCatalogListQueryInput(value);
  }
}
