import nftBalances from '../nft/nft-balance.uielement';
import tokenBalances from '../token/token-balance.uielement';

export default function pages() {
  return [
    {
      id: 'portfolio/tokens/balances',
      element: tokenBalances(),
    },
    {
      id: 'portfolio/nfts/balances',
      element: nftBalances(),
    },
  ];
}
