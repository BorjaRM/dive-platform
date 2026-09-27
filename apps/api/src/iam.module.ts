import { Module } from '@nestjs/common';
import { IamController } from './iam.controller.js';
import { IamService } from './iam.service.js';

@Module({
  controllers: [IamController],
  providers: [IamService],
})
export class IamModule {}
