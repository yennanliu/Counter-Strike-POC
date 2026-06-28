/**
 * Game-center lobby client: joins Colyseus's LobbyRoom and tracks the live player
 * count per field (summed across rooms on that map). Calls back on every change.
 */
import { Client, type Room } from "colyseus.js";

export type FieldCounts = Record<string, number>;

interface RoomListing {
  roomId?: string;
  clients?: number;
  metadata?: { mapId?: string };
}

export class Lobby {
  private room: Room | null = null;
  private readonly listings = new Map<string, RoomListing>();

  constructor(
    private readonly endpoint: string,
    private readonly onUpdate: (counts: FieldCounts) => void,
  ) {}

  async connect(): Promise<void> {
    const client = new Client(this.endpoint);
    this.room = await client.joinOrCreate("lobby");

    this.room.onMessage("rooms", (rooms: RoomListing[]) => {
      this.listings.clear();
      for (const r of rooms) this.ingest(r);
      this.emit();
    });
    this.room.onMessage("+", ([roomId, data]: [string, RoomListing]) => {
      this.ingest(data, roomId);
      this.emit();
    });
    this.room.onMessage("-", (roomId: string) => {
      this.listings.delete(roomId);
      this.emit();
    });
  }

  private ingest(data: RoomListing, roomId?: string): void {
    const id = roomId ?? data.roomId;
    if (!id) return;
    this.listings.set(id, data);
  }

  private emit(): void {
    const counts: FieldCounts = {};
    for (const l of this.listings.values()) {
      const map = l.metadata?.mapId ?? "?";
      counts[map] = (counts[map] ?? 0) + (l.clients ?? 0);
    }
    this.onUpdate(counts);
  }

  async leave(): Promise<void> {
    await this.room?.leave();
    this.room = null;
  }
}
