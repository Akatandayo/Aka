import { useRef, useState, type ReactNode } from 'react';
import { ScreenFrame } from '../../components/layout/ScreenFrame';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { exportFileName, exportSaveText, parseSaveText } from '../../core/save/storage';
import { SAVE_VERSION } from '../../core/save/schema';
import { usePlayer } from '../../state/GameProvider';
import type { PlayerSave } from '../../types/player';
import './SettingsScreen.css';

type Pending = { kind: 'import'; text: string; preview: PlayerSave; issues: string[] } | { kind: 'reset' } | null;

export function SettingsScreen() {
  const toast = useToast();
  const { save, data, dispatch, saveStatus, saveNow, importSave, resetSave } = usePlayer();
  const [pending, setPending] = useState<Pending>(null);
  const [resetText, setResetText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const s = save.settings;

  const doExport = () => {
    const blob = new Blob([exportSaveText(save)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportFileName(save);
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.push({ tone: 'success', title: 'セーブデータを書き出しました', body: a.download });
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.push({ tone: 'error', title: 'ファイルが大きすぎます（5MBまで）' });
      return;
    }
    const text = await file.text();
    const r = parseSaveText(text, data);
    if (!r.ok) {
      toast.push({ tone: 'error', title: 'セーブデータを読み込めません', body: r.error });
      return;
    }
    setPending({ kind: 'import', text, preview: r.save, issues: r.issues });
  };

  return (
    <ScreenFrame code="08" title="SETTINGS" subtitle="設定">
      <div className="settings">
        <Section title="DISPLAY" ja="演出">
          <Row label="演出の強さ" desc="軽量にすると、アニメーション・グリッチ・背景エフェクトを抑えます。">
            <div className="segmented" role="radiogroup" aria-label="演出の強さ">
              {(['full', 'reduced'] as const).map((v) => (
                <button key={v} type="button" role="radio" aria-checked={s.fx === v} className="segmented__item" onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { fx: v } })}>
                  {v === 'full' ? '標準' : '軽量'}
                </button>
              ))}
            </div>
          </Row>
          <Row label="起動演出をスキップ" desc="次回起動時、ブートシーケンスを省略してタイトルを表示します。">
            <button type="button" role="switch" aria-checked={s.skipBoot} aria-label="起動演出をスキップ" className="switch" onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { skipBoot: !s.skipBoot } })} />
          </Row>
        </Section>

        <Section title="TEXT & SOUND" ja="テキスト・サウンド" planned="PHASE 3">
          <p className="notice notice--planned">テキスト速度・BGM・SEは、ストーリーエンジンとサウンドを実装する PHASE 3 で有効になります。現在は変更できません。</p>
          <Row label="テキスト速度" desc="ストーリーの文字送り速度">
            <input type="range" min={1} max={5} value={s.textSpeed} disabled aria-label="テキスト速度（未実装）" />
          </Row>
          <Row label="BGM 音量">
            <input type="range" min={0} max={100} value={Math.round(s.bgmVolume * 100)} disabled aria-label="BGM音量（未実装）" />
          </Row>
          <Row label="SE 音量">
            <input type="range" min={0} max={100} value={Math.round(s.seVolume * 100)} disabled aria-label="SE音量（未実装）" />
          </Row>
        </Section>

        <Section title="SAVE DATA" ja="セーブデータ">
          <dl className="settings__status">
            <div>
              <dt>保存先</dt>
              <dd>{saveStatus.storage === 'local' ? 'このブラウザ（localStorage）' : 'メモリ上のみ（タブを閉じると消えます）'}</dd>
            </div>
            <div>
              <dt>最終保存</dt>
              <dd>{saveStatus.lastSavedAt ? new Date(saveStatus.lastSavedAt).toLocaleString('ja-JP') : '—'}</dd>
            </div>
            <div>
              <dt>データ形式</dt>
              <dd className="mono">v{SAVE_VERSION}</dd>
            </div>
          </dl>
          {saveStatus.error && <p className="notice notice--error">{saveStatus.error}</p>}
          <p className="dim settings__note">進行状況は変更のたびに自動保存されます。端末の変更やブラウザのデータ削除に備えて、書き出し（エクスポート）でバックアップできます。</p>
          <div className="settings__buttons">
            <button type="button" className="btn btn--sm" onClick={() => toast.push(saveNow() ? { tone: 'success', title: '保存しました' } : { tone: 'error', title: '保存に失敗しました', body: saveStatus.error ?? undefined })}>
              今すぐ保存
            </button>
            <button type="button" className="btn btn--sm" onClick={doExport}>
              書き出し（JSON）
            </button>
            <button type="button" className="btn btn--sm" onClick={() => fileRef.current?.click()}>
              読み込み
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                void onFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <button type="button" className="btn btn--sm btn--danger" onClick={() => setPending({ kind: 'reset' })}>
              データを初期化
            </button>
          </div>
        </Section>

        <Section title="DEVELOPER" ja="開発者モード">
          <Row label="開発者モード" desc="育成・入手システム（PHASE 2以降）が実装されるまでの動作確認用ツールを表示します。">
            <button type="button" role="switch" aria-checked={s.devMode} aria-label="開発者モード" className="switch" onClick={() => dispatch({ type: 'UPDATE_SETTINGS', patch: { devMode: !s.devMode } })} />
          </Row>
          {s.devMode && (
            <div className="settings__dev">
              <p className="notice notice--warn">DEV: 以下の操作は正規のゲーム進行ではありません。セーブデータに直接反映されます。</p>
              <div className="settings__buttons">
                <button
                  type="button"
                  className="btn btn--sm btn--purple"
                  onClick={() => {
                    dispatch({ type: 'DEV_GRANT_ALL', at: new Date().toISOString() });
                    toast.push({ tone: 'info', title: 'DEV: 未所持のMemoryをすべて付与しました' });
                  }}
                >
                  全Memoryを付与
                </button>
                <button
                  type="button"
                  className="btn btn--sm btn--purple"
                  onClick={() => {
                    dispatch({ type: 'DEV_MAX_LEVEL' });
                    toast.push({ tone: 'info', title: 'DEV: 所持Memoryを最大レベルにしました' });
                  }}
                >
                  所持Memoryを最大Lvに
                </button>
                <button
                  type="button"
                  className="btn btn--sm btn--purple"
                  onClick={() => {
                    dispatch({ type: 'DEV_ADD_CURRENCY', at: new Date().toISOString() });
                    toast.push({ tone: 'info', title: 'DEV: 通貨を付与しました' });
                  }}
                >
                  通貨を付与
                </button>
              </div>
              <p className="mute settings__note">
                マスターデータ: Memory {data.memories.length} / Skill {data.skillById.size} / 記録 {data.storyById.size} / WORLD {data.worlds.length}
                {data.issues.length > 0 && <strong className="settings__issue"> · 問題 {data.issues.length} 件</strong>}
              </p>
            </div>
          )}
        </Section>

        <p className="settings__about mono">NETWORK - Memory: Re:Collection · v0.1.0 · PHASE 1</p>
      </div>

      <ConfirmDialog
        open={pending?.kind === 'import'}
        title="セーブデータを読み込みますか？"
        confirmLabel="読み込む"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending?.kind !== 'import') return;
          const r = importSave(pending.text);
          setPending(null);
          if (r.ok) toast.push({ tone: 'success', title: 'セーブデータを読み込みました', body: r.issues.length ? `修復: ${r.issues.join(' / ')}` : undefined });
          else toast.push({ tone: 'error', title: '読み込みに失敗しました', body: r.error });
        }}
      >
        {pending?.kind === 'import' && (
          <>
            <p>現在のデータは上書きされます。必要なら先に書き出してください。</p>
            <dl className="settings__preview">
              <dt>探索者</dt>
              <dd>
                {pending.preview.profile.name} <span className="mono mute">{pending.preview.profile.playerId}</span>
              </dd>
              <dt>所持Memory</dt>
              <dd>{pending.preview.memories.length} 件</dd>
              <dt>最終更新</dt>
              <dd>{new Date(pending.preview.updatedAt).toLocaleString('ja-JP')}</dd>
            </dl>
            {pending.issues.length > 0 && <p className="notice notice--warn">読み込み時に修復される項目: {pending.issues.join(' / ')}</p>}
          </>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={pending?.kind === 'reset'}
        title="セーブデータを初期化しますか？"
        danger
        confirmLabel="初期化する"
        confirmDisabled={resetText !== 'RESET'}
        onCancel={() => {
          setPending(null);
          setResetText('');
        }}
        onConfirm={() => {
          setPending(null);
          setResetText('');
          resetSave();
        }}
      >
        <p>所持Memory・編成・通貨・記録の閲覧状況がすべて削除され、元に戻せません。</p>
        <label className="field">
          <span className="field__label">確認のため RESET と入力</span>
          <input className="input" value={resetText} onChange={(e) => setResetText(e.target.value)} autoComplete="off" />
        </label>
      </ConfirmDialog>
    </ScreenFrame>
  );
}

function Section({ title, ja, planned, children }: { title: string; ja: string; planned?: string; children: ReactNode }) {
  return (
    <section className="panel settings__section">
      <div className="panel__title">
        <span>{title}</span>
        <small>
          {ja}
          {planned && (
            <span className="tag tag--planned" style={{ marginLeft: 8 }}>
              未実装 · {planned}
            </span>
          )}
        </small>
      </div>
      <div className="settings__rows">{children}</div>
    </section>
  );
}

function Row({ label, desc, children }: { label: string; desc?: string; children: ReactNode }) {
  return (
    <div className="settings__row">
      <div className="settings__row-text">
        <span className="settings__row-label">{label}</span>
        {desc && <span className="settings__row-desc">{desc}</span>}
      </div>
      <div className="settings__row-control">{children}</div>
    </div>
  );
}
