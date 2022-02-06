import {
  chains,
  ClientService,
  ClientStateChangedEvent,
  CoingeckoService,
  collection,
  filterPath,
  moralis,
  MoralisService,
  parseCurrency,
  parseSelectedChains,
  parseSelectedWalletAddresses,
  TokenMetadata,
} from '@earnkeeper/ekp-sdk-nestjs';
import { Injectable } from '@nestjs/common';
import { ethers } from 'ethers';
import _ from 'lodash';
import { filter } from 'rxjs';
import { tokenContractId } from '../utils';
import { TokenBalanceDocument } from './token-balance.document';
import moment from 'moment';

const FILTER_PATH = '/plugin/portfolio/tokens/balances';
const COLLECTION_NAME = collection(TokenBalanceDocument);

@Injectable()
export class TokenBalanceService {
  constructor(
    private clientService: ClientService,
    private moralisService: MoralisService,
    private coingeckoService: CoingeckoService,
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

    const tokenBalances = await this.getTokenBalances(clientStateChangedEvent);

    const tokenPrices = await this.getTokenPrices(
      clientStateChangedEvent,
      tokenBalances,
    );

    const tokenMetadatas = await this.getTokenMetadatas(tokenBalances);

    const documents = this.mapTokenBalanceDocuments(
      clientStateChangedEvent,
      tokenBalances,
      tokenMetadatas,
      tokenPrices,
    );

    await this.clientService.emitDocuments(
      clientStateChangedEvent,
      COLLECTION_NAME,
      documents,
    );

    await this.clientService.emitDone(clientStateChangedEvent, COLLECTION_NAME);
  }

  async getTokenBalances(clientStateChangedEvent: ClientStateChangedEvent) {
    const promises = [];

    const chains = parseSelectedChains(clientStateChangedEvent);
    const addresses = parseSelectedWalletAddresses(clientStateChangedEvent);

    for (const chain of chains) {
      for (const wallet of addresses) {
        promises.push(this.moralisService.tokensOf(chain.id, wallet));
      }
    }

    return _.flatten(await Promise.all<moralis.TokenBalanceDto[]>(promises));
  }

  async getTokenPrices(
    clientStateChangedEvent: ClientStateChangedEvent,
    tokenBalances: moralis.TokenBalanceDto[],
  ): Promise<TokenPrice[]> {
    const currency = parseCurrency(clientStateChangedEvent);

    const nativeTokenPrices = await this.coingeckoService.nativeCoinPrices(
      currency.id,
    );

    const tokenPrices = await _.chain(tokenBalances)
      .filter((it) => !!it)
      .map(async (tokenBalance) => {
        const latestPrice = await this.moralisService.latestTokenPriceOf(
          tokenBalance.chain_id,
          tokenBalance.token_address,
        );

        if (!latestPrice) {
          return <TokenPrice>{
            chainId: tokenBalance.chain_id,
            tokenAddress: tokenBalance.token_address,
            price: 0,
          };
        }

        const tokenPrice = Number(
          ethers.utils.formatUnits(
            latestPrice.nativePrice.value,
            latestPrice.nativePrice.decimals,
          ),
        );

        const nativePrice = nativeTokenPrices[tokenBalance.chain_id];

        return <TokenPrice>{
          chainId: tokenBalance.chain_id,
          tokenAddress: tokenBalance.token_address,
          price: tokenPrice * nativePrice,
        };
      })
      .thru((promises) => Promise.all(promises))
      .value();

    return tokenPrices;
  }

  async getTokenMetadatas(
    tokenBalances: moralis.TokenBalanceDto[],
  ): Promise<TokenMetadata[]> {
    const tokenMetadatas = await _.chain(tokenBalances)
      .map(async (tokenBalance) => {
        const coinId = this.coingeckoService.coinIdOf(
          tokenBalance.chain_id,
          tokenBalance.token_address,
        );

        const logo = !!coinId
          ? await this.coingeckoService.getImageUrl(coinId)
          : undefined;

        return <TokenMetadata>{
          chainId: tokenBalance.chain_id,
          address: tokenBalance.token_address,
          coinId,
          decimals: Number(tokenBalance.decimals),
          logo,
          name: tokenBalance.name,
          symbol: tokenBalance.symbol,
        };
      })
      .thru((promises) => Promise.all(promises))
      .value();

    return tokenMetadatas;
  }

  private mapTokenBalanceDocuments(
    clientStateChangedEvent: ClientStateChangedEvent,
    tokenBalances: moralis.TokenBalanceDto[],
    tokenMetadatas: TokenMetadata[],
    tokenPrices: TokenPrice[],
  ) {
    const now = moment().unix();
    const currency = parseCurrency(clientStateChangedEvent);

    const tokensById = _.groupBy(
      tokenBalances,
      (tokenBalance) =>
        `${tokenBalance.chain_id}_${tokenBalance.token_address}`,
    );

    const documents = Object.entries(tokensById)
      .map(([id, tokens]) => {
        const balance = _.sumBy(tokens, (token) =>
          Number(ethers.utils.formatUnits(token.balance, token.decimals)),
        );

        const chainMetadata = chains[tokens[0].chain_id];

        const tokenMetadata = tokenMetadatas.find(
          (it) => `${it.chainId}_${it.address}` === id,
        );

        if (!tokenMetadata?.coinId) {
          return undefined;
        }

        const tokenPrice = tokenPrices.find(
          (tokenPrice) =>
            tokenContractId(tokenPrice.chainId, tokenPrice.tokenAddress) ===
            tokenContractId(tokenMetadata.chainId, tokenMetadata.address),
        );

        if (!tokenPrice) {
          return undefined;
        }

        const document: TokenBalanceDocument = {
          id,
          balanceFiat: tokenPrice.price * balance,
          balanceToken: balance,
          chainId: chainMetadata.id,
          chainLogo: chainMetadata.logo,
          chainName: chainMetadata.name,
          coinId: tokenMetadata.coinId,
          fiatSymbol: currency.symbol,
          links: {
            swap: `${chainMetadata.swap}?inputCurrency=${tokens[0].token_address}`,
            explorer: `${chainMetadata.explorer}token/${tokens[0].token_address}`,
          },
          tokenAddress: tokenMetadata.address,
          tokenLogo: tokenMetadata.logo,
          tokenDecimals: tokenMetadata.decimals,
          tokenSymbol: tokenMetadata.symbol,
          tokenPrice: tokenPrice.price,
          updated: now,
        };

        return document;
      })
      .filter((it) => !!it);

    return documents;
  }
}

interface TokenPrice {
  readonly chainId: string;
  readonly tokenAddress: string;
  readonly price: number;
}
