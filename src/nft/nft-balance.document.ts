import { EkDocument } from '@earnkeeper/ekp-sdk-nestjs';

export class NftBalanceDocument extends EkDocument {
  readonly balanceFiat: number;
  readonly balanceNfts: number;
  readonly chainId: string;
  readonly chainLogo: string;
  readonly chainName: string;
  readonly fiatSymbol: string;
  readonly links: { explorer: string; details: string };
  readonly nftPrice: number;
  readonly saleTokenPrice: number;
  readonly saleTokenSymbol: string;
  readonly nftCollectionAddress: string;
  readonly nftCollectionLogo: string;
  readonly nftCollectionName: string;
  readonly nftCollectionSymbol: string;
}
