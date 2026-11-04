import { ALL_ENDINGS, ENDING_EMOJI, canSecondChance } from '../core/endings';
import { ARCHETYPE_EMOJI } from '../core/archetype';
import { dailySituationId, dateKeyUTC } from '../core/daily';
import {
  Library, applyChoice, currentSituation, newRun, secondChance, undo, type RunState,
} from '../core/engine';
import { randomSeed } from '../core/rng';
import { METERS, type Effects, type MeterId, type Meters, type SituationDef } from '../core/types';
import {
  LOCALES, archetypeText, detectLanguage, endingHint, endingText, lang, setLanguage, situationText, t,
} from '../i18n';
import { GameplayTracker, MidgameThrottle, type Platform } from '../platform/ads';
import type { Sound } from '../platform/audio';
import { loadSave, persist, recordDaily, recordRun, resetProgress, type SaveData } from '../platform/save';
import type { ChoiceStatsProvider } from '../platform/stats';
import { artSvg, logoSvg } from './art';
import { canvasToBlob, drawCard } from './card';
import { $, esc, formatDuration, prefersReducedMotion } from './dom';

const METER_ICON: Record<MeterId, string> = { money: '💰', love: '❤️', joy: '😊', rep: '⭐' };
const SWIPE_THRESHOLD = 70;

type Screen = 'title' | 'game' | 'ending' | 'endings' | 'stats' | 'daily';

export interface AppDeps {
  root: HTMLElement;
  situations: readonly SituationDef[];
  platform: Platform;
  sound: Sound;
  stats: ChoiceStatsProvider;
  /** Fixed seed (e.g. from ?seed= for tests); random otherwise. */
  seed?: number;
}

export class App {
  private readonly lib: Library;
  private save: SaveData;
  private screen: Screen = 'title';
  private run: RunState | null = null;
  private snapshot: RunState | null = null;
  private runStartedAt = 0;
  private runsThisSession = 0;
  private lastEndingNew = false;
  private busy = false;
  private readonly gameplay: GameplayTracker;
  private readonly throttle = new MidgameThrottle();
  private focusedChoice: number | null = null;

  constructor(private readonly deps: AppDeps) {
    this.lib = new Library(deps.situations);
    this.save = loadSave();
    this.gameplay = new GameplayTracker(deps.platform);
    const code = this.save.settings.lang ?? detectFromBrowser();
    setLanguage(code);
    deps.sound.setMuted(this.save.settings.muted);
    this.bindGlobal();
  }

  start(): void {
    this.show('title');
  }

  // ---------- global input ----------
  private bindGlobal(): void {
    const unlock = () => this.deps.sound.unlock();
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    window.addEventListener('keydown', (e) => this.onKey(e));
    this.deps.root.addEventListener('click', (e) => this.onClick(e));
  }

  private onKey(e: KeyboardEvent): void {
    // Prevent page scrolling with arrows/space (CrazyGames requirement).
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) e.preventDefault();
    if (this.screen !== 'game' || !this.run || this.busy) {
      if (e.key === 'Escape' && this.screen !== 'title') this.show('title');
      return;
    }
    const sit = currentSituation(this.lib, this.run);
    if (!sit) return;
    const n = sit.choices.length;
    let idx: number | null = null;
    if (/^[1-3]$/.test(e.key)) idx = Number(e.key) - 1;
    else if (e.key === 'ArrowLeft') idx = 0;
    else if (e.key === 'ArrowRight') idx = n - 1;
    else if (e.key === 'ArrowUp' && n === 3) idx = 1;
    else if (e.key === 'Escape') { this.toMenu(); return; }
    if (idx !== null && idx < n) this.choose(idx, e.key.startsWith('Arrow') ? (idx === 0 ? -1 : 1) : 0);
  }

  private onClick(e: Event): void {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target || (target as HTMLButtonElement).disabled) return;
    const action = target.dataset.action ?? '';
    const arg = target.dataset.arg ?? '';
    this.deps.sound.play('tap');
    switch (action) {
      case 'play': void this.startRun(); break;
      case 'menu': this.toMenu(); break;
      case 'endings': this.show('endings'); break;
      case 'stats': this.show('stats'); break;
      case 'daily': this.show('daily'); break;
      case 'choose': if (this.screen === 'game') this.choose(Number(arg), 0); break;
      case 'daily-choose': this.dailyChoose(Number(arg)); break;
      case 'mute': this.toggleMute(); break;
      case 'lang': this.setLang(arg); break;
      case 'undo': void this.rewardedUndo(); break;
      case 'second': void this.rewardedSecond(); break;
      case 'share': void this.shareCard(); break;
      case 'download': void this.downloadCard(); break;
      case 'reset': this.resetAll(); break;
      default: break;
    }
  }

  // ---------- screens ----------
  private show(screen: Screen): void {
    this.screen = screen;
    if (screen !== 'game') this.gameplay.stop();
    const root = this.deps.root;
    root.dataset.screen = screen;
    switch (screen) {
      case 'title': root.innerHTML = this.titleHtml(); break;
      case 'game': this.renderGame(true); break;
      case 'ending': root.innerHTML = this.endingHtml(); this.paintCard(); break;
      case 'endings': root.innerHTML = this.endingsHtml(); break;
      case 'stats': root.innerHTML = this.statsHtml(); break;
      case 'daily': root.innerHTML = this.dailyHtml(); break;
    }
    const focus = root.querySelector<HTMLElement>('[autofocus]');
    focus?.focus({ preventScroll: true });
  }

  private topBar(withMenu: boolean): string {
    const muted = this.save.settings.muted;
    return `<header class="topbar">
      ${withMenu ? `<button class="icon-btn" data-action="menu" aria-label="${esc(t('menu'))}">←</button>` : '<span></span>'}
      <button class="icon-btn" data-action="mute" aria-pressed="${muted}" aria-label="${esc(muted ? t('sound_off') : t('sound_on'))}">${muted ? '🔇' : '🔊'}</button>
    </header>`;
  }

  private titleHtml(): string {
    const langs = Object.entries(LOCALES)
      .map(([code, l]) => `<button class="chip ${code === lang() ? 'chip-on' : ''}" data-action="lang" data-arg="${code}" aria-pressed="${code === lang()}">${esc(l.meta.name)}</button>`)
      .join('');
    const today = dateKeyUTC(new Date());
    const dailyDone = this.save.daily.lastDate === today;
    return `${this.topBar(false)}
    <main class="screen title-screen">
      <div class="logo">${logoSvg()}</div>
      <p class="tagline">${esc(t('tagline'))}</p>
      <nav class="menu">
        <button class="btn btn-primary btn-big" data-action="play" autofocus>▶ ${esc(t('play'))}</button>
        <button class="btn" data-action="daily">📅 ${esc(t('daily'))}${dailyDone ? ' ✓' : ' <span class="dot-new" aria-hidden="true"></span>'}</button>
        <button class="btn" data-action="endings">🏆 ${esc(t('endings'))} <small>${Object.keys(this.save.endings).length}/${ALL_ENDINGS.length}</small></button>
        <button class="btn" data-action="stats">📊 ${esc(t('stats'))}</button>
      </nav>
      <div class="langs" role="group" aria-label="${esc(t('language'))}">${langs}</div>
    </main>`;
  }

  // ---------- run ----------
  private async startRun(): Promise<void> {
    if (this.busy) return;
    if (this.runsThisSession > 0 && this.throttle.canShow()) {
      this.busy = true;
      this.gameplay.stop();
      try {
        await this.deps.platform.midgame();
      } finally {
        this.throttle.markShown();
        this.busy = false;
      }
    }
    const seed = this.deps.seed !== undefined ? this.deps.seed + this.runsThisSession : randomSeed();
    this.run = newRun(this.lib, seed);
    this.snapshot = null;
    this.runStartedAt = Date.now();
    this.show('game');
  }

  private toMenu(): void {
    this.show('title');
  }

  private metersHtml(meters: Meters, fx: Effects = {}): string {
    return METERS.map((m) => {
      const v = meters[m];
      const d = fx[m] ?? 0;
      const level = v <= 20 || v >= 80 ? 'danger' : '';
      return `<div class="meter meter-${m} ${level}" data-meter="${m}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${v}" aria-label="${esc(t(`meter_${m}`))}">
        <span class="meter-dot" aria-hidden="true"></span>
        <span class="meter-icon" aria-hidden="true">${METER_ICON[m]}</span>
        <span class="meter-bar"><span class="meter-fill" style="height:${v}%"></span></span>
        <span class="meter-val">${v}</span>
        ${d ? `<span class="meter-delta ${d > 0 ? 'up' : 'down'}" aria-hidden="true">${d > 0 ? '+' : ''}${d}</span>` : ''}
      </div>`;
    }).join('');
  }

  private renderGame(fresh: boolean): void {
    const run = this.run;
    if (!run) { this.show('title'); return; }
    const sit = currentSituation(this.lib, run);
    if (!sit) { this.show('ending'); return; }
    const txt = situationText(sit.id);
    const root = this.deps.root;
    const canUndo = !!this.snapshot && !run.usedUndo;
    root.innerHTML = `${this.topBar(true)}
    <main class="screen game-screen">
      <section class="meters" aria-label="meters">${this.metersHtml(run.meters, fresh ? {} : run.lastFx)}</section>
      <p class="turn">${esc(t('turn', { n: run.turn + 1 }))}</p>
      <article class="card ${sit.serious ? 'card-serious' : ''} ${prefersReducedMotion() ? '' : 'flip-in'}" id="card" aria-live="polite">
        <div class="card-art">${artSvg(sit.art, '')}</div>
        ${sit.serious ? `<span class="badge">${esc(t('serious'))}</span>` : ''}
        <p class="card-text">${esc(txt.text)}</p>
        <span class="swipe-label swipe-left" aria-hidden="true">← ${esc(txt.choices[0] ?? '')}</span>
        <span class="swipe-label swipe-right" aria-hidden="true">${esc(txt.choices[sit.choices.length - 1] ?? '')} →</span>
      </article>
      <div class="choices choices-${sit.choices.length}">
        ${sit.choices.map((_, i) => `<button class="btn choice" data-action="choose" data-arg="${i}" data-choice="${i}">
          <span class="choice-key" aria-hidden="true">${i + 1}</span><span>${esc(txt.choices[i] ?? '')}</span></button>`).join('')}
      </div>
      <p class="hint">${esc(t('swipe_hint'))}<span class="desktop-only"> · ${esc(t('key_hint'))}</span></p>
      ${canUndo ? `<button class="btn btn-ghost" data-action="undo">↩ ${esc(t('undo'))} <small>🎬</small></button>` : ''}
    </main>`;
    this.gameplay.start();
    this.bindCard(sit);
    this.bindPreview(sit);
    if (!fresh) this.animateMeters(run.lastFx);
  }

  private animateMeters(fx: Effects): void {
    if (prefersReducedMotion()) return;
    for (const m of METERS) {
      const d = fx[m];
      if (!d) continue;
      const el = this.deps.root.querySelector<HTMLElement>(`[data-meter="${m}"]`);
      el?.classList.add(d > 0 ? 'bump-up' : 'bump-down');
    }
  }

  /** Shows which meters a choice will affect (dot size = magnitude, never direction). */
  private bindPreview(sit: SituationDef): void {
    const buttons = this.deps.root.querySelectorAll<HTMLElement>('[data-choice]');
    buttons.forEach((b) => {
      const i = Number(b.dataset.choice);
      const on = () => this.preview(sit, i);
      const off = () => this.preview(sit, null);
      b.addEventListener('pointerenter', on);
      b.addEventListener('focus', on);
      b.addEventListener('pointerleave', off);
      b.addEventListener('blur', off);
    });
  }

  private preview(sit: SituationDef, idx: number | null): void {
    this.focusedChoice = idx;
    for (const m of METERS) {
      const el = this.deps.root.querySelector<HTMLElement>(`[data-meter="${m}"] .meter-dot`);
      if (!el) continue;
      const v = idx === null ? 0 : Math.abs(sit.choices[idx]?.fx[m] ?? 0);
      el.dataset.size = v === 0 ? '0' : v >= 12 ? '2' : '1';
    }
    this.deps.root.querySelectorAll<HTMLElement>('[data-choice]').forEach((b) => {
      b.classList.toggle('choice-focus', Number(b.dataset.choice) === idx);
    });
  }

  private bindCard(sit: SituationDef): void {
    const card = $('#card', this.deps.root);
    if (!card) return;
    const last = sit.choices.length - 1;
    let startX = 0;
    let startY = 0;
    let dx = 0;
    let dragging = false;
    card.addEventListener('pointerdown', (e) => {
      if (this.busy) return;
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      dx = 0;
      card.setPointerCapture?.(e.pointerId);
      card.classList.add('dragging');
    });
    card.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dy) > Math.abs(dx) * 1.5 && Math.abs(dx) < 20) return;
      card.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
      card.classList.toggle('lean-left', dx < -SWIPE_THRESHOLD / 2);
      card.classList.toggle('lean-right', dx > SWIPE_THRESHOLD / 2);
      const idx = dx < -SWIPE_THRESHOLD / 2 ? 0 : dx > SWIPE_THRESHOLD / 2 ? last : null;
      if (idx !== this.focusedChoice) this.preview(sit, idx);
    });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      card.classList.remove('dragging', 'lean-left', 'lean-right');
      if (dx <= -SWIPE_THRESHOLD) this.choose(0, -1);
      else if (dx >= SWIPE_THRESHOLD) this.choose(last, 1);
      else {
        card.style.transform = '';
        this.preview(sit, null);
      }
    };
    card.addEventListener('pointerup', end);
    card.addEventListener('pointercancel', end);
  }

  private choose(idx: number, dir: -1 | 0 | 1): void {
    const run = this.run;
    if (!run || run.end || this.busy) return;
    const sit = currentSituation(this.lib, run);
    if (!sit || !sit.choices[idx]) return;
    this.busy = true;
    this.deps.stats.record(sit.id, idx);
    const next = applyChoice(this.lib, run, idx);
    this.snapshot = run;
    this.run = next;
    const total = Object.values(next.lastFx).reduce((a, b) => a + (b ?? 0), 0);
    this.deps.sound.play(total >= 0 ? 'up' : 'down');
    const card = $('#card', this.deps.root);
    const delay = prefersReducedMotion() ? 0 : 220;
    if (card && delay) {
      const x = dir === 0 ? 0 : dir * 140;
      card.style.transition = 'transform .22s ease-in, opacity .22s ease-in';
      card.style.transform = dir === 0 ? 'scale(.92) rotateY(80deg)' : `translateX(${x}%) rotate(${dir * 20}deg)`;
      card.style.opacity = '0';
    }
    window.setTimeout(() => {
      this.busy = false;
      if (next.end) this.finishRun();
      else {
        this.deps.sound.play('flip');
        this.renderGame(false);
      }
    }, delay);
  }

  private finishRun(): void {
    const run = this.run;
    if (!run?.end) return;
    this.gameplay.stop();
    // A second chance / undo continues the same run: count it once, at its final ending.
    this.lastEndingNew = recordRun(this.save, run.end.ending, run.turn, Date.now() - this.runStartedAt, dateKeyUTC(new Date()));
    this.runsThisSession += 1;
    this.deps.sound.play(this.lastEndingNew ? 'unlock' : 'end');
    this.show('ending');
  }

  private endingHtml(): string {
    const run = this.run;
    if (!run?.end) return this.titleHtml();
    const e = endingText(run.end.ending);
    const a = archetypeText(run.end.archetype);
    const canSecond = !run.usedSecondChance && canSecondChance(run.end.hit);
    const canUndo = !run.usedUndo && !!this.snapshot;
    return `${this.topBar(true)}
    <main class="screen ending-screen">
      <div class="ending-emoji ${prefersReducedMotion() ? '' : 'pop'}" aria-hidden="true">${ENDING_EMOJI[run.end.ending]}</div>
      <p class="ending-flag">${esc(this.lastEndingNew ? t('ending_new') : t('ending_known'))}</p>
      <h1 class="ending-title">${esc(e.title)}</h1>
      <p class="ending-text">${esc(e.text)}</p>
      <section class="meters meters-small">${this.metersHtml(run.meters)}</section>
      <div class="ending-actions">
        ${canSecond ? `<button class="btn btn-reward" data-action="second">🎬 ${esc(t('second_chance'))}<small>${esc(t('second_chance_ad'))}</small></button>` : ''}
        ${canUndo ? `<button class="btn btn-reward" data-action="undo">🎬 ${esc(t('undo'))}<small>${esc(t('undo_ad'))}</small></button>` : ''}
      </div>
      <h2 class="arch-label">${esc(t('your_archetype'))}</h2>
      <p class="arch-name">${ARCHETYPE_EMOJI[run.end.archetype]} ${esc(a.name)}</p>
      <canvas id="card-canvas" class="share-card" aria-label="${esc(a.name)}"></canvas>
      <div class="row">
        <button class="btn" data-action="share">📤 ${esc(t('share'))}</button>
        <button class="btn" data-action="download">⬇ ${esc(t('download'))}</button>
      </div>
      <button class="btn btn-primary btn-big" data-action="play" autofocus>↻ ${esc(t('play_again'))}</button>
      <button class="btn btn-ghost" data-action="menu">${esc(t('menu'))}</button>
    </main>`;
  }

  private paintCard(): void {
    const run = this.run;
    const canvas = this.deps.root.querySelector<HTMLCanvasElement>('#card-canvas');
    if (!run?.end || !canvas) return;
    const a = archetypeText(run.end.archetype);
    drawCard(canvas, {
      archetypeName: a.name,
      archetypeDesc: a.desc,
      archetypeEmoji: ARCHETYPE_EMOJI[run.end.archetype],
      endingTitle: endingText(run.end.ending).title,
      endingEmoji: ENDING_EMOJI[run.end.ending],
      summary: t('run_summary', { n: run.turn }),
      meters: run.meters,
      meterLabels: { money: t('meter_money'), love: t('meter_love'), joy: t('meter_joy'), rep: t('meter_rep') },
      footer: t('card_footer'),
    });
  }

  private async cardBlob(): Promise<Blob | null> {
    const canvas = this.deps.root.querySelector<HTMLCanvasElement>('#card-canvas');
    return canvas ? canvasToBlob(canvas) : null;
  }

  private async shareCard(): Promise<void> {
    const run = this.run;
    const blob = await this.cardBlob();
    if (!blob || !run?.end) return;
    const file = new File([blob], 'choice-chaos.png', { type: 'image/png' });
    const text = t('share_text', { ending: endingText(run.end.ending).title, archetype: archetypeText(run.end.archetype).name });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text });
        return;
      }
    } catch {
      return; // user cancelled
    }
    await this.downloadCard();
  }

  private async downloadCard(): Promise<void> {
    const blob = await this.cardBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'choice-chaos.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // ---------- rewarded ads ----------
  private async rewarded(): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    this.gameplay.stop();
    try {
      const ok = await this.deps.platform.rewarded();
      if (!ok) this.toast(t('ad_unavailable'));
      return ok;
    } finally {
      this.busy = false;
    }
  }

  private async rewardedUndo(): Promise<void> {
    const run = this.run;
    const snap = this.snapshot;
    if (!run || !snap || run.usedUndo) return;
    if (!(await this.rewarded())) { if (this.screen === 'game') this.gameplay.start(); return; }
    const wasEnded = !!run.end;
    this.run = undo(snap, run);
    this.snapshot = null;
    if (wasEnded) this.uncountEnding(run);
    this.show('game');
  }

  private async rewardedSecond(): Promise<void> {
    const run = this.run;
    if (!run?.end || run.usedSecondChance || !canSecondChance(run.end.hit)) return;
    if (!(await this.rewarded())) return;
    this.uncountEnding(run);
    this.run = secondChance(run);
    this.snapshot = null;
    if (this.run.end) this.finishRun();
    else this.show('game');
  }

  /** The run continues: forget the ending we just recorded so it's counted once. */
  private uncountEnding(run: RunState): void {
    if (!run.end) return;
    const entry = this.save.endings[run.end.ending];
    if (entry) {
      entry.count -= 1;
      if (entry.count <= 0) delete this.save.endings[run.end.ending];
    }
    this.save.stats.runs = Math.max(0, this.save.stats.runs - 1);
    this.save.stats.totalChoices = Math.max(0, this.save.stats.totalChoices - run.turn);
    this.runsThisSession = Math.max(0, this.runsThisSession - 1);
    persist(this.save);
  }

  private toast(msg: string): void {
    const el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.textContent = msg;
    document.body.appendChild(el);
    window.setTimeout(() => el.remove(), 2600);
  }

  // ---------- collection & stats ----------
  private endingsHtml(): string {
    const found = Object.keys(this.save.endings).length;
    const items = ALL_ENDINGS.map((id) => {
      const entry = this.save.endings[id];
      if (!entry) {
        return `<li class="ending-item locked"><span class="e-emoji" aria-hidden="true">❔</span>
          <span class="e-body"><strong>${esc(t('locked'))}</strong><small>${esc(endingHint(id))}</small></span></li>`;
      }
      const e = endingText(id);
      return `<li class="ending-item"><span class="e-emoji" aria-hidden="true">${ENDING_EMOJI[id]}</span>
        <span class="e-body"><strong>${esc(e.title)}</strong><small>${esc(e.text)}</small><small class="muted">${esc(t('found_times', { n: entry.count }))}</small></span></li>`;
    }).join('');
    return `${this.topBar(true)}
    <main class="screen list-screen">
      <h1>${esc(t('endings_title'))}</h1>
      <p class="muted">${esc(t('endings_found', { found, total: ALL_ENDINGS.length }))}</p>
      <div class="progress" aria-hidden="true"><span style="width:${(found / ALL_ENDINGS.length) * 100}%"></span></div>
      <ul class="ending-list">${items}</ul>
    </main>`;
  }

  private statsHtml(): string {
    const s = this.save.stats;
    const rows: Array<[string, string]> = [
      [t('stat_runs'), String(s.runs)],
      [t('stat_best_turns'), String(s.bestTurns)],
      [t('stat_best_time'), formatDuration(s.bestTimeMs)],
      [t('stat_endings'), `${Object.keys(this.save.endings).length} / ${ALL_ENDINGS.length}`],
      [t('stat_choices'), String(s.totalChoices)],
      [t('stat_daily_streak'), `${this.save.daily.streak} 🔥`],
    ];
    return `${this.topBar(true)}
    <main class="screen list-screen">
      <h1>${esc(t('stats_title'))}</h1>
      ${s.runs === 0 ? `<p class="muted">${esc(t('stats_empty'))}</p>` : ''}
      <dl class="stats">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      <button class="btn btn-ghost btn-danger" data-action="reset">${esc(t('reset_progress'))}</button>
    </main>`;
  }

  private resetAll(): void {
    if (!window.confirm(t('reset_confirm'))) return;
    this.save = resetProgress(this.save);
    this.show('stats');
  }

  // ---------- daily ----------
  private dailyHtml(): string {
    const today = dateKeyUTC(new Date());
    const id = dailySituationId(this.lib.situations, today);
    const sit = this.lib.get(id);
    const txt = situationText(id);
    const done = this.save.daily.lastDate === today;
    const picked = done ? this.save.daily.lastChoice : null;
    const choices = sit.choices.map((c, i) => {
      const fx = done ? `<span class="fx">${METERS.filter((m) => c.fx[m]).map((m) => `${METER_ICON[m]}${(c.fx[m] ?? 0) > 0 ? '▲' : '▼'}`).join(' ')}</span>` : '';
      return `<button class="btn choice ${picked === i ? 'choice-picked' : ''}" data-action="daily-choose" data-arg="${i}" ${done ? 'disabled' : ''}>
        <span class="choice-key" aria-hidden="true">${i + 1}</span><span>${esc(txt.choices[i] ?? '')}</span>${picked === i ? fx : ''}</button>`;
    }).join('');
    return `${this.topBar(true)}
    <main class="screen daily-screen">
      <h1>📅 ${esc(t('daily_title'))}</h1>
      <p class="muted">${esc(t('daily_subtitle', { date: today }))}</p>
      <article class="card ${sit.serious ? 'card-serious' : ''}">
        <div class="card-art">${artSvg(sit.art, '')}</div>
        <p class="card-text">${esc(txt.text)}</p>
      </article>
      <div class="choices">${choices}</div>
      ${done ? `<p class="muted">${esc(t('daily_done'))}</p><p class="muted">🔥 ${this.save.daily.streak}</p>` : ''}
      <div id="choice-stats"></div>
    </main>`;
  }

  private dailyChoose(idx: number): void {
    const today = dateKeyUTC(new Date());
    if (this.save.daily.lastDate === today) return;
    const id = dailySituationId(this.lib.situations, today);
    this.deps.stats.record(id, idx);
    recordDaily(this.save, today, idx);
    this.deps.sound.play('unlock');
    this.show('daily');
    void this.renderRealStats(id);
  }

  /** Only renders when a real stats backend returns data. Never invents numbers. */
  private async renderRealStats(id: string): Promise<void> {
    const shares = await this.deps.stats.shares(id);
    const box = this.deps.root.querySelector<HTMLElement>('#choice-stats');
    if (!shares || !box) return;
    const txt = situationText(id);
    box.innerHTML = shares.map((s, i) => `<p>${esc(txt.choices[i] ?? '')}: ${Math.round(s * 100)}%</p>`).join('');
  }

  // ---------- settings ----------
  private toggleMute(): void {
    this.save.settings.muted = !this.save.settings.muted;
    this.deps.sound.setMuted(this.save.settings.muted);
    persist(this.save);
    const btn = this.deps.root.querySelector<HTMLElement>('[data-action="mute"]');
    if (btn) {
      btn.textContent = this.save.settings.muted ? '🔇' : '🔊';
      btn.setAttribute('aria-pressed', String(this.save.settings.muted));
      btn.setAttribute('aria-label', this.save.settings.muted ? t('sound_off') : t('sound_on'));
    }
  }

  private setLang(code: string): void {
    if (!(code in LOCALES)) return;
    this.save.settings.lang = code;
    persist(this.save);
    setLanguage(code);
    this.show(this.screen);
  }
}

function detectFromBrowser(): string {
  try {
    return detectLanguage(navigator.languages?.length ? navigator.languages : [navigator.language]);
  } catch {
    return 'en';
  }
}
