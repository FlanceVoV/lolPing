import type { RoomState } from '../../shared/room';
import { DESKTOP_SIGNAL_CHUNK, MAX_DESKTOP_SIGNAL } from '../../shared/roomProtocol';
import { api } from './api';

export interface DesktopView {
  peer: string;
  display: number;
  share: string;
  stream: MediaStream;
}

type Wire =
  | { kind: 'hello' }
  | { kind: 'offer'; share: string; connection: string; display: number; sdp: string }
  | { kind: 'answer'; share: string; connection: string; sdp: string }
  | { kind: 'stop'; share: string };

interface Incoming {
  share: string;
  pc: RTCPeerConnection;
}

interface Outgoing extends Incoming {
  display: number;
  connection: string;
}

interface Fragments {
  pieces: (string | undefined)[];
  until: number;
}

const isToken = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{16}$/.test(value);
const token = (): string => [...crypto.getRandomValues(new Uint8Array(8))].map((x) => x.toString(16).padStart(2, '0')).join('');

/** No STUN or TURN: only host candidates on the local network are gathered. */
function connection(): RTCPeerConnection {
  return new RTCPeerConnection({ iceServers: [], iceTransportPolicy: 'all' });
}

async function gathered(pc: RTCPeerConnection): Promise<string> {
  if (pc.iceGatheringState !== 'complete') {
    await new Promise<void>((resolve) => {
      const done = (): void => { clearTimeout(timeout); pc.removeEventListener('icegatheringstatechange', changed); resolve(); };
      const changed = (): void => { if (pc.iceGatheringState === 'complete') done(); };
      const timeout = setTimeout(done, 8_000);
      pc.addEventListener('icegatheringstatechange', changed);
    });
  }
  return pc.localDescription?.sdp ?? '';
}

/** Owns one explicit screen capture and the local WebRTC connections for room members. */
export class DesktopSession {
  private readonly outgoing = new Map<string, Outgoing>();
  private readonly incoming = new Map<string, Incoming>();
  private readonly views = new Map<string, DesktopView>();
  private readonly fragments = new Map<string, Fragments>();
  private readonly completed = new Map<string, number>();
  private offSignal: (() => void) | null = null;
  private stream: MediaStream | null = null;
  private share: string | null = null;
  private display = 1;
  private peers = new Set<string>();
  private disposed = false;

  constructor(private readonly onViews: (views: DesktopView[]) => void, private readonly onShare: (display: number | null) => void) {}

  listen(): void {
    this.offSignal = api.onDesktopSignal((message) => void this.fragment(message));
  }

  roomChanged(room: RoomState): void {
    const next = new Set(room.members.filter((m) => !m.self && m.path === 'lan' && !m.needsUpdate).map((m) => m.peer));
    const added = [...next].filter((peer) => !this.peers.has(peer));
    for (const peer of this.peers) if (!next.has(peer)) this.drop(peer);
    this.peers = next;
    if (room.phase === 'idle') { this.stopShare(); return; }
    // A viewer can open Settings after sharing started; ask the sharer for a fresh offer.
    for (const peer of added) void this.send(peer, { kind: 'hello' });
    if (this.stream) for (const peer of next) if (!this.outgoing.has(peer)) void this.offer(peer);
  }

  async startShare(display: number): Promise<void> {
    this.stopShare();
    // The source is prepared before the click. getDisplayMedia must run while that click's user gesture is active.
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false });
    if (this.disposed) { stream.getTracks().forEach((track) => track.stop()); return; }
    this.stream = stream;
    this.display = display;
    this.share = token();
    stream.getVideoTracks()[0].addEventListener('ended', () => this.stopShare(), { once: true });
    await api.setDesktopShare({ display, token: this.share });
    this.onShare(display);
    for (const peer of this.peers) void this.offer(peer);
  }

  stopShare(): void {
    const old = this.share;
    this.share = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    for (const [peer, item] of this.outgoing) {
      item.pc.close();
      if (old) void this.send(peer, { kind: 'stop', share: old });
    }
    this.outgoing.clear();
    void api.setDesktopShare(null);
    this.onShare(null);
  }

  ping(view: DesktopView, ping: import('../../shared/pings').PingId, x: number, y: number): void {
    if (!this.peers.has(view.peer) || x < 0 || x > 1 || y < 0 || y > 1) return;
    void api.sendDesktopPing(view.peer, view.share, ping, view.display, x, y);
  }

  dispose(): void {
    this.disposed = true;
    this.offSignal?.();
    this.offSignal = null;
    this.stopShare();
    for (const peer of this.incoming.keys()) this.drop(peer);
    this.fragments.clear();
  }

  private async offer(peer: string): Promise<void> {
    const stream = this.stream;
    const share = this.share;
    if (!stream || !share || !this.peers.has(peer) || this.outgoing.has(peer)) return;
    const pc = connection();
    const item: Outgoing = { pc, share, connection: token(), display: this.display };
    this.outgoing.set(peer, item);
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    try {
      await pc.setLocalDescription(await pc.createOffer());
      const sdp = await gathered(pc);
      if (this.outgoing.get(peer) === item && sdp) await this.send(peer, { kind: 'offer', share, connection: item.connection, display: item.display, sdp });
    } catch {
      if (this.outgoing.get(peer) === item) { pc.close(); this.outgoing.delete(peer); }
    }
  }

  private async send(peer: string, wire: Wire): Promise<void> {
    if (this.peers.has(peer)) await api.sendDesktopSignal(peer, JSON.stringify(wire));
  }

  private async fragment(message: { from: string; id: string; part: number; total: number; data: string }): Promise<void> {
    if (this.disposed || !this.peers.has(message.from) || !isToken(message.id) || !Number.isInteger(message.part)
      || !Number.isInteger(message.total) || message.total < 1 || message.total > 64 || message.part < 0 || message.part >= message.total
      || typeof message.data !== 'string' || message.data.length > DESKTOP_SIGNAL_CHUNK) return;
    const now = Date.now();
    for (const [id, until] of this.completed) if (until < now) this.completed.delete(id);
    for (const [id, entry] of this.fragments) if (entry.until < now) this.fragments.delete(id);
    const key = `${message.from}:${message.id}`;
    if (this.completed.has(key)) return;
    let entry = this.fragments.get(key);
    if (!entry) {
      entry = { pieces: Array(message.total).fill(undefined), until: now + 20_000 };
      this.fragments.set(key, entry);
    }
    if (entry.pieces.length !== message.total) return;
    entry.pieces[message.part] = message.data;
    if (entry.pieces.some((part) => part === undefined)) return;
    this.fragments.delete(key);
    this.completed.set(key, now + 20_000);
    try { await this.receive(message.from, JSON.parse(entry.pieces.join('')) as Wire); } catch { /* invalid or stale signal */ }
  }

  private async receive(peer: string, wire: Wire): Promise<void> {
    if (!wire) return;
    if (wire.kind === 'hello') {
      if (this.stream) {
        this.outgoing.get(peer)?.pc.close();
        this.outgoing.delete(peer);
        void this.offer(peer);
      }
      return;
    }
    if (!isToken(wire.share)) return;
    if (wire.kind === 'stop') {
      if (this.incoming.get(peer)?.share === wire.share) this.dropIncoming(peer);
      return;
    }
    if (wire.kind === 'answer') {
      const item = this.outgoing.get(peer);
      if (item?.share === wire.share && item.connection === wire.connection && typeof wire.sdp === 'string' && wire.sdp.length <= MAX_DESKTOP_SIGNAL) {
        await item.pc.setRemoteDescription({ type: 'answer', sdp: wire.sdp });
      }
      return;
    }
    if (wire.kind !== 'offer' || !isToken(wire.connection) || typeof wire.sdp !== 'string' || wire.sdp.length > MAX_DESKTOP_SIGNAL
      || !Number.isInteger(wire.display) || wire.display < 1 || wire.display > 16) return;
    this.dropIncoming(peer);
    const pc = connection();
    const item: Incoming = { pc, share: wire.share };
    this.incoming.set(peer, item);
    pc.ontrack = (event) => {
      if (this.incoming.get(peer) !== item) return;
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      this.views.set(peer, { peer, display: wire.display, share: wire.share, stream });
      this.onViews([...this.views.values()]);
    };
    try {
      await pc.setRemoteDescription({ type: 'offer', sdp: wire.sdp });
      await pc.setLocalDescription(await pc.createAnswer());
      const sdp = await gathered(pc);
      if (this.incoming.get(peer) === item && sdp) await this.send(peer, { kind: 'answer', share: wire.share, connection: wire.connection, sdp });
    } catch { if (this.incoming.get(peer) === item) this.dropIncoming(peer); }
  }

  private dropIncoming(peer: string): void {
    this.incoming.get(peer)?.pc.close();
    this.incoming.delete(peer);
    if (this.views.delete(peer)) this.onViews([...this.views.values()]);
  }

  private drop(peer: string): void {
    this.dropIncoming(peer);
    this.outgoing.get(peer)?.pc.close();
    this.outgoing.delete(peer);
  }
}
