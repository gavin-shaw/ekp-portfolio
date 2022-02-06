import { EkDocument } from '@earnkeeper/ekp-sdk-nestjs';

export class TokenBalanceDocument extends EkDocument {
  readonly balanceFiat: number;
  readonly balanceToken: number;
  readonly chainId: string;
  readonly chainLogo: string;
  readonly chainName: string;
  readonly coinId: string;
  readonly fiatSymbol: string;
  readonly links: {
    swap: string;
    explorer: string;
  };
  readonly ownerAddress?: string;
  readonly tokenAddress: string;
  readonly tokenLogo: string;
  readonly tokenDecimals: number;
  readonly tokenSymbol: string;
  readonly tokenPrice: number;
  readonly updated: number;
}
