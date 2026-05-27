import { Injectable } from "@nestjs/common";
import { Observable, Subject, filter, map } from "rxjs";

export type StockShieldLiveEvent = {
  type: "drift.created" | "drift.updated" | "alert.sent" | "alert.failed" | "alert.skipped" | "risk.updated";
  tenantId: string;
  id?: string;
  driftEventId?: string | null;
  sku?: string;
  locationId?: string;
  status?: string;
  message?: string;
  createdAt: string;
};

@Injectable()
export class LiveEventsService {
  private readonly events = new Subject<StockShieldLiveEvent>();

  publish(event: Omit<StockShieldLiveEvent, "createdAt"> & { createdAt?: string }) {
    this.events.next({
      ...event,
      createdAt: event.createdAt ?? new Date().toISOString(),
    });
  }

  stream(tenantId?: string): Observable<MessageEvent> {
    return this.events.asObservable().pipe(
      filter((event) => !tenantId || event.tenantId === tenantId),
      map((event) => ({
        type: event.type,
        data: event,
      }) as MessageEvent),
    );
  }
}
