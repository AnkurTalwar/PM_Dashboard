import { useMemo, useState, type KeyboardEvent } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Plus, RotateCcw, Trash2, Search, Sparkles, AlertCircle } from 'lucide-react';
import type { EffectiveRow, RowId } from '@/lib/editable-store';
import type { EditableLookupApi } from '@/hooks/use-editable-lookup';
import { cn } from '@/lib/utils';

export type ColumnType = 'text' | 'number' | 'select' | 'readonly';

export interface ColumnDef<T> {
  key: keyof T & string;
  header: string;
  type: ColumnType;
  options?: string[];
  align?: 'left' | 'right' | 'center';
  width?: string;
  /** Render override for readonly display formatting (e.g. currency). */
  format?: (value: T[keyof T], row: T) => React.ReactNode;
  /** Allow null/empty values. Default true for text/select, false for number. */
  nullable?: boolean;
}

interface Props<T> {
  api: EditableLookupApi<T>;
  columns: ColumnDef<T>[];
  /** Optional global text filter applied across all string columns. */
  searchPlaceholder?: string;
  /** Stable label for the entity, used in messages. */
  entityLabel: string;
  /** When true, hide the Add button (e.g. forecast rows that need richer context). */
  disableAdd?: boolean;
  /** Maximum height of the scrollable table viewport. */
  maxHeight?: string;
}

export function EditableTable<T extends object>({
  api,
  columns,
  searchPlaceholder = 'Search…',
  entityLabel,
  disableAdd = false,
  maxHeight = '560px',
}: Props<T>) {
  const [query, setQuery] = useState('');

  const filteredRows = useMemo(() => {
    if (!query.trim()) return api.rows;
    const q = query.toLowerCase();
    return api.rows.filter((r) =>
      columns.some((c) => {
        const v = r.data[c.key];
        return v != null && String(v).toLowerCase().includes(q);
      }),
    );
  }, [api.rows, query, columns]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1">
          {api.modifiedCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              <Sparkles className="h-3 w-3 mr-1" /> {api.modifiedCount} edited
            </Badge>
          )}
          {api.addedCount > 0 && (
            <Badge variant="secondary" className="text-xs bg-success/10 text-success border-success/30">
              +{api.addedCount} added
            </Badge>
          )}
          {api.deletedCount > 0 && (
            <Badge variant="secondary" className="text-xs bg-destructive/10 text-destructive border-destructive/30">
              −{api.deletedCount} removed
            </Badge>
          )}
        </div>
        {api.hasChanges && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (confirm(`Reset all ${entityLabel.toLowerCase()} edits back to the workbook baseline?`)) {
                api.resetAll();
              }
            }}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset all
          </Button>
        )}
        {!disableAdd && (
          <Button size="sm" onClick={() => api.add()}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add {entityLabel}
          </Button>
        )}
      </div>

      <div className="rounded-md border overflow-auto" style={{ maxHeight }}>
        <Table>
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow>
              <TableHead className="w-[44px]" />
              {columns.map((c) => (
                <TableHead
                  key={c.key}
                  className={cn(
                    c.align === 'right' && 'text-right',
                    c.align === 'center' && 'text-center',
                  )}
                  style={c.width ? { width: c.width } : undefined}
                >
                  {c.header}
                </TableHead>
              ))}
              <TableHead className="w-[80px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length + 2} className="text-center text-muted-foreground py-8">
                  No {entityLabel.toLowerCase()}s match this filter.
                </TableCell>
              </TableRow>
            )}
            {filteredRows.map((row) => (
              <EditableRow
                key={row.id}
                row={row}
                columns={columns}
                onUpdate={(patch) => api.update(row.id, patch)}
                onReset={() => api.resetRow(row.id)}
                onRemove={() => {
                  if (confirm(`Remove this ${entityLabel.toLowerCase()}?`)) api.remove(row.id);
                }}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      {api.lastUpdatedAt && (
        <div className="text-[10px] text-muted-foreground">
          Last edit saved {new Date(api.lastUpdatedAt).toLocaleString()} · stored in your browser
        </div>
      )}
    </div>
  );
}

interface RowProps<T> {
  row: EffectiveRow<T>;
  columns: ColumnDef<T>[];
  onUpdate: (patch: Partial<T>) => void;
  onReset: () => void;
  onRemove: () => void;
}

function EditableRow<T extends object>({
  row,
  columns,
  onUpdate,
  onReset,
  onRemove,
}: RowProps<T>) {
  const isAdded = row.source === 'added';
  const isEdited = row.source === 'edited';

  return (
    <TableRow
      className={cn(
        isAdded && 'bg-success/5',
        isEdited && 'bg-primary/5',
      )}
    >
      <TableCell className="align-middle">
        {isAdded ? (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="outline" className="h-5 px-1 text-[9px] bg-success/10 text-success border-success/30">
                  NEW
                </Badge>
              </TooltipTrigger>
              <TooltipContent>Added by you</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : isEdited ? (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="outline" className="h-5 px-1 text-[9px]">
                  EDIT
                </Badge>
              </TooltipTrigger>
              <TooltipContent>Modified from baseline</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
      </TableCell>
      {columns.map((col) => (
        <EditableCell
          key={col.key}
          col={col}
          value={row.data[col.key]}
          baselineValue={row.baseline ? row.baseline[col.key] : undefined}
          isModifiedRow={isEdited || isAdded}
          isAdded={isAdded}
          onChange={(v) => onUpdate({ [col.key]: v } as Partial<T>)}
        />
      ))}
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          {(isEdited || isAdded) && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onReset}>
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{isAdded ? 'Discard new row' : 'Reset to baseline'}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onRemove}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete row</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </TableCell>
    </TableRow>
  );
}

interface CellProps<T> {
  col: ColumnDef<T>;
  value: unknown;
  baselineValue: unknown;
  isModifiedRow: boolean;
  isAdded: boolean;
  onChange: (v: unknown) => void;
}

function EditableCell<T>({ col, value, baselineValue, isAdded, onChange }: CellProps<T>) {
  const cellModified = !isAdded && baselineValue !== undefined && !Object.is(value, baselineValue);
  const align = col.align ?? (col.type === 'number' ? 'right' : 'left');

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
  };

  if (col.type === 'readonly') {
    return (
      <TableCell className={cn(align === 'right' && 'text-right', align === 'center' && 'text-center')}>
        {col.format ? col.format(value as never, undefined as never) : (value as React.ReactNode) ?? '—'}
      </TableCell>
    );
  }

  const inputClass = cn(
    'h-8 border-transparent bg-transparent shadow-none focus-visible:border-input focus-visible:bg-background',
    align === 'right' && 'text-right tabular-nums',
    align === 'center' && 'text-center',
    cellModified && 'text-primary font-medium',
  );

  const wrap = (node: React.ReactNode) => (
    <TableCell
      className={cn(
        'p-1 align-middle relative',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
      )}
    >
      {cellModified ? (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="relative">
                {node}
                <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <div className="text-xs">
                <div className="text-muted-foreground">Baseline</div>
                <div className="font-mono">{formatBaseline(baselineValue)}</div>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        node
      )}
    </TableCell>
  );

  if (col.type === 'select' && col.options) {
    return wrap(
      <Select
        value={(value as string) ?? ''}
        onValueChange={(v) => onChange(v === '__null__' ? null : v)}
      >
        <SelectTrigger className={cn(inputClass, 'pl-2')}>
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          {col.nullable !== false && <SelectItem value="__null__">— None —</SelectItem>}
          {col.options.map((opt) => (
            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
          ))}
        </SelectContent>
      </Select>,
    );
  }

  if (col.type === 'number') {
    return wrap(
      <Input
        type="number"
        value={value == null ? '' : String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') {
            onChange(col.nullable ? null : 0);
          } else {
            const n = Number(raw);
            onChange(Number.isNaN(n) ? 0 : n);
          }
        }}
        onKeyDown={onKey}
        className={inputClass}
      />,
    );
  }

  return wrap(
    <Input
      type="text"
      value={value == null ? '' : String(value)}
      onChange={(e) => {
        const raw = e.target.value;
        onChange(raw === '' && col.nullable !== false ? null : raw);
      }}
      onKeyDown={onKey}
      className={inputClass}
    />,
  );
}

function formatBaseline(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'number') return v.toLocaleString();
  return String(v);
}
