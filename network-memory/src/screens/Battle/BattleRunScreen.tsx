import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { audio } from '../../audio/audio';
import { useNav } from '../../app/nav';
import { EnemyArt } from '../../components/battle/EnemyArt';
import { ExplorerAvatar } from '../../components/battle/ExplorerAvatar';
import { ScreenFrame } from '../../components/layout/ScreenFrame';
import { AttributeTag } from '../../components/memory/Badges';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { ATTRIBUTE_META, STAT_META, STATUS_META, TARGET_LABEL } from '../../core/constants';
import { chooseAutoCommand } from '../../core/battle/autoplay';
import { rewriteAvailability, skillAvailability, startBattle, submitCommand, usableItems } from '../../core/battle/engine';
import { applyBattleOutcome, outcomeFromState, type BattleSummary } from '../../core/battle/result';
import { createSeed } from '../../core/battle/rng';
import { createBattleSetup } from '../../core/battle/setup';
import type { BattleCommand, BattleEvent, BattleState, StepResult, UnitSnapshot } from '../../core/battle/types';
import type { GameData } from '../../core/data/gameData';
import { usePlayer } from '../../state/GameProvider';
import { useSessionState } from '../../state/sessionState';
import type { SkillTarget } from '../../types/skill';
import { BattleResultPanel } from './BattleResultPanel';
import './Battle.css';

type Menu = 'main' | 'skill' | 'item';

const BASE_DELAY: Partial<Record<BattleEvent['kind'], number>> = {
  start: 900,
  round: 450,
  action: 480,
  damage: 560,
  heal: 460,
  status: 460,
  resist: 380,
  modifier: 420,
  down: 700,
  endure: 700,
  skip: 520,
  rewrite: 1900,
  info: 420,
  end: 700,
};

const needsSingleTarget = (t: SkillTarget | undefined) => !t || t === 'enemy_single';

type Session = { ok: false; error: string } | { ok: true; loadoutId: string; step: StepResult };

export function BattleRunScreen({ encounterId }: { encounterId: string }) {
  const nav = useNav();
  const { save, data, dispatch } = usePlayer();
  const saveRef = useRef(save);
  saveRef.current = save;
  const enc = data.encounterById.get(encounterId);

  const init = useCallback((): Session => {
    const r = createBattleSetup(saveRef.current, data, encounterId, createSeed());
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, loadoutId: r.loadoutId, step: startBattle(r.setup, data) };
  }, [data, encounterId]);

  const [session, setSession] = useState<Session>(init);
  const [step, setStep] = useState<StepResult | null>(session.ok ? session.step : null);
  const [queue, setQueue] = useState<BattleEvent[]>(session.ok ? session.step.events : []);
  const [shown, setShown] = useState<UnitSnapshot[]>([]);
  const [current, setCurrent] = useState<{ ev: BattleEvent; n: number } | null>(null);
  const [log, setLog] = useState<{ ev: BattleEvent; n: number }[]>([]);
  const [menu, setMenu] = useState<Menu>('main');
  const [targeting, setTargeting] = useState<BattleCommand | null>(null);
  const [rewriteFx, setRewriteFx] = useState<BattleEvent | null>(null);
  const [result, setResult] = useState<BattleSummary | null>(null);
  const [confirmRetreat, setConfirmRetreat] = useState(false);
  /** 再生中のラウンド（最終 state ではなく、表示中のイベントに追従させる） */
  const [shownRound, setShownRound] = useState(0);
  const [auto, setAuto] = useSessionState<boolean>('battle.auto', false);
  const [fast, setFast] = useSessionState<boolean>('battle.fast', false);
  const counter = useRef(0);
  const processed = useRef<BattleEvent | null>(null);
  const committed = useRef(false);
  const lastTarget = useRef<string | undefined>(undefined);

  const state: BattleState | null = step?.state ?? null;
  const idle = queue.length === 0;
  const awaiting = idle && state?.phase === 'awaiting_input';
  const loadoutId = session.ok ? session.loadoutId : '';

  // ---- イベントの段階的な再生
  useEffect(() => {
    if (queue.length === 0) return;
    const ev = queue[0];
    if (processed.current !== ev) {
      processed.current = ev;
      counter.current++;
      const n = counter.current;
      setCurrent({ ev, n });
      setShown(ev.snapshot);
      setLog((l) => [...l.slice(-30), { ev, n }]);
      if (ev.kind === 'rewrite') setRewriteFx(ev);
      if (ev.kind === 'rewrite') audio.playSe('rewrite');
      else if (ev.kind === 'damage') audio.playSe('hit');
      if (ev.kind === 'round') setShownRound(Number(ev.text.match(/\d+/)?.[0] ?? 0));
    }
    const reduced = document.documentElement.dataset.fx === 'reduced';
    const base = BASE_DELAY[ev.kind] ?? 400;
    const delay = ev.kind === 'rewrite' ? base * (fast ? 0.6 : 1) : base / (fast ? 2.6 : 1) / (reduced ? 1.5 : 1);
    const t = window.setTimeout(() => {
      if (ev.kind === 'rewrite') setRewriteFx(null);
      setQueue((q) => (q[0] === ev ? q.slice(1) : q));
    }, delay);
    return () => window.clearTimeout(t);
  }, [queue, fast]);

  // ---- 終了時に結果を反映（1 回だけ）
  useEffect(() => {
    if (!state || !idle || committed.current) return;
    if (state.phase !== 'victory' && state.phase !== 'defeat' && state.phase !== 'retreat') return;
    committed.current = true;
    const outcome = outcomeFromState(state, loadoutId);
    const at = new Date().toISOString();
    const { summary } = applyBattleOutcome(saveRef.current, data, outcome, at);
    dispatch({ type: 'COMMIT_BATTLE', outcome, at });
    setResult(summary);
  }, [state, idle, loadoutId, data, dispatch]);

  // ---- 途中で画面を離れた場合は撤退として記録（使用したアイテムを正しく消費させる）
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(
    () => () => {
      const s = stateRef.current;
      if (!s || committed.current || s.commands.length === 0) return;
      if (s.phase === 'victory' || s.phase === 'defeat' || s.phase === 'retreat') return;
      committed.current = true;
      dispatch({ type: 'COMMIT_BATTLE', outcome: { ...outcomeFromState({ ...s, phase: 'retreat' }, loadoutId), result: 'retreat' }, at: new Date().toISOString() });
    },
    [dispatch, loadoutId],
  );

  const submit = useCallback(
    (cmd: BattleCommand) => {
      if (!state || state.phase !== 'awaiting_input') return;
      try {
        const next = submitCommand(state, cmd, data);
        if ('target' in cmd && cmd.target) lastTarget.current = cmd.target;
        setStep(next);
        setQueue(next.events);
        setMenu('main');
        setTargeting(null);
      } catch (e) {
        console.warn('[NETWORK] command rejected', e);
      }
    },
    [state, data],
  );

  // ---- AUTO
  useEffect(() => {
    if (!auto || !awaiting || !state) return;
    const t = window.setTimeout(() => submit(chooseAutoCommand(state, data)), fast ? 150 : 350);
    return () => window.clearTimeout(t);
  }, [auto, awaiting, state, data, submit, fast]);

  const restart = () => {
    const s = init();
    committed.current = false;
    processed.current = null;
    setSession(s);
    setStep(s.ok ? s.step : null);
    setQueue(s.ok ? s.step.events : []);
    setShown([]);
    setLog([]);
    setShownRound(0);
    setResult(null);
    setMenu('main');
    setTargeting(null);
  };

  const units = state?.units ?? [];
  // 再生中はイベント時点のスナップショット、再生が終わったら最新の state を表示する
  const snap = useMemo(() => new Map((!idle && shown.length ? shown : units.map(toSnap)).map((s) => [s.uid, s])), [idle, shown, units]);
  const enemies = units.filter((u) => u.side === 'enemy');
  const player = units.find((u) => u.side === 'player');
  const ps = player ? snap.get(player.uid) : undefined;

  if (!enc || !session.ok || !state || !player || !ps) {
    return (
      <ScreenFrame code="05" title="BATTLE" subtitle="接続エラー" back={{ route: { name: 'battle' }, label: 'SIGNALS' }}>
        <div className="panel empty">
          <p>{!session.ok ? session.error : '流出反応が見つかりません。'}</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn--sm" onClick={() => nav({ name: 'battle' })}>
              一覧に戻る
            </button>
            <button type="button" className="btn btn--sm" onClick={() => nav({ name: 'memory', tab: 'loadout' })}>
              装備を確認
            </button>
          </div>
        </div>
      </ScreenFrame>
    );
  }

  const skills = skillAvailability(state, data);
  const mainMemoryId = state.rewrite.memoryId ?? skills[0]?.sourceMemoryId ?? null;
  const items = usableItems(state, data);
  const rw = rewriteAvailability(state, data);
  const livingEnemies = enemies.filter((e) => snap.get(e.uid)?.alive);
  const cur = current?.ev;
  const hitOn = (uid: string) => cur && (cur.kind === 'damage' || cur.kind === 'nullify') && cur.target === uid;
  const popFor = (uid: string) =>
    cur && cur.target === uid && (cur.kind === 'damage' || cur.kind === 'heal' || cur.kind === 'nullify' || cur.kind === 'status' || cur.kind === 'resist') ? cur : null;

  const choose = (cmd: BattleCommand, target: SkillTarget | undefined) => {
    if (needsSingleTarget(target) && livingEnemies.length > 1) {
      setTargeting(cmd);
      return;
    }
    const t = livingEnemies.find((e) => e.uid === lastTarget.current)?.uid ?? livingEnemies[0]?.uid;
    submit({ ...cmd, target: t } as BattleCommand);
  };

  const pickTarget = (uid: string) => {
    if (!targeting || !snap.get(uid)?.alive) return;
    submit({ ...targeting, target: uid } as BattleCommand);
  };

  const attrColor = ATTRIBUTE_META[ps.attribute].color;
  const gauge = !idle && current ? current.ev.gauge : state.rewrite.gauge;

  return (
    <ScreenFrame code="05" title="BATTLE" subtitle={enc.name} back={{ route: { name: 'battle' }, label: 'SIGNALS' }}>
      <div className={`bt ${enc.boss ? 'bt--boss' : ''}`} style={{ ['--p-c' as string]: attrColor } as CSSProperties}>
        <div className="bt__hud">
          <span className="bt__round mono">ROUND {shownRound || state.round}</span>
          <div className="bt__hud-actions">
            <button type="button" className="btn btn--sm btn--ghost" aria-pressed={auto} onClick={() => setAuto(!auto)} style={auto ? ({ ['--btn-c' as string]: 'var(--c-purple)' } as CSSProperties) : undefined}>
              {auto ? 'AUTO ON' : 'AUTO'}
            </button>
            <button type="button" className="btn btn--sm btn--ghost" aria-pressed={fast} onClick={() => setFast(!fast)}>
              {fast ? '▶▶ x2' : '▶ x1'}
            </button>
            <button type="button" className="btn btn--sm btn--ghost btn--danger" disabled={!awaiting} onClick={() => setConfirmRetreat(true)}>
              撤退
            </button>
          </div>
        </div>

        <div className={`bt__enemies bt__enemies--${enemies.length} ${targeting ? 'is-targeting' : ''}`}>
          {enemies.map((e) => {
            const s = snap.get(e.uid)!;
            const pop = popFor(e.uid);
            return (
              <button
                key={e.uid}
                type="button"
                className={`bt-enemy ${s.alive ? '' : 'is-down'} ${hitOn(e.uid) ? 'is-hit' : ''} ${cur?.actor === e.uid && cur.kind === 'action' ? 'is-acting' : ''} ${e.boss ? 'is-boss' : ''}`}
                onClick={() => pickTarget(e.uid)}
                disabled={!targeting || !s.alive}
                aria-label={`${e.name} HP ${s.hp}/${s.maxHp}${targeting ? '（タップで対象に選択）' : ''}`}
              >
                <div className="bt-enemy__art">
                  <EnemyArt id={e.refId} attribute={s.attribute} boss={e.boss} />
                  {pop && <Pop key={current!.n} ev={pop} />}
                </div>
                <div className="bt-enemy__info">
                  <span className="bt-enemy__name">{e.name}</span>
                  <span className="bt-enemy__meta">
                    <AttributeTag attribute={s.attribute} /> <span className="mono mute">Lv.{e.level}</span>
                  </span>
                  <Bar value={s.hp} max={s.maxHp} kind="hp" />
                  <Effects s={s} />
                </div>
              </button>
            );
          })}
        </div>

        <div className="bt__log" aria-live="polite">
          {log.slice(-4).map(({ ev, n }) => (
            <p key={n} className={`bt__log-line is-${ev.kind} ${n === current?.n && queue.length ? 'is-current' : ''}`}>
              {ev.text}
            </p>
          ))}
        </div>

        <div className={`bt__player ${hitOn(player.uid) ? 'is-hit' : ''}`}>
          <div className="bt__player-avatar">
            <ExplorerAvatar color={save.profile.avatar.color} syncColor={attrColor} animated />
            {popFor(player.uid) && <Pop key={current!.n} ev={popFor(player.uid)!} />}
          </div>
          <div className="bt__player-info">
            <p className="bt__player-name">
              {player.name} <span className="mono mute">Lv.{player.level}</span> <AttributeTag attribute={ps.attribute} />
              {ps.defending && <span className="tag">DEFEND</span>}
            </p>
            <Bar value={ps.hp} max={ps.maxHp} kind="hp" label="HP" />
            <Bar value={ps.energy} max={ps.maxEnergy} kind="sp" label="SE" />
            <div className={`bt-gauge ${gauge >= 100 ? 'is-full' : ''}`} aria-label={`REWRITE GAUGE ${Math.floor(gauge)}%`}>
              <span className="bt-gauge__label mono">REWRITE</span>
              <div className="bt-gauge__track">
                <div className="bt-gauge__fill" style={{ width: `${Math.min(100, gauge)}%` }} />
              </div>
              <span className="bt-gauge__num mono">{Math.floor(gauge)}%</span>
            </div>
            <Effects s={ps} />
            <p className={`bt__rw mono ${rw.usable ? 'is-ready' : ''}`}>
              {rw.skill ? (rw.usable ? `REWRITE READY — ${rw.skill.name}` : `REWRITE: ${rw.skill.name}`) : 'REWRITE: なし'}
            </p>
          </div>
        </div>

        <div className="bt__commands">
          {result ? null : targeting ? (
            <div className="bt__targeting">
              <p>攻撃する対象をタップしてください</p>
              <button type="button" className="btn btn--sm btn--ghost" onClick={() => setTargeting(null)}>
                キャンセル
              </button>
            </div>
          ) : menu === 'skill' ? (
            <div className="bt__submenu">
              <div className="bt__submenu-head">
                <span className="mono">SKILL — SYNC ENERGY {ps.energy}</span>
                <button type="button" className="btn btn--sm btn--ghost" onClick={() => setMenu('main')}>
                  戻る
                </button>
              </div>
              <div className="bt__skill-list">
                {skills.map((s) => (
                  <button
                    key={s.skill.id}
                    type="button"
                    className="bt-skill"
                    disabled={!awaiting || !s.usable}
                    style={{ ['--s-c' as string]: s.skill.attribute ? ATTRIBUTE_META[s.skill.attribute].color : 'var(--c-cyan)' } as CSSProperties}
                    onClick={() => choose({ type: 'skill', skillId: s.skill.id }, s.skill.target)}
                  >
                    <span className="bt-skill__name">{s.skill.name}</span>
                    <span className="bt-skill__cost mono">
                      SE {s.cost}
                      {s.reason && <em> · {s.reason}</em>}
                    </span>
                    <span className="bt-skill__desc">{s.skill.description}</span>
                    <span className="bt-skill__src">
                      {s.sourceMemoryId ? `${data.memoryById.get(s.sourceMemoryId)?.name}${s.sourceMemoryId === mainMemoryId ? '（完全同期）' : '（補助）'}` : 'REWRITE解放'} · {TARGET_LABEL[s.skill.target ?? 'enemy_single']}
                    </span>
                  </button>
                ))}
                {skills.length === 0 && <p className="mute">使えるスキルがありません。</p>}
              </div>
            </div>
          ) : menu === 'item' ? (
            <div className="bt__submenu">
              <div className="bt__submenu-head">
                <span className="mono">ITEM</span>
                <button type="button" className="btn btn--sm btn--ghost" onClick={() => setMenu('main')}>
                  戻る
                </button>
              </div>
              <div className="bt__skill-list">
                {items.map(({ item, count }) => (
                  <button key={item.id} type="button" className="bt-skill" disabled={!awaiting} onClick={() => submit({ type: 'item', itemId: item.id })}>
                    <span className="bt-skill__name">{item.name}</span>
                    <span className="bt-skill__cost mono">×{count}</span>
                    <span className="bt-skill__desc">{item.description}</span>
                  </button>
                ))}
                {items.length === 0 && <p className="mute">使えるアイテムを持っていません。</p>}
              </div>
            </div>
          ) : (
            <div className="bt__main-cmds">
              <button type="button" className="bt-cmd bt-cmd--attack" disabled={!awaiting} onClick={() => choose({ type: 'attack' }, 'enemy_single')}>
                <span className="mono">ATTACK</span>
                <small>{player.attack.name}</small>
              </button>
              <button type="button" className="bt-cmd bt-cmd--defend" disabled={!awaiting} onClick={() => submit({ type: 'defend' })}>
                <span className="mono">DEFEND</span>
                <small>被ダメ半減・SE回復</small>
              </button>
              <button type="button" className="bt-cmd bt-cmd--skill" disabled={!awaiting} onClick={() => setMenu('skill')}>
                <span className="mono">SKILL</span>
                <small>{skills.filter((s) => s.usable).length} / {skills.length} 使用可</small>
              </button>
              <button type="button" className="bt-cmd bt-cmd--item" disabled={!awaiting} onClick={() => setMenu('item')}>
                <span className="mono">ITEM</span>
                <small>{items.reduce((n, i) => n + i.count, 0)} 個</small>
              </button>
              <button
                type="button"
                className={`bt-cmd bt-cmd--rewrite ${rw.usable ? 'is-ready' : ''}`}
                disabled={!awaiting || !rw.usable}
                onClick={() => rw.skill && choose({ type: 'rewrite' }, rw.skill.target)}
                title={rw.reason ?? undefined}
              >
                <span className="mono">REWRITE</span>
                <small>{rw.usable ? 'READY' : (rw.reason ?? '')}</small>
              </button>
            </div>
          )}
          {!awaiting && !result && !targeting && <p className="bt__wait mono">{state.phase === 'awaiting_input' ? 'PROCESSING…' : ''}</p>}
        </div>

        {rewriteFx && <RewriteOverlay ev={rewriteFx} data={data} />}
      </div>

      {result && (
        <BattleResultPanel
          summary={result}
          encounterName={enc.name}
          onRetry={restart}
          onExit={() => nav({ name: 'battle' })}
          onSync={(memoryId) => nav({ name: 'sync', memoryId })}
        />
      )}

      <ConfirmDialog
        open={confirmRetreat}
        title="流出反応から撤退しますか？"
        confirmLabel="撤退する"
        danger
        onCancel={() => setConfirmRetreat(false)}
        onConfirm={() => {
          setConfirmRetreat(false);
          submit({ type: 'retreat' });
        }}
      >
        <p>報酬は得られません。使用したアイテムは消費されます。</p>
      </ConfirmDialog>
    </ScreenFrame>
  );
}

function RewriteOverlay({ ev, data }: { ev: BattleEvent; data: GameData }) {
  const skill = ev.skillId ? data.skillById.get(ev.skillId) : undefined;
  const d = skill?.direction;
  return (
    <div className={`rw-fx ${d?.glitch ? 'is-glitch' : ''} ${d?.shake ? 'is-shake' : ''}`} style={{ ['--rw-c' as string]: d?.color ?? 'var(--c-cyan)' } as CSSProperties} role="alert">
      <div className="rw-fx__band">
        <p className="rw-fx__label mono">REWRITE SEQUENCE</p>
        <p className="rw-fx__name">{skill?.name}</p>
        {skill?.nameEn && <p className="rw-fx__en mono">{skill.nameEn}</p>}
        {d?.cutin && <p className="rw-fx__cutin">「{d.cutin}」</p>}
      </div>
    </div>
  );
}

function toSnap(u: BattleState['units'][number]): UnitSnapshot {
  return {
    uid: u.uid,
    hp: u.hp,
    maxHp: u.maxHp,
    energy: u.energy,
    maxEnergy: u.maxEnergy,
    alive: u.alive,
    defending: u.defending,
    attribute: u.attribute,
    statuses: u.statuses.map((s) => ({ id: s.id, turns: s.turns })),
    modifiers: u.modifiers.map((m) => ({ stat: m.stat, value: m.value, turns: m.turns })),
    empowered: Boolean(u.empower),
  };
}

function Bar({ value, max, kind, label }: { value: number; max: number; kind: 'hp' | 'sp'; label?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={`bt-bar bt-bar--${kind} ${kind === 'hp' && pct <= 30 ? 'is-low' : ''}`}>
      {label && <span className="bt-bar__label mono">{label}</span>}
      <div className="bt-bar__track">
        <div className="bt-bar__fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="bt-bar__num mono">
        {value.toLocaleString('ja-JP')}
        <span className="mute">/{max.toLocaleString('ja-JP')}</span>
      </span>
    </div>
  );
}

function Effects({ s }: { s: UnitSnapshot }) {
  const ups = new Set<string>();
  const downs = new Set<string>();
  for (const m of s.modifiers) (m.value > 0 ? ups : downs).add(STAT_META[m.stat].label);
  if (!s.statuses.length && !ups.size && !downs.size && !s.empowered) return null;
  return (
    <div className="bt-effects">
      {s.statuses.map((st) => (
        <span key={st.id} className="bt-effect is-status" title={STATUS_META[st.id].description}>
          {STATUS_META[st.id].label}
          {st.id !== 'stun' && <small>{st.turns}</small>}
        </span>
      ))}
      {[...ups].map((k) => (
        <span key={`u${k}`} className="bt-effect is-up">
          {k}↑
        </span>
      ))}
      {[...downs].map((k) => (
        <span key={`d${k}`} className="bt-effect is-down">
          {k}↓
        </span>
      ))}
      {s.empowered && <span className="bt-effect is-up">強化</span>}
    </div>
  );
}

function Pop({ ev }: { ev: BattleEvent }) {
  const text =
    ev.kind === 'damage'
      ? `-${ev.amount}`
      : ev.kind === 'heal'
        ? `+${ev.amount}`
        : ev.kind === 'nullify'
          ? 'NULL'
          : ev.kind === 'resist'
            ? 'RESIST'
            : (ev.text.match(/『(.+?)』/)?.[1] ?? '');
  const cls = ev.kind === 'damage' ? (ev.crit ? 'is-crit' : ev.affinity === 'advantage' ? 'is-adv' : ev.affinity === 'disadvantage' ? 'is-dis' : '') : `is-${ev.kind}`;
  return (
    <span className={`bt-pop ${cls}`} aria-hidden>
      {text}
      {ev.kind === 'damage' && ev.affinity === 'advantage' && <small>WEAK</small>}
      {ev.kind === 'damage' && ev.crit && <small>CRITICAL</small>}
    </span>
  );
}
