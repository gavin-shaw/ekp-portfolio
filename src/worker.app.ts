import { SdkModule } from '@earnkeeper/ekp-sdk-nestjs';
import { Module } from '@nestjs/common';
import { NftBalanceService } from './nft/nft-balance.service';
import { TokenBalanceService } from './token/token-balance.service';
import { UiProcessor } from './ui/ui.processor';

@Module({
  imports: [SdkModule],
  providers: [NftBalanceService, TokenBalanceService, UiProcessor],
})
export class WorkerApp {}
