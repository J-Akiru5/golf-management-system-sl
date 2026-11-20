"use client";

import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/field";
import {
  ALL_MONTHS,
  ALL_OWNERS,
  type BoardFilter,
  filterIsActive,
  monthValueForFilter,
  NO_MONTH,
  ownerValueForFilter,
  UNASSIGNED_OWNER,
} from "@/lib/board/filters";
import { formatMonth } from "@/lib/board/format";
import type { BoardMember } from "@/lib/board/repo";

/** Filters change what is shown; they never refetch or change a card. */
export function BoardFilters({
  filter,
  members,
  months,
  showNoDate,
  onChange,
}: {
  filter: BoardFilter;
  members: readonly BoardMember[];
  months: readonly string[];
  showNoDate: boolean;
  onChange: (filter: BoardFilter) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-[10rem] flex-1 sm:flex-none">
        <Label htmlFor="board-owner-filter" className="mb-1 block text-[12px] text-ink-muted">
          Owner
        </Label>
        <Select
          id="board-owner-filter"
          value={ownerValueForFilter(filter.ownerId)}
          onChange={(event) => {
            const value = event.currentTarget.value;
            onChange({
              ...filter,
              ownerId: value === ALL_OWNERS ? undefined : value === UNASSIGNED_OWNER ? null : value,
            });
          }}
        >
          <option value={ALL_OWNERS}>All owners</option>
          <option value={UNASSIGNED_OWNER}>Unassigned</option>
          {members.map((member) => (
            <option key={member.user_id} value={member.user_id}>
              {member.display_name}
            </option>
          ))}
        </Select>
      </div>

      <div className="min-w-[10rem] flex-1 sm:flex-none">
        <Label htmlFor="board-month-filter" className="mb-1 block text-[12px] text-ink-muted">
          Month
        </Label>
        <Select
          id="board-month-filter"
          value={monthValueForFilter(filter.month)}
          onChange={(event) => {
            const value = event.currentTarget.value;
            onChange({
              ...filter,
              month: value === ALL_MONTHS ? undefined : value === NO_MONTH ? null : value,
            });
          }}
        >
          <option value={ALL_MONTHS}>All months</option>
          {showNoDate ? <option value={NO_MONTH}>No date</option> : null}
          {months.map((month) => (
            <option key={month} value={month}>
              {formatMonth(month)}
            </option>
          ))}
        </Select>
      </div>

      {filterIsActive(filter) ? (
        <Button variant="ghost" size="sm" onClick={() => onChange({})} className="h-11 text-[13px]">
          Clear filters
        </Button>
      ) : null}
    </div>
  );
}
