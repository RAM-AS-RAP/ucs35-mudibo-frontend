import { useId } from 'react';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ADMIN_COMMON } from '@/lib/adminMessages';
import { useMediaQuery, WIDE_QUERY } from '@/lib/useMediaQuery';
import { cn } from '@/lib/utils';

/**
 * @template T
 * @typedef {object} Column
 * @property {string} key
 * @property {string} header
 * @property {(row: T) => import('react').ReactNode} cell
 * @property {boolean} [numeric]  right aligned in the table
 * @property {boolean} [wrap]  allow the cell text to wrap in the table
 */

/**
 * The same rows as a real table with a caption on wide screens (640 px and up) and as a list of
 * stacked cards below, from one set of column definitions, with the same actions in both. Only
 * one layout is in the page at a time, so every action exists once.
 *
 * The first column is the row header (`th scope="row"` in the table, the card's heading in the
 * card list). Each row carries `data-row-id`.
 * @template T
 * @param {{
 *   caption: string,
 *   columns: ReadonlyArray<Column<T>>,
 *   rows: ReadonlyArray<T>,
 *   rowKey: (row: T) => string,
 *   actions?: (row: T) => import('react').ReactNode,
 *   actionsHeader?: string,
 *   rowClassName?: (row: T) => string | undefined,
 *   captionHidden?: boolean,
 *   headingLevel?: 2 | 3 | 4,
 *   className?: string,
 * }} props  headingLevel: the level of each card's heading (below the page's own headings)
 */
export function ResponsiveTable({
  caption,
  columns,
  rows,
  rowKey,
  actions,
  actionsHeader = ADMIN_COMMON.actions,
  rowClassName,
  captionHidden = false,
  headingLevel = 2,
  className,
}) {
  const CardHeading = /** @type {'h2' | 'h3' | 'h4'} */ (`h${headingLevel}`);
  const wide = useMediaQuery(WIDE_QUERY);
  const listId = useId();
  const [first, ...rest] = columns;

  if (wide) {
    return (
      <div className={cn('rounded-xl border border-border bg-card', className)} data-layout="table">
        <Table className="caption-top text-base">
          <TableCaption className={cn('mt-0 px-3 pt-3 pb-1 text-left', captionHidden && 'sr-only')}>
            {caption}
          </TableCaption>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead
                  key={column.key}
                  scope="col"
                  className={cn(column.numeric && 'text-right')}
                >
                  {column.header}
                </TableHead>
              ))}
              {actions && (
                <TableHead scope="col">
                  <span>{actionsHeader}</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={rowKey(row)} data-row-id={rowKey(row)} className={rowClassName?.(row)}>
                <TableHead scope="row" className="h-auto py-2 align-top font-medium text-text">
                  {first.cell(row)}
                </TableHead>
                {rest.map((column) => (
                  <TableCell
                    key={column.key}
                    className={cn(
                      'align-top text-text',
                      column.numeric && 'text-right tabular-nums',
                      column.wrap && 'min-w-40 whitespace-normal',
                    )}
                  >
                    {column.cell(row)}
                  </TableCell>
                ))}
                {actions && (
                  <TableCell className="align-top">
                    <div className="flex flex-wrap gap-2">{actions(row)}</div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <div className={className} data-layout="cards">
      <p id={listId} className={cn('mb-2 text-sm text-text-secondary', captionHidden && 'sr-only')}>
        {caption}
      </p>
      <ul aria-labelledby={listId} className="flex flex-col gap-3">
        {rows.map((row) => (
          <li
            key={rowKey(row)}
            data-row-id={rowKey(row)}
            className={cn(
              'flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm',
              rowClassName?.(row),
            )}
          >
            <CardHeading className="text-base font-semibold text-text">
              {first.cell(row)}
            </CardHeading>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm">
              {rest.map((column) => (
                <div key={column.key} className="flex flex-col gap-0.5">
                  <dt className="text-text-secondary">{column.header}</dt>
                  <dd className="break-words text-text">{column.cell(row)}</dd>
                </div>
              ))}
            </dl>
            {actions && <div className="flex flex-wrap gap-2">{actions(row)}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}
