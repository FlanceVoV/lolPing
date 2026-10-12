import { Button, Input, Slider, Spinner, Switch } from '@fluentui/react-components';
import {
  ArrowSync24Regular, Color24Regular, Desktop24Regular, Globe24Regular, Person24Regular, PeopleCommunity24Regular,
  SpeakerMute24Regular, TopSpeed24Regular, Warning24Regular,
} from '@fluentui/react-icons';
import { useEffect, useRef, useState } from 'react';
import type { RoomMember, RoomState } from '../../../shared/room';
import { TAG_COLORS } from '../../../shared/roomColors';
import { clampNameInput } from '../../../shared/roomProtocol';
import { ALL_PINGS, type PingId } from '../../../shared/pings';
import { emoteName, type CustomEmote, type EmoteRef } from '../../../shared/emotes';
import { isDesktopText, type DesktopText } from '../../../shared/desktopText';
import { LIMITS, type DesktopResolution, type Settings } from '../../../shared/settings';
import { api } from '../api';
import { desktopPoint } from '../desktopGeometry';
import { availableDesktopResolutions, desktopCaptureSize } from '../desktopResolution';
import { DesktopSession, type DesktopSend, type DesktopView } from '../desktopSession';
import { useText } from '../text';
import type { Update } from '../useAppState';
import { useRoomState } from '../useRoomState';
import { SettingRow, SwitchRow } from './rows';

const { max: LIMIT_MAX } = LIMITS.incomingPingLimit;
/** The slider runs 1…max+1; its last stop is Unlimited (stored as 0). */
const toSlider = (limit: number): number => (limit === 0 ? LIMIT_MAX + 1 : limit);
const fromSlider = (v: number): number => (v > LIMIT_MAX ? 0 : v);

function NameRow({ value, onSave }: { value: string; onSave(name: string): void }) {
  const t = useText();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const save = () => {
    if (draft !== value) onSave(draft);
  };
  return (
    <SettingRow icon={<Person24Regular />} title={t.roomName} description={t.roomNameDesc}>
      <Input value={draft} style={{ width: 190 }} onChange={(_, d) => setDraft(clampNameInput(d.value))} onBlur={save}
        onKeyDown={(e) => e.key === 'Enter' && save()} />
    </SettingRow>
  );
}

function JoinCard() {
  const t = useText();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const touched = useRef(false);
  useEffect(() => {
    void api.clipboardRoomCode().then((c) => {
      if (c && !touched.current) setCode(c);
    });
  }, []);
  const join = async () => {
    setBusy(true);
    const r = await api.joinRoom(code);
    setBusy(false);
    setError(r.ok ? null : r.error === 'mistyped' ? t.roomMistyped : r.error === 'failed' ? t.roomJoinFailed : t.roomInvalid);
  };
  return (
    <div className="card roomJoin">
      <span className="icon"><PeopleCommunity24Regular /></span>
      <div className="lbl">
        {t.roomJoinTitle}
        <span className="desc">{t.roomJoinDesc}</span>
        <span className="desc">{t.roomNetworkHint}</span>
      </div>
      <div className="ctl">
        <Input placeholder="PING-XXXXX-XXXXX" value={code} style={{ width: 190 }}
          onChange={(_, d) => {
            touched.current = true;
            setCode(d.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && void join()} />
        <Button appearance="primary" disabled={busy || !code.trim()} onClick={() => void join()}>{t.roomJoin}</Button>
        <Button disabled={busy} onClick={() => {
          setBusy(true); // a double click would create a room and replace it at once
          void api.createRoom().finally(() => setBusy(false));
        }}>{t.roomCreate}</Button>
      </div>
      {error ? <div className="roomError">{error}</div> : null}
    </div>
  );
}

function MemberRow({ m }: { m: RoomMember }) {
  const t = useText();
  return (
    <div className="member">
      <span className="tagDot" style={{ background: TAG_COLORS[m.color] }} />
      <span className="memberName">
        {m.name}
        {m.self ? <span className="desc inline">({t.roomYou})</span> : null}
        {m.noEmotes ? <span className="desc">{t.memberOldNoEmotes}</span> : null}
      </span>
      {m.self ? null : <span className={`badge ${m.path}`}>{t.roomPath[m.path]}</span>}
      {m.status === 'paused' ? <span className="badge">{t.roomPaused}</span> : null}
      {m.status === 'muted' ? <span className="badge">{t.roomMutedBadge}</span> : null}
      {m.needsUpdate ? <span className="badge bad">{t.roomNeedsUpdate}</span> : null}
      {m.self ? null : (
        <Button size="small" appearance={m.muted ? 'primary' : 'secondary'} onClick={() => void api.muteMember(m.peer, !m.muted)}>
          {m.muted ? t.roomUnmuteMember : t.roomMuteMember}
        </Button>
      )}
    </div>
  );
}

function InRoom({ room, settings, update }: {
  room: RoomState; settings: Settings; update: Update;
}) {
  const t = useText();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  const alone = room.members.length <= 1;
  return (
    <>
      <div className="card">
        <span className="icon"><PeopleCommunity24Regular /></span>
        <div className="lbl">
          <span className="roomCode">{room.code}</span>
          <span className="desc">{room.phase === 'joining' ? t.roomJoining : t.roomShareDesc}</span>
        </div>
        <div className="ctl">
          {room.phase === 'joining' ? <Spinner size="tiny" /> : null}
          <Button onClick={() => {
            void api.copyRoomCode();
            setCopied(true);
          }}>{copied ? t.roomCopied : t.roomCopy}</Button>
          <Button onClick={() => void api.leaveRoom()}>{t.roomLeave}</Button>
        </div>
      </div>
      {room.lan === 'unavailable' ? (
        <div className="card permission">
          <span className="icon"><Warning24Regular /></span>
          <div className="lbl">
            <b>{t.roomLanUnavailable}</b>
            <span className="desc">{t.roomLanUnavailableDesc}</span>
          </div>
        </div>
      ) : null}
      {room.internet === 'unavailable' ? (
        <div className="card permission">
          <span className="icon"><Warning24Regular /></span>
          <div className="lbl">
            <b>{t.roomInternetUnavailable}</b>
            <span className="desc">{t.roomInternetUnavailableDesc}</span>
            <div className="actions">
              <Button onClick={() => void api.retryInternet()}>{t.roomRetry}</Button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="card members">
        {room.members.map((m) => <MemberRow key={m.peer} m={m} />)}
        {alone ? (
          <div className="desc roomWaiting">
            {room.lonely ? `${t.roomWaiting} ${t.roomLonely}` : t.roomWaiting}
            {room.lonely && !settings.allowInternet ? <span className="warnText"> {t.roomLonelyInternetOff}</span> : null}
          </div>
        ) : null}
        {room.clockSkew ? <div className="desc roomWaiting warnText">{t.roomClockSkew}</div> : null}
      </div>
      <DesktopPanel room={room} autoShareDesktop={settings.autoShareDesktop} desktopResolution={settings.desktopResolution}
        emoteWheel={settings.emoteWheel} clickEmoteId={settings.clickEmoteId} customEmotes={settings.customEmotes} update={update} />
    </>
  );
}

type SendMode = 'ping' | 'emote' | 'text' | 'image';

function DesktopComposer({ mode, setMode, ping, setPing, emote, setEmote, emotes, customEmotes, note, setNote,
  color, setColor, size, setSize }: {
  mode: SendMode; setMode(value: SendMode): void; ping: PingId; setPing(value: PingId): void;
  emote: EmoteRef; setEmote(value: EmoteRef): void; emotes: readonly EmoteRef[]; customEmotes: readonly CustomEmote[];
  note: string; setNote(value: string): void; color: string; setColor(value: string): void; size: number; setSize(value: number): void;
}) {
  const t = useText();
  const zh = t.lang === 'zh-CN';
  const validNote = isDesktopText({ text: note, color, size });
  return <div className="desktopComposer">
    <label>{zh ? '点击画面发送' : 'Click a desktop to send'}</label>
    <select aria-label={zh ? '发送模式' : 'Send mode'} value={mode} onChange={(event) => setMode(event.target.value as SendMode)}>
      <option value="ping">{zh ? '信号' : 'Ping'}</option>
      <option value="emote">{zh ? '表情' : 'Emote'}</option>
      <option value="text">{zh ? '文本' : 'Text'}</option>
      <option value="image" disabled>{zh ? '图片（即将支持）' : 'Image (coming soon)'}</option>
    </select>
    {mode === 'ping' ? <select aria-label={zh ? '信号类型' : 'Ping type'} value={ping} onChange={(event) => setPing(event.target.value as PingId)}>
      {ALL_PINGS.map((item) => <option key={item.id} value={item.id}>{t.pingNames[item.id]}</option>)}
    </select> : null}
    {mode === 'emote' ? <select aria-label={zh ? '表情类型' : 'Emote type'} value={emote} onChange={(event) => setEmote(event.target.value)}>
      {emotes.map((ref) => <option key={ref} value={ref}>{emoteName(ref, t.lang, customEmotes)}</option>)}
    </select> : null}
    {mode === 'text' ? <>
      <textarea aria-label={zh ? '发送的文字' : 'Text to send'} placeholder={zh ? '输入文字，支持多行' : 'Enter text, multiple lines allowed'}
        value={note} maxLength={256} rows={2} onChange={(event) => setNote(event.target.value)} />
      <label className="desktopColorLabel">{zh ? '颜色' : 'Color'} <input type="color" aria-label={zh ? '文字颜色' : 'Text color'} value={color} onChange={(event) => setColor(event.target.value)} /></label>
      <label className="desktopSizeLabel">{zh ? '字号' : 'Size'} <select aria-label={zh ? '文字大小' : 'Text size'} value={size} onChange={(event) => setSize(Number(event.target.value))}>
        {[20, 28, 36, 48, 64, 72].map((value) => <option key={value} value={value}>{value}px</option>)}
      </select></label>
      {!validNote && note ? <span className="desktopComposerError">{zh ? '文本最多 8 行、256 字符或 600 字节。' : 'Text is limited to 8 lines, 256 characters, or 600 bytes.'}</span> : null}
    </> : null}
  </div>;
}

function DesktopTile({ view, name, send, expanded, onSend, onToggle }: {
  view: DesktopView; name: string; send: DesktopSend | null; expanded: boolean;
  onSend(view: DesktopView, send: DesktopSend, x: number, y: number): void;
  onToggle(): void;
}) {
  const t = useText();
  const zh = t.lang === 'zh-CN';
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (clickTimer.current) clearTimeout(clickTimer.current); }, []);
  return (
    <div className={`desktopView${expanded ? ' expanded' : ''}`}>
      <div className="desktopViewHead">
        <b>{name} · #{view.display}</b>
        <button type="button" onClick={onToggle} aria-label={expanded ? (zh ? '缩小画面' : 'Restore video') : (zh ? '放大画面' : 'Enlarge video')}>
          {expanded ? (zh ? '返回全览' : 'Back to grid') : (zh ? '放大' : 'Enlarge')}
        </button>
      </div>
      <video autoPlay playsInline muted ref={(element) => { if (element && element.srcObject !== view.stream) element.srcObject = view.stream; }}
        aria-label={zh ? `${name} 的桌面，单击发送所选内容，双击放大` : `${name}'s desktop, click to send the selected content, double-click to enlarge`}
        onClick={(event) => {
          if (clickTimer.current) clearTimeout(clickTimer.current);
          const video = event.currentTarget;
          const point = desktopPoint(event.clientX, event.clientY, video.getBoundingClientRect(), video.videoWidth, video.videoHeight);
          if (point && send) clickTimer.current = setTimeout(() => { onSend(view, send, point.x, point.y); clickTimer.current = null; }, 300);
        }}
        onDoubleClick={() => {
          if (clickTimer.current) clearTimeout(clickTimer.current);
          clickTimer.current = null;
          onToggle();
        }} />
    </div>
  );
}

function DesktopPanel({ room, autoShareDesktop, desktopResolution, emoteWheel, clickEmoteId, customEmotes, update }: {
  room: RoomState; autoShareDesktop: boolean; desktopResolution: DesktopResolution;
  emoteWheel: readonly EmoteRef[]; clickEmoteId: EmoteRef; customEmotes: readonly CustomEmote[]; update: Update;
}) {
  const t = useText();
  const zh = t.lang === 'zh-CN';
  const controller = useRef<DesktopSession | null>(null);
  const [views, setViews] = useState<DesktopView[]>([]);
  const [wallOpen, setWallOpen] = useState(false);
  const [focusedPeer, setFocusedPeer] = useState<string | null>(null);
  const [sharing, setSharing] = useState<number | null>(null);
  const [display, setDisplay] = useState(1);
  const [mode, setMode] = useState<SendMode>('ping');
  const [ping, setPing] = useState<PingId>('generic');
  const [emote, setEmote] = useState<EmoteRef>(emoteWheel[0]);
  const [note, setNote] = useState('');
  const [color, setColor] = useState('#ffe65c');
  const [size, setSize] = useState(36);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const emotes = [...new Set([...emoteWheel, clickEmoteId])];
  const selectedEmote = emotes.includes(emote) ? emote : emotes[0];
  const textNote: DesktopText = { text: note, color, size };
  const send: DesktopSend | null = mode === 'ping' ? { kind: 'ping', id: ping }
    : mode === 'emote' ? { kind: 'emote', ref: selectedEmote }
      : mode === 'text' && isDesktopText(textNote) ? { kind: 'text', note: textNote } : null;
  const composer = <DesktopComposer mode={mode} setMode={setMode} ping={ping} setPing={setPing}
    emote={selectedEmote} setEmote={setEmote} emotes={emotes} customEmotes={customEmotes}
    note={note} setNote={setNote} color={color} setColor={setColor} size={size} setSize={setSize} />;
  const selectedDisplay = room.displays.find((item) => item.number === display);
  const displayAvailable = Boolean(selectedDisplay);
  const resolutions = selectedDisplay ? availableDesktopResolutions(selectedDisplay) : ['native' as const];
  const selectedResolution = resolutions.includes(desktopResolution) ? desktopResolution : 'native';
  const captureSize = selectedDisplay ? desktopCaptureSize(selectedDisplay, selectedResolution) : null;
  useEffect(() => {
    if (!displayAvailable && room.displays.length) setDisplay(room.displays.find((item) => item.primary)?.number ?? room.displays[0].number);
  }, [displayAvailable, room.displays]);
  useEffect(() => {
    if (focusedPeer && !views.some((view) => view.peer === focusedPeer)) setFocusedPeer(null);
    if (!views.length) setWallOpen(false);
  }, [focusedPeer, views]);
  useEffect(() => {
    if (!wallOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (focusedPeer) setFocusedPeer(null);
      else setWallOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusedPeer, wallOpen]);
  useEffect(() => {
    const desktop = new DesktopSession(setViews, setSharing);
    controller.current = desktop;
    desktop.listen();
    desktop.roomChanged(room);
    return () => { controller.current = null; desktop.dispose(); };
  }, []);
  useEffect(() => controller.current?.roomChanged(room), [room]);
  useEffect(() => {
    const desktop = controller.current;
    if (!desktop) return;
    if (!autoShareDesktop || room.phase !== 'active' || !displayAvailable) {
      desktop.stopShare();
      return;
    }
    let live = true;
    setError('');
    setBusy(true);
    void desktop.startShare(display, captureSize).catch(() => {
      if (live) setError(zh ? '无法共享所选屏幕，请检查屏幕录制权限后重试。' : 'Could not share this display. Check screen recording permission and try again.');
    }).finally(() => { if (live) setBusy(false); });
    return () => { live = false; desktop.stopShare(); };
  }, [autoShareDesktop, display, displayAvailable, selectedDisplay?.width, selectedDisplay?.height, selectedResolution, room.phase, zh]);
  const retry = async () => {
    setBusy(true);
    setError('');
    try { await controller.current?.startShare(display, captureSize); }
    catch { setError(zh ? '无法共享所选屏幕，请检查屏幕录制权限后重试。' : 'Could not share this display. Check screen recording permission and try again.'); }
    finally { setBusy(false); }
  };
  return (
    <div className="card desktopPanel">
      <div className="desktopHeader">
        <div className="lbl">
          <b>{zh ? '局域网桌面共享' : 'LAN desktop sharing'}</b>
          <span className="desc">{zh ? '加入房间后默认共享所选屏幕；关闭设置窗口仍会继续，关闭共享开关或离开房间即结束。仅同一局域网成员可观看。' : 'The selected display is shared by default in a room, even after closing Settings. Turn sharing off or leave the room to stop. Only LAN members can watch.'}</span>
        </div>
        <div className="desktopControls">
          <select aria-label={zh ? '共享的屏幕' : 'Display to share'} value={display} disabled={busy} onChange={(e) => setDisplay(Number(e.target.value))}>
            {room.displays.map((d) => <option key={d.number} value={d.number}>#{d.number} · {d.width}×{d.height}</option>)}
          </select>
          <select aria-label={zh ? '共享分辨率' : 'Sharing resolution'} value={selectedResolution} disabled={busy}
            onChange={(e) => { void update({ desktopResolution: e.target.value as DesktopResolution }); }}>
            {resolutions.map((resolution) => {
              const size = selectedDisplay && desktopCaptureSize(selectedDisplay, resolution);
              return <option key={resolution} value={resolution}>
                {resolution === 'native' ? (zh ? '原生' : 'Native') : resolution} · {size?.width ?? selectedDisplay?.width}×{size?.height ?? selectedDisplay?.height}
              </option>;
            })}
          </select>
          <Switch checked={autoShareDesktop} label={zh ? '自动共享' : 'Auto share'}
            onChange={(_, data) => { void update({ autoShareDesktop: data.checked }); }} />
          {busy ? <Spinner size="tiny" /> : null}
          {error && autoShareDesktop && !busy ? <Button onClick={() => void retry()}>{zh ? '重试共享' : 'Retry sharing'}</Button> : null}
        </div>
      </div>
      <span className="desc">{sharing !== null ? (zh ? `正在共享屏幕 #${sharing}` : `Sharing display #${sharing}`) : autoShareDesktop ? (zh ? '正在准备共享…' : 'Preparing to share…') : (zh ? '共享已关闭' : 'Sharing is off')}</span>
      {error ? <span className="roomError">{error}</span> : null}
      {views.length ? (
        <>
          <div className="desktopControls">
            {composer}
            <Button onClick={() => setWallOpen(true)}>{zh ? '打开监控墙' : 'Open monitor wall'}</Button>
          </div>
          <span className="desc">{zh ? '单击画面发送所选内容；双击放大，按 Esc 返回。' : 'Click a video to send the selected content; double-click to enlarge, Esc to return.'}</span>
          <div className={`desktopViews${wallOpen ? ' wallOpen' : ''}${focusedPeer ? ' focused' : ''}`}>
            {wallOpen ? <div className="desktopWallBar">
              <strong>{focusedPeer ? (zh ? '放大画面' : 'Focused video') : (zh ? '局域网监控墙' : 'LAN monitor wall')}</strong>
              <span>{zh ? `${views.length} 个共享画面` : `${views.length} shared desktop${views.length === 1 ? '' : 's'}`}</span>
              {composer}
              <button type="button" onClick={() => { if (focusedPeer) setFocusedPeer(null); else setWallOpen(false); }}>
                {focusedPeer ? (zh ? '返回全览' : 'Back to grid') : (zh ? '关闭监控墙' : 'Close wall')}
              </button>
            </div> : null}
            {views.filter((view) => !focusedPeer || view.peer === focusedPeer).map((view) => {
              const name = room.members.find((m) => m.peer === view.peer)?.name ?? (zh ? '成员' : 'Member');
              return <DesktopTile key={view.peer} view={view} name={name} send={send} expanded={focusedPeer === view.peer}
                onSend={(target, marker, x, y) => controller.current?.sendAt(target, marker, x, y)}
                onToggle={() => { setWallOpen(true); setFocusedPeer(focusedPeer === view.peer ? null : view.peer); }} />;
            })}
          </div>
        </>
      ) : <span className="desc">{zh ? '同一局域网的成员开始共享后，画面会显示在这里。' : 'A member’s desktop appears here when they start sharing on your LAN.'}</span>}
    </div>
  );
}

export function RoomSection({ settings: s, update }: { settings: Settings; update: Update }) {
  const t = useText();
  const room = useRoomState();
  if (!room) return null;
  return (
    <>
      <NameRow value={s.displayName} onSave={(displayName) => void update({ displayName })} />
      <SettingRow icon={<Color24Regular />} title={t.roomColor}>
        <div className="swatches" role="radiogroup" aria-label={t.roomColor}>
          {TAG_COLORS.map((c, i) => (
            <button key={c} type="button" role="radio" aria-checked={s.tagColor === i} aria-label={t.roomColorLabel(i + 1)}
              className={`swatch${s.tagColor === i ? ' sel' : ''}`} style={{ background: c }} onClick={() => void update({ tagColor: i })} />
          ))}
        </div>
      </SettingRow>
      {room.phase === 'idle' ? <JoinCard /> : <InRoom room={room} settings={s} update={update} />}
      <SwitchRow icon={<SpeakerMute24Regular />} title={t.roomMute} description={t.roomMuteDesc}
        checked={s.roomMuted} onChange={(v) => void update({ roomMuted: v })} />
      <SettingRow icon={<TopSpeed24Regular />} title={t.roomLimit} description={t.roomLimitDesc} dim={s.roomMuted}>
        <Slider min={1} max={LIMIT_MAX + 1} step={1} value={toSlider(s.incomingPingLimit)} style={{ width: 200 }}
          onChange={(_, d) => void update({ incomingPingLimit: fromSlider(d.value) })} />
        <span className="value">{t.roomLimitValue(s.incomingPingLimit)}</span>
      </SettingRow>
      <SwitchRow icon={<Globe24Regular />} title={t.roomInternet} description={t.roomInternetDesc}
        checked={s.allowInternet} onChange={(v) => void update({ allowInternet: v })} />
      <SwitchRow icon={<ArrowSync24Regular />} title={t.roomRejoin} checked={s.rejoinRoom} onChange={(v) => void update({ rejoinRoom: v })} />
      <SettingRow icon={<Desktop24Regular />} title={t.roomDisplays} description={t.roomDisplaysDesc}>
        <span className="displays">
          {room.displays.map((d) => (
            <span key={d.number}>#{d.number}{d.primary ? ` ${t.roomPrimary}` : ''} · {d.width}×{d.height}</span>
          ))}
        </span>
      </SettingRow>
      <p className="desc roomNote">{t.roomPrivacy} {t.roomHelp}</p>
    </>
  );
}
