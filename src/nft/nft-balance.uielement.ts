import { collection, documents, path } from '@earnkeeper/ekp-sdk-nestjs';
import {
  Col,
  Container,
  Datatable,
  DatatableColumn,
  formatAge,
  formatCurrency,
  formatTemplate,
  formatToken,
  Image,
  isBusy,
  navigate,
  PageHeaderTile,
  Row,
  sum,
  SummaryStats,
  Tile,
  UiElement,
  WalletSelector,
} from '@earnkeeper/ekp-ui';
import { NftBalanceDocument } from './nft-balance.document';

export default function element(): UiElement {
  return Container({
    children: [
      Row({
        children: [Col({ children: [WalletSelector()] })],
      }),
      Row({
        children: [
          Col({
            children: [
              PageHeaderTile({
                title: 'NFT Balances',
                icon: 'cil-color-palette',
              }),
            ],
          }),
        ],
      }),
      summaryRow(),
      tableRow(),
    ],
  });
}

function summaryRow(): UiElement {
  return Row({
    children: [
      Col({
        className: 'col-md-6',
        children: [
          SummaryStats({
            rows: [
              {
                label: 'Total Value',
                value: formatCurrency(
                  sum(`${path(NftBalanceDocument)}..balanceFiat`),
                  `${path(NftBalanceDocument)}..fiatSymbol`,
                ),
              },
            ],
          }),
        ],
      }),
    ],
  });
}

function tableRow(): UiElement {
  return Row({
    children: [
      Col({
        children: [
          Datatable({
            columns: tableColumns(),
            data: documents(NftBalanceDocument),
            defaultSortAsc: false,
            defaultSortFieldId: 'value',
            filterable: false,
            pagination: false,
            isBusy: isBusy(collection(NftBalanceDocument)),
            onRowClicked: navigate('$.links.explorer', true, true),
          }),
        ],
      }),
    ],
  });
}

function tableColumns(): DatatableColumn[] {
  return [
    {
      id: 'collection',
      name: 'token',
      sortable: true,
      value: '$.nftCollectionName',
      cell: Tile({
        left: Image({ src: '$.nftCollectionLogo', size: 28 }),
        title: '$.nftCollectionName',
        subTitle: formatTemplate(
          '{{ price }} {{ symbol }} - {{ balance }} nfts',
          {
            balance: '$.balanceNfts',
            price: formatToken('$.nftPrice'),
            symbol: '$.saleTokenSymbol',
          },
        ),
      }),
    },
    {
      id: 'value',
      right: true,
      sortable: true,
      value: '$.balanceFiat',
      width: '120px',
      cell: Tile({
        align: 'right',
        subTitle: formatAge('$.updated'),
        title: Tile({
          right: Image({
            src: '$.chainLogo',
            size: 12,
            tooltip: '$.chainName',
          }),
          title: formatCurrency('$.balanceFiat', '$.fiatSymbol'),
        }),
      }),
    },
  ];
}
