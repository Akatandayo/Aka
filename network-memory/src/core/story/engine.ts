import { evaluateAll, type ConditionContext } from '../conditions';
import type { StagePosition, StoryChapter, StoryCommand, StoryFx } from '../../types/story';

/**
 * STORY ENGINE（GDD Ver.3 §8）
 * シナリオ（命令列）を解釈する純粋な状態機械。UI は StoryRun.view を描画し、advance() を呼ぶだけ。
 * 表示を止めない命令（背景・BGM・立ち絵・分岐・フラグ等）はまとめて処理し、
 * 台詞・地の文・タイトル・選択肢・待機・終了で止まる。
 */

export type FlagValue = boolean | number | string;

export interface StageCharacter {
  char: string;
  pos: StagePosition;
  expr: string;
}

export type StoryLine =
  | { kind: 'say'; char: string; text: string }
  | { kind: 'narr'; text: string }
  | { kind: 'title'; text: string; sub?: string };

export interface StoryView {
  bg: string | null;
  bgFx: 'fade' | 'cut';
  bgm: string | null;
  stage: StageCharacter[];
  line: StoryLine | null;
  choice: { id: string; options: { value: string; text: string }[] } | null;
  wait: number | null;
}

export interface StoryRun {
  chapterId: string;
  /** 現在止まっている命令の位置 */
  pc: number;
  view: StoryView;
  /** この章で立てたフラグ */
  flags: Record<string, FlagValue>;
  /** この章で検出した Memory */
  detected: string[];
  /** この章で選んだ選択肢（選択肢 ID → 値） */
  choices: Record<string, string>;
  /** 直前の advance で発生した一過性の演出（UI が再生する） */
  effects: { se: string[]; fx: { type: StoryFx; ms: number }[] };
  ended: boolean;
}

const EMPTY_VIEW: StoryView = { bg: null, bgFx: 'cut', bgm: null, stage: [], line: null, choice: null, wait: null };

function labelIndex(ch: StoryChapter, label: string): number {
  const i = ch.script.findIndex((c) => c.t === 'label' && c.id === label);
  if (i < 0) throw new Error(`label not found: ${label}`);
  return i;
}

function withFlags(ctx: ConditionContext, flags: Record<string, FlagValue>): ConditionContext {
  if (!Object.keys(flags).length) return ctx;
  return { ...ctx, save: { ...ctx.save, progress: { ...ctx.save.progress, flags: { ...ctx.save.progress.flags, ...flags } } } };
}

/** pc から、表示を止める命令に到達するまで進める */
function runFrom(ch: StoryChapter, run: StoryRun, start: number, ctx: ConditionContext): StoryRun {
  let pc = start;
  const view: StoryView = { ...run.view, stage: run.view.stage.map((s) => ({ ...s })), choice: null, wait: null };
  const flags = { ...run.flags };
  const detected = [...run.detected];
  const effects: StoryRun['effects'] = { se: [], fx: [] };
  for (let guard = 0; guard < 10000; guard++) {
    const cmd: StoryCommand | undefined = ch.script[pc];
    if (!cmd) return { ...run, pc, view: { ...view, line: null }, flags, detected, effects, ended: true };
    switch (cmd.t) {
      case 'bg':
        view.bg = cmd.id;
        view.bgFx = cmd.fx ?? 'fade';
        pc++;
        break;
      case 'bgm':
        view.bgm = cmd.id;
        pc++;
        break;
      case 'se':
        effects.se.push(cmd.id);
        pc++;
        break;
      case 'show': {
        const existing = view.stage.find((s) => s.char === cmd.char);
        if (existing) {
          existing.pos = cmd.pos ?? existing.pos;
          existing.expr = cmd.expr ?? existing.expr;
        } else {
          view.stage = view.stage.filter((s) => s.pos !== (cmd.pos ?? 'center'));
          view.stage.push({ char: cmd.char, pos: cmd.pos ?? 'center', expr: cmd.expr ?? 'normal' });
        }
        pc++;
        break;
      }
      case 'hide':
        view.stage = view.stage.filter((s) => s.char !== cmd.char);
        pc++;
        break;
      case 'fx':
        effects.fx.push({ type: cmd.type, ms: cmd.ms ?? 600 });
        pc++;
        break;
      case 'label':
        pc++;
        break;
      case 'goto':
        pc = labelIndex(ch, cmd.label) + 1;
        break;
      case 'if':
        if (evaluateAll(cmd.cond, withFlags(ctx, flags))) pc = labelIndex(ch, cmd.goto) + 1;
        else if (cmd.else) pc = labelIndex(ch, cmd.else) + 1;
        else pc++;
        break;
      case 'set':
        flags[cmd.flag] = cmd.value;
        pc++;
        break;
      case 'detect':
        if (!detected.includes(cmd.memoryId)) detected.push(cmd.memoryId);
        pc++;
        break;
      case 'say': {
        const s = view.stage.find((x) => x.char === cmd.char);
        if (s && cmd.expr) s.expr = cmd.expr;
        return { ...run, pc, view: { ...view, line: { kind: 'say', char: cmd.char, text: cmd.text } }, flags, detected, effects, ended: false };
      }
      case 'narr':
        return { ...run, pc, view: { ...view, line: { kind: 'narr', text: cmd.text } }, flags, detected, effects, ended: false };
      case 'title':
        return { ...run, pc, view: { ...view, line: { kind: 'title', text: cmd.text, sub: cmd.sub } }, flags, detected, effects, ended: false };
      case 'choice':
        return {
          ...run,
          pc,
          view: { ...view, choice: { id: cmd.id, options: cmd.options.map((o) => ({ value: o.value, text: o.text })) } },
          flags,
          detected,
          effects,
          ended: false,
        };
      case 'wait':
        return { ...run, pc, view: { ...view, line: null, wait: cmd.ms }, flags, detected, effects, ended: false };
      case 'end':
        return { ...run, pc, view: { ...view, line: null }, flags, detected, effects, ended: true };
    }
  }
  throw new Error('story loop guard exceeded');
}

export function startChapter(ch: StoryChapter, ctx: ConditionContext): StoryRun {
  const run: StoryRun = { chapterId: ch.id, pc: 0, view: EMPTY_VIEW, flags: {}, detected: [], choices: {}, effects: { se: [], fx: [] }, ended: false };
  return runFrom(ch, run, 0, ctx);
}

/** 次へ進める。選択肢で止まっている場合は choice（選んだ値）が必要 */
export function advance(ch: StoryChapter, run: StoryRun, ctx: ConditionContext, choice?: string): StoryRun {
  if (run.ended) return run;
  const cmd = ch.script[run.pc];
  if (cmd?.t === 'choice') {
    const opt = cmd.options.find((o) => o.value === choice);
    if (!opt) return run;
    const flags = { ...run.flags, ...(opt.set ?? {}) };
    const next = { ...run, flags, choices: { ...run.choices, [cmd.id]: opt.value } };
    return runFrom(ch, next, opt.goto ? labelIndex(ch, opt.goto) + 1 : run.pc + 1, ctx);
  }
  return runFrom(ch, run, run.pc + 1, ctx);
}

/** 中断位置からの再開: 先頭から（記録済みの選択を使って）早送りする */
export function resumeChapter(ch: StoryChapter, ctx: ConditionContext, targetPc: number, choices: Record<string, string>): StoryRun {
  let run = startChapter(ch, ctx);
  for (let guard = 0; guard < 5000 && !run.ended && run.pc < targetPc; guard++) {
    const cmd = ch.script[run.pc];
    if (cmd?.t === 'choice') {
      const value = choices[cmd.id];
      if (!value) break;
      run = advance(ch, run, ctx, value);
    } else run = advance(ch, run, ctx);
  }
  return { ...run, effects: { se: [], fx: [] } };
}

/** 文中の {player} を主人公の名前に置き換える */
export function fillText(text: string, playerName: string): string {
  return text.replace(/\{player\}/g, playerName);
}
