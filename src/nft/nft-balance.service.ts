import {
  ChainId,
  chains,
  ClientService,
  ClientStateChangedEvent,
  CoingeckoService,
  collection,
  EthersService,
  filterPath,
  moralis,
  MoralisService,
  OpenseaService,
  parseCurrency,
  parseSelectedChains,
  parseSelectedWalletAddresses,
} from '@earnkeeper/ekp-sdk-nestjs';
import { Injectable } from '@nestjs/common';
import { ethers } from 'ethers';
import _ from 'lodash';
import moment from 'moment';
import { filter } from 'rxjs';
import { DEFAULT_LOGO, nftContractId } from '../utils';
import { NftBalanceDocument } from './nft-balance.document';

const FILTER_PATH = '/plugin/portfolio/nfts/balances';
const COLLECTION_NAME = collection(NftBalanceDocument);

@Injectable()
export class NftBalanceService {
  constructor(
    private clientService: ClientService,
    private coingeckoService: CoingeckoService,
    private ethersService: EthersService,
    private moralisService: MoralisService,
    private openseaService: OpenseaService,
  ) {
    clientService.clientStateEvents$
      .pipe(filter((event) => filterPath(event, FILTER_PATH)))
      .subscribe((event) => {
        this.handleClientStateEvent(event);
      });
  }

  async handleClientStateEvent(
    clientStateChangedEvent: ClientStateChangedEvent,
  ) {
    await this.clientService.emitBusy(clientStateChangedEvent, COLLECTION_NAME);

    const nftOwners = await this.getNftOwners(clientStateChangedEvent);

    const currency = parseCurrency(clientStateChangedEvent);

    const nativeCoinPrices = await this.coingeckoService.nativeCoinPrices(
      currency.id,
    );

    const documents = await this.mapDocuments(
      clientStateChangedEvent,
      nftOwners,
      nativeCoinPrices,
    );

    await this.clientService.emitDocuments(
      clientStateChangedEvent,
      COLLECTION_NAME,
      documents,
    );

    await this.clientService.emitDone(clientStateChangedEvent, COLLECTION_NAME);
  }

  async getNftOwners(clientStateChangedEvent: ClientStateChangedEvent) {
    const requestPromises = [];

    const chains = parseSelectedChains(clientStateChangedEvent);
    const addresses = parseSelectedWalletAddresses(clientStateChangedEvent);

    for (const chain of chains) {
      for (const address of addresses) {
        requestPromises.push(this.moralisService.nftsOf(chain.id, address));
      }
    }

    const nftOwners: moralis.NftOwnerDto[] = _.flatten(
      await Promise.all(requestPromises),
    );

    return nftOwners.filter((it) => !!it.name);
  }

  async getNftLogos(
    clientStateChangedEvent: ClientStateChangedEvent,
    nftOwners: moralis.NftOwnerDto[],
  ) {
    const nftLogos = await _.chain(nftOwners)
      .filter((nftOwner) => nftOwner.chain_id === 'eth')
      .map((nftOwner) =>
        this.openseaService
          .metadataOf(nftOwner.token_address)
          .then((metadata) => ({
            chainId: nftOwner.chain_id,
            contractAddress: nftOwner.token_address,
            imageUrl: metadata?.image_url,
          })),
      )
      .thru((promises) => Promise.all(promises))
      .value();
    return nftLogos;
  }

  async getOpenseaLowestTrade(
    contractAddress: string,
  ): Promise<moralis.TradeDto> {
    const numberOfDaysMax = 7;
    let lowestTrade: moralis.TradeDto;

    for (
      let numberOfDays = 1;
      numberOfDays <= numberOfDaysMax;
      numberOfDays++
    ) {
      lowestTrade = await this.moralisService.lowestPriceOfNft(
        'eth',
        contractAddress,
        numberOfDays,
      );

      if (!!lowestTrade) {
        break;
      }
    }

    return lowestTrade;
  }

  async getNftPrice(chainId: string, contractAddress: string) {
    if (chainId === 'eth') {
      const lowestTrade = await this.getOpenseaLowestTrade(contractAddress);

      if (!!lowestTrade) {
        return {
          chainId,
          contractAddress,
          price: Number(ethers.utils.formatEther(lowestTrade.price)),
          updated: moment(lowestTrade.block_timestamp).unix(),
        };
      }
    }

    const nftTransfers = await this.moralisService.nftContractTransfersOf(
      chainId as ChainId,
      contractAddress,
      10,
    );

    if (nftTransfers.length === 0) {
      return {
        chainId,
        contractAddress,
        price: 0,
        updated: undefined,
      };
    }

    const transfers = await _.chain(nftTransfers)
      .map(async (nftTransfer) => {
        if (nftTransfer.value === '0') {
          const receipt = await this.ethersService.transactionReceiptOf(
            chainId,
            nftTransfer.transaction_hash,
          );

          if (!!receipt) {
            const logs = receipt.receipt?.logs;
            const fromAddress = `0x000000000000000000000000${nftTransfer.from_address
              .toLowerCase()
              .substring(2)}`;

            const tokenTransferLog: ethers.providers.Log = logs?.find(
              (it) =>
                it.topics[0]?.toLowerCase() ===
                  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' &&
                it.topics[2]?.toLowerCase() === fromAddress,
            );

            if (!!tokenTransferLog) {
              if (!['', '0x'].includes(tokenTransferLog.data)) {
                const amount = ethers.BigNumber.from(tokenTransferLog.data);

                if (
                  contractAddress.toLowerCase() ===
                  '0xb81cf242671edae57754b1a061f62af08b32926a'
                ) {
                  console.log(nftTransfer.transaction_hash);
                }

                const valueTokenAddress = tokenTransferLog.address;

                const price = await this.moralisService.tokenPriceOf(
                  nftTransfer.chain_id as ChainId,
                  valueTokenAddress,
                  tokenTransferLog.blockNumber,
                );

                if (!!price) {
                  nftTransfer.value = amount
                    .mul(price.nativePrice.value)
                    .div(
                      ethers.BigNumber.from(10).pow(price.nativePrice.decimals),
                    )
                    .toString();
                }
              }
            }
          }
        }

        return <NftTransfer>{
          amount: Number(nftTransfer.amount),
          blockHash: nftTransfer.amount,
          blockNumber: Number(nftTransfer.block_number),
          blockTimestamp: moment(nftTransfer.block_timestamp).unix(),
          fromAddress: nftTransfer.from_address,
          logIndex: Number(nftTransfer.log_index),
          toAddress: nftTransfer.to_address,
          tokenAddress: nftTransfer.token_address,
          tokenId: Number(nftTransfer.token_id),
          transactionHash: nftTransfer.transaction_hash,
          transactionIndex: Number(nftTransfer.transaction_index),
          value: Number(ethers.utils.formatEther(nftTransfer.value ?? 0)),
        };
      })
      .thru((promises) => Promise.all(promises))
      .value();

    const updated = _.chain(transfers)
      .map((it) => it.blockTimestamp)
      .max()
      .value();

    const price =
      _.chain(transfers)
        .filter((it) => it.value > 0)
        .map((it) => it.value)
        .first()
        .value() ?? 0;

    const nftPrice: NftPrice = {
      chainId,
      contractAddress,
      price,
      updated,
    };

    return nftPrice;
  }

  async mapDocument(
    clientStateChangedEvent: ClientStateChangedEvent,
    nfts: moralis.NftOwnerDto[],
    nativeCoinPrices: Record<string, number>,
  ) {
    const currency = parseCurrency(clientStateChangedEvent);
    const chainId = nfts[0].chain_id;
    const contractAddress = nfts[0].token_address;
    const chainMetadata = chains[chainId];
    const id = nftContractId(chainId, contractAddress);

    let nftCollectionLogo: string;

    if (chainId === 'eth') {
      nftCollectionLogo = await this.openseaService
        .metadataOf(contractAddress)
        .then((metadata) => metadata?.image_url);
    }

    const balance = _.sumBy(nfts, (it) => Number(it.amount));

    const nftPrice = await this.getNftPrice(chainId, contractAddress);

    const nativeCoinPrice = nativeCoinPrices[chainId];

    const document: NftBalanceDocument = {
      id,
      balanceNfts: balance,
      updated: nftPrice?.updated,
      balanceFiat: balance * nftPrice?.price * nativeCoinPrice,
      nftPrice: nftPrice?.price,
      chainId: chainMetadata.id,
      chainLogo: chainMetadata.logo,
      chainName: chainMetadata.name,
      links: {
        details: '',
        explorer: `${chainMetadata.explorer}token/${nfts[0].token_address}`,
      },
      fiatSymbol: currency.symbol,
      saleTokenPrice: nativeCoinPrice,
      saleTokenSymbol: chainMetadata.token.symbol,
      nftCollectionAddress: nfts[0].token_address,
      nftCollectionName: nfts[0].name,
      nftCollectionSymbol: nfts[0].symbol,
      nftCollectionLogo: nftCollectionLogo ?? DEFAULT_LOGO,
    };

    return document;
  }

  async mapDocuments(
    clientStateChangedEvent: ClientStateChangedEvent,
    nftOwners: moralis.NftOwnerDto[],
    nativeCoinPrices: Record<string, number>,
  ) {
    const documents = await _.chain(nftOwners)
      .groupBy((nftOwner) =>
        nftContractId(nftOwner.chain_id, nftOwner.token_address),
      )
      .values()
      .map((nftOwner) =>
        this.mapDocument(clientStateChangedEvent, nftOwner, nativeCoinPrices),
      )
      .thru((promises) => Promise.all(promises))
      .value();

    return documents;
  }
}

interface NftTransfer {
  amount?: number;
  blockHash: string;
  blockNumber: number;
  blockTimestamp: number;
  fromAddress?: string;
  logIndex: number;
  toAddress: string;
  tokenAddress: string;
  tokenId: number;
  transactionHash: string;
  transactionIndex?: number;
  value?: number;
  valueTokenAddress?: string;
}

interface NftPrice {
  readonly chainId: string;
  readonly contractAddress: string;
  readonly price: number;
  readonly updated: number;
}
