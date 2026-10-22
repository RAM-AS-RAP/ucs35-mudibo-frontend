import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

/**
 * An accessible table with a caption, used inside `details` elements as the text alternative of a
 * chart. The first column is a row header. Cells are already formatted strings.
 * @param {{
 *   caption: string,
 *   columns: ReadonlyArray<{ key: string, header: string, numeric?: boolean }>,
 *   rows: ReadonlyArray<Record<string, string> & { id: string }>,
 *   className?: string,
 * }} props
 */
export function DataTable({ caption, columns, rows, className }) {
  const [first, ...rest] = columns;
  return (
    // Smaller text and padding on phones so three columns of numbers fit without sideways scrolling.
    <Table className={cn('caption-top text-sm sm:text-base', className)}>
      <TableCaption className="mt-0 mb-2 text-left">{caption}</TableCaption>
      <TableHeader>
        <TableRow>
          {columns.map((column) => (
            <TableHead
              key={column.key}
              scope="col"
              className={cn(
                'h-auto px-2 py-2 align-bottom whitespace-normal sm:px-3',
                column.numeric && 'text-right',
              )}
            >
              {column.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableHead
              scope="row"
              className="h-auto px-2 py-2 font-medium whitespace-normal text-text sm:px-3"
            >
              {row[first.key]}
            </TableHead>
            {rest.map((column) => (
              <TableCell
                key={column.key}
                className={cn(
                  'px-2 text-text sm:px-3',
                  column.numeric && 'text-right tabular-nums',
                )}
              >
                {row[column.key]}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
