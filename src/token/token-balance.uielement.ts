import { collection, documents, path } from '@earnkeeper/ekp-sdk-nestjs';
import {
  Col,
  Container,
  Datatable,
  DatatableColumn,
  formatCurrency,
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
import { TokenBalanceDocument } from './token-balance.document';

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
                title: 'Token Balances',
                icon: 'cil-money',
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

function tableRow(): UiElement {
  return Row({
    children: [
      Col({
        children: [
          Datatable({
            columns: tableColumns(),
            data: documents(TokenBalanceDocument),
            defaultSortAsc: false,
            defaultSortFieldId: 'value',
            filterable: false,
            pagination: false,
            isBusy: isBusy(collection(TokenBalanceDocument)),
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
      id: 'token',
      filterable: true,
      name: 'token',
      sortable: true,
      value: '$.tokenSymbol',
      cell: Tile({
        left: Image({ src: '$.tokenLogo', size: 28 }),
        subTitle: formatCurrency('$.tokenPrice', '$.fiatSymbol'),
        title: '$.tokenSymbol',
      }),
    },
    {
      id: 'value',
      filterable: true,
      right: true,
      sortable: true,
      value: '$.balanceFiat',
      cell: Tile({
        align: 'right',
        subTitle: formatToken('$.balanceToken'),
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

function summaryRow() {
  return Row({
    children: [
      Col({
        className: 'col-xs-12 col-md-6',
        children: [
          SummaryStats({
            rows: [
              {
                label: 'Total Value',
                value: formatCurrency(
                  sum(`${path(TokenBalanceDocument)}..balanceFiat`),
                  `${path(TokenBalanceDocument)}..fiatSymbol`,
                ),
              },
            ],
          }),
        ],
      }),
    ],
  });
}
