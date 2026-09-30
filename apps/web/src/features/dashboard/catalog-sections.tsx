import type { ReactNode } from 'react';
import type {
  CatalogActivity,
  CatalogListResponse,
  CatalogLocale,
  CatalogSlot,
  LocalizedText,
} from './catalog-api';
import { CatalogNotice, describeCatalogError } from './catalog-feedback';
import type {
  ActivityStatusFilter,
  SlotStatusFilter,
} from './use-catalog-navigation';

type CatalogListState<Item> = {
  data: CatalogListResponse<Item> | undefined;
  isPending: boolean;
  error: Error | null;
};

type ListControls = {
  page: number;
  isUpdating: boolean;
  isBusy: boolean;
  onPageChange: (page: number) => void;
};

export function ActivitiesSection({
  query,
  selectedActivityId,
  status,
  page,
  isUpdating,
  isBusy,
  onStatusChange,
  onPageChange,
  onSelect,
  onCommand,
}: ListControls & {
  query: CatalogListState<CatalogActivity>;
  selectedActivityId: string | null;
  status: ActivityStatusFilter;
  onStatusChange: (status: string) => void;
  onSelect: (activityId: string) => void;
  onCommand: (activityId: string, command: 'publish' | 'disable') => void;
}) {
  const items = query.data?.items ?? [];
  return (
    <section className="catalog-section" aria-labelledby="activities-heading">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Catalog</p>
          <h3 id="activities-heading">Activities</h3>
        </div>
        <span className="context-badge">{items.length} shown</span>
      </div>
      {isUpdating && (
        <CatalogNotice
          title="Updating activities"
          message="Saving the latest activity change."
        />
      )}
      <label className="catalog-filter">
        <span>Status</span>
        <select
          value={status}
          onChange={(event) => onStatusChange(event.target.value)}
        >
          <option value="">All statuses</option>
          <option value="Draft">Draft</option>
          <option value="Published">Published</option>
          <option value="Disabled">Disabled</option>
        </select>
      </label>
      {query.isPending && <CatalogNotice title="Loading activities" />}
      {query.error && (
        <CatalogNotice
          title="Activities could not be loaded"
          message={describeCatalogError(query.error)}
        />
      )}
      {!query.isPending && !query.error && items.length === 0 && (
        <CatalogNotice
          title="No activities yet"
          message="Create the first activity for this center to start adding availability."
        />
      )}
      <ul className="catalog-list">
        {items.map((activity) => (
          <ActivityRow
            key={activity.id}
            activity={activity}
            isSelected={activity.id === selectedActivityId}
            isBusy={isBusy}
            onSelect={() => onSelect(activity.id)}
            onCommand={(command) => onCommand(activity.id, command)}
          />
        ))}
      </ul>
      <Pagination
        page={page}
        hasNext={query.data?.hasNext ?? false}
        onPageChange={onPageChange}
      />
    </section>
  );
}

export function ActivitySlotsSection({
  activity,
  query,
  status,
  page,
  isUpdating,
  isBusy,
  onStatusChange,
  onPageChange,
  onCommand,
  children,
}: ListControls & {
  activity: CatalogActivity;
  query: CatalogListState<CatalogSlot>;
  status: SlotStatusFilter;
  onStatusChange: (status: string) => void;
  onCommand: (slotId: string, command: 'close' | 'cancel') => void;
  children: ReactNode;
}) {
  const items = query.data?.items ?? [];
  return (
    <section
      className="catalog-section slots-section"
      aria-labelledby="slots-heading"
    >
      <div className="section-heading">
        <div>
          <p className="section-kicker">Activity availability</p>
          <h3 id="slots-heading">
            Slots for{' '}
            {resolveCatalogText(activity.name, 'en', activity.baseLocale)}
          </h3>
        </div>
        <span className="context-badge">{activity.status}</span>
      </div>
      <div className="slot-toolbar">
        {isUpdating && (
          <CatalogNotice
            title="Updating slots"
            message="Saving the latest slot change."
          />
        )}
        <label className="catalog-filter">
          <span>Status</span>
          <select
            value={status}
            onChange={(event) => onStatusChange(event.target.value)}
          >
            <option value="">All statuses</option>
            <option value="Available">Available</option>
            <option value="Full">Full</option>
            <option value="Closed">Closed</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </label>
        <span className="field-hint">
          Starts at accepts an RFC3339 instant such as 2026-10-01T10:00:00Z.
        </span>
      </div>
      {query.isPending && <CatalogNotice title="Loading slots" />}
      {query.error && (
        <CatalogNotice
          title="Slots could not be loaded"
          message={describeCatalogError(query.error)}
        />
      )}
      {!query.isPending && !query.error && items.length === 0 && (
        <CatalogNotice
          title="No slots yet"
          message="Add a slot after the activity is published."
        />
      )}
      <ul className="catalog-list slot-list">
        {items.map((slot) => (
          <SlotRow
            key={slot.id}
            slot={slot}
            isBusy={isBusy}
            onCommand={(command) => onCommand(slot.id, command)}
          />
        ))}
      </ul>
      <Pagination
        page={page}
        hasNext={query.data?.hasNext ?? false}
        onPageChange={onPageChange}
      />
      {children}
    </section>
  );
}

function ActivityRow({
  activity,
  isSelected,
  isBusy,
  onSelect,
  onCommand,
}: {
  activity: CatalogActivity;
  isSelected: boolean;
  isBusy: boolean;
  onSelect: () => void;
  onCommand: (command: 'publish' | 'disable') => void;
}) {
  const description = activity.description
    ? resolveCatalogText(activity.description, 'en', activity.baseLocale)
    : undefined;
  return (
    <li className={`catalog-row${isSelected ? ' is-selected' : ''}`}>
      <button
        className="catalog-row-select"
        type="button"
        aria-pressed={isSelected}
        onClick={onSelect}
      >
        <span>
          <strong>
            {resolveCatalogText(activity.name, 'en', activity.baseLocale)}
          </strong>
          {description && <small>{description}</small>}
        </span>
        <StatusBadge status={activity.status} />
      </button>
      <div className="catalog-row-actions">
        {activity.status === 'Draft' && (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => onCommand('publish')}
          >
            Publish
          </button>
        )}
        {activity.status === 'Published' && (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => onCommand('disable')}
          >
            Disable
          </button>
        )}
      </div>
    </li>
  );
}

function SlotRow({
  slot,
  isBusy,
  onCommand,
}: {
  slot: CatalogSlot;
  isBusy: boolean;
  onCommand: (command: 'close' | 'cancel') => void;
}) {
  return (
    <li className="catalog-row">
      <div className="catalog-row-select catalog-row-static">
        <span>
          <strong>{slot.startsAt}</strong>
          <small>
            {slot.durationMinutes} min · capacity {slot.capacity}
          </small>
        </span>
        <StatusBadge status={slot.status} />
      </div>
      <div className="catalog-row-actions">
        {['Available', 'Full'].includes(slot.status) && (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => onCommand('close')}
          >
            Close
          </button>
        )}
        {['Available', 'Full', 'Closed'].includes(slot.status) && (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => onCommand('cancel')}
          >
            Cancel
          </button>
        )}
      </div>
    </li>
  );
}

function Pagination({
  page,
  hasNext,
  onPageChange,
}: {
  page: number;
  hasNext: boolean;
  onPageChange: (page: number) => void;
}) {
  return (
    <nav className="pagination" aria-label="Pagination">
      <button
        type="button"
        disabled={page === 1}
        onClick={() => onPageChange(page - 1)}
      >
        Previous
      </button>
      <span>Page {page}</span>
      <button
        type="button"
        disabled={!hasNext}
        onClick={() => onPageChange(page + 1)}
      >
        Next
      </button>
    </nav>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`status-badge status-${status.toLowerCase()}`}>
      {status}
    </span>
  );
}

function resolveCatalogText(
  value: LocalizedText,
  requestedLocale: CatalogLocale,
  baseLocale: CatalogLocale,
) {
  return value[requestedLocale] ?? value[baseLocale];
}
