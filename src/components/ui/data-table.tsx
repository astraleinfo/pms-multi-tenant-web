"use client";

import * as React from "react";
import {
  columnFilteringFeature,
  createColumnHelper,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_includesString,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_text,
  tableFeatures,
  useTable,
  type RowData,
} from "@tanstack/react-table";
import { cn } from "@/lib/cn";
import { Button } from "./button";
import { SearchInput } from "./field";
import { LoadingBar, TableSkeletonRows } from "./loader";
import { IconArrowDown, IconArrowUp, IconChevronLeft, IconChevronRight } from "./icons";

/* ==========================================================================
   One table engine for every grid in the app.

   Features are registered explicitly rather than pulled in wholesale, so a
   table only carries the behaviour it actually uses.
   ========================================================================== */

export const tableFeatureSet = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text },
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: { includesString: filterFn_includesString },
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
});

export type AppTableFeatures = typeof tableFeatureSet;

/** Per-column presentation hints. Alignment and width are ours, not the engine's. */
export interface ColumnMeta {
  align?: "left" | "right" | "center";
  width?: string | number;
}

/** Typed column helper for a row shape. Define columns outside render. */
export function columnHelperFor<T extends RowData>() {
  return createColumnHelper<AppTableFeatures, T>();
}

export interface DataTableProps<T extends RowData> {
  columns: Parameters<typeof useTable<AppTableFeatures, T>>[0]["columns"];
  data: T[];
  /** search box above the table; omit to hide it */
  searchPlaceholder?: string;
  /** rows before pagination appears at all */
  pageSize?: number;
  initialSorting?: Array<{ id: string; desc: boolean }>;
  onRowClick?: (row: T) => void;
  isRowActive?: (row: T) => boolean;
  empty?: React.ReactNode;
  /** below this the table scrolls sideways rather than squeezing */
  minWidth?: string;
  toolbar?: React.ReactNode;
  className?: string;
  getRowId?: (row: T) => string;
  /**
   * Whether the rows are still on their way.
   *
   * With nothing to show yet the table draws itself in outline — same columns,
   * same row height — so the page does not jump when the answer lands. With a
   * page already on screen it keeps it, dimmed and under a thin bar, because a
   * spinner in place of true rows is a step backwards. In server mode
   * `server.loading` says this and there is nothing to pass.
   */
  loading?: boolean;
  /**
   * Hand the table a page rather than a collection.
   *
   * With this set the table stops filtering, sorting and slicing what it was
   * given — the database already did all three — and reports every change of
   * page, search term or sort back to the caller instead. `data` is then one
   * page, and `total` is how many rows the query matched.
   */
  server?: ServerTableState;
}

export interface ServerTableState {
  total: number;
  /** zero-based */
  page: number;
  onPageChange: (page: number) => void;
  search: string;
  onSearchChange: (term: string) => void;
  sort?: { id: string; desc: boolean };
  onSortChange?: (sort: { id: string; desc: boolean }) => void;
  /** a page already on screen stays there while the next one loads */
  loading?: boolean;
}

export function DataTable<T extends RowData>({
  columns, data, searchPlaceholder, pageSize = 25, initialSorting,
  onRowClick, isRowActive, empty, minWidth = "44rem", toolbar, className, getRowId, server,
  loading,
}: DataTableProps<T>) {
  const table = useTable<AppTableFeatures, T>(
    {
      features: tableFeatureSet,
      columns,
      data,
      getRowId,
      globalFilterFn: "includesString",
      /* In server mode the work has already been done, once, in the database. */
      manualPagination: !!server,
      manualSorting: !!server,
      manualFiltering: !!server,
      rowCount: server?.total,
      initialState: {
        pagination: { pageIndex: 0, pageSize },
        ...(initialSorting ? { sorting: initialSorting } : {}),
      },
      ...(server
        ? {
          state: {
            pagination: { pageIndex: server.page, pageSize },
            sorting: server.sort ? [server.sort] : [],
            globalFilter: server.search,
          },
          onPaginationChange: (updater) => {
            const next = typeof updater === "function"
              ? updater({ pageIndex: server.page, pageSize })
              : updater;
            server.onPageChange(next.pageIndex);
          },
          onSortingChange: (updater) => {
            const current = server.sort ? [server.sort] : [];
            const next = typeof updater === "function" ? updater(current) : updater;
            if (next[0]) server.onSortChange?.(next[0]);
          },
          onGlobalFilterChange: (updater) => {
            const next = typeof updater === "function" ? updater(server.search) : updater;
            server.onSearchChange(String(next ?? ""));
          },
        }
        : {}),
    },
  );

  const rows = table.getRowModel().rows;
  const total = server?.total ?? table.getRowCount();
  const pageCount = server ? Math.max(1, Math.ceil(server.total / pageSize)) : table.getPageCount();
  const { pageIndex, pageSize: size } = table.state.pagination;

  const busy = loading ?? server?.loading ?? false;
  /* nothing to keep on screen: draw the table in outline instead */
  const firstLoad = busy && rows.length === 0;
  const columnCount = table.getHeaderGroups()[0]?.headers.length ?? 1;

  return (
    <div className={className}>
      {(searchPlaceholder || toolbar) && (
        <div className="flex flex-wrap items-center justify-between gap-2.5 px-5 pb-3.5 pt-4">
          {searchPlaceholder ? (
            <SearchInput
              value={String(table.state.globalFilter ?? "")}
              onChange={(e) => table.setGlobalFilter(e.target.value)}
              placeholder={searchPlaceholder}
              wrapperClassName="min-w-[190px] max-w-xs flex-1"
              className="h-9"
            />
          ) : <span />}
          {toolbar}
        </div>
      )}

      <div className="relative">
        {busy && !firstLoad && <LoadingBar />}
        <div
          className="-mx-px overflow-x-auto overscroll-x-contain"
          /* the previous page stays legible while the next one is in flight */
          style={busy && !firstLoad ? { opacity: 0.55, transition: "opacity var(--d-2) var(--ease-out)" } : undefined}
          aria-busy={busy || undefined}
        >
          <table className="w-full border-collapse text-left" style={{ minWidth }}>
            <thead className="border-y border-line bg-surface-2">
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id}>
                  {group.headers.map((header) => {
                    const sortable = header.column.getCanSort();
                    const sorted = header.column.getIsSorted();
                    const align = (header.column.columnDef.meta as ColumnMeta | undefined)?.align;
                    return (
                      <th
                        key={header.id}
                        scope="col"
                        style={(header.column.columnDef.meta as ColumnMeta | undefined)?.width
                          ? { width: (header.column.columnDef.meta as ColumnMeta).width }
                          : undefined}
                        className={cn(
                          "whitespace-nowrap px-4 py-2.5 text-[0.6875rem] font-semibold uppercase tracking-[0.09em] text-ink-3",
                          align === "right" && "text-right",
                          align === "center" && "text-center",
                        )}
                      >
                        {header.isPlaceholder ? null : sortable ? (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-[4px] uppercase tracking-[0.09em] transition-colors hover:text-ink",
                              sorted && "text-ink",
                              align === "right" && "flex-row-reverse",
                            )}
                            aria-label={`Sort by ${String(header.column.id)}`}
                          >
                            <table.FlexRender header={header} />
                            {sorted === "asc" && <IconArrowUp size={12} />}
                            {sorted === "desc" && <IconArrowDown size={12} />}
                          </button>
                        ) : (
                          <table.FlexRender header={header} />
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>

            <tbody className="divide-y divide-line-soft">
              {firstLoad && <TableSkeletonRows rows={Math.min(pageSize, 8)} columns={columnCount} />}
              {rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={cn(
                    "transition-colors duration-100",
                    onRowClick && "cursor-pointer hover:bg-surface-2",
                    isRowActive?.(row.original) && "bg-accent-soft/50",
                  )}
                >
                  {row.getAllCells().map((cell) => {
                    const align = (cell.column.columnDef.meta as ColumnMeta | undefined)?.align;
                    return (
                      <td
                        key={cell.id}
                        className={cn(
                          "px-4 py-3 align-middle text-[0.8438rem] text-ink",
                          align === "right" && "text-right",
                          align === "center" && "text-center",
                        )}
                      >
                        <table.FlexRender cell={cell} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {firstLoad && <span className="sr-only" role="status" aria-live="polite">Loading rows</span>}
      {!busy && rows.length === 0 && empty}

      {pageCount > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft px-5 py-3">
          <p className="tnum text-[0.75rem] text-ink-3">
            {total === 0 ? "No rows" : `${pageIndex * size + 1}–${Math.min((pageIndex + 1) * size, total)} of ${total}`}
          </p>
          <div className="flex items-center gap-1.5">
            <Button
              variant="secondary"
              size="icon-sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Previous page"
            >
              <IconChevronLeft size={15} />
            </Button>
            <span className="tnum px-1 text-[0.75rem] text-ink-2">
              {pageIndex + 1} / {pageCount}
            </span>
            <Button
              variant="secondary"
              size="icon-sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Next page"
            >
              <IconChevronRight size={15} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
