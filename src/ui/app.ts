import {
  DayRun,
  OK_MARGIN,
  buyDecor,
  buyEquipment,
  buyRecipe,
  checkStep,
  equipmentCost,
  grantRecipe,
  isMachine,
  machineNeeded,
  judge,
  machineOf,
  recipeStatus,
  zoneWidth,
  type Payment,
  type Quality,
} from '../core/game';
import { DECOR, INGREDIENTS, MACHINES, MAX_EQUIPMENT_LEVEL, RECIPES, actionOf, getRecipe, machineDuration, stationIngredients } from '../core/recipes';
import { mulberry32, randomSeed } from '../core/rng';
import { GameplayTracker, MidgameThrottle, midgameAllowed, type Platform } from '../platform/ads';
import { vibrate, type Sound } from '../platform/audio';
import { loadSave, persist, resetProgress, type SaveData } from '../platform/save';
import { LOCALES, detectLanguage, name, setLanguage, t } from '../i18n';
import { cafeBackground, counter, customer, decorIcon, drawItem, icon, ingredientIcon, machineIcon, recipeIcon, type Mood } from './art';
import { $, esc, prefersReducedMotion, Stopwatch, wait } from './dom';

export interface AppOptions {
  root: HTMLElement;
  platform: Platform;
  sound: Sound;
  seed?: number;
}

type ShopTab = 'recipes' | 'equipment' | 'decor';

interface ActiveAction {
  id: string;
  kind: 'pour' | 'topping' | 'timing';
  /** pointerId holding the button; -1 keyboard, -2 timing, -3 quick tap. */
  pointer: number;
  start: number;
  level: number;
  target: number;
  width: number;
  /** Machine warm-up before the bar reaches the green zone. */
  warm: number;
  raf: number;
  stopSound: (() => void) | null;
}

/** Full gauge time when holding (ms). */
export const POUR_MS = 2600;
export const TOPPING_MS = 2200;
/** Time the timing bar needs to cross the green zone, whatever the machine level. */
export const ZONE_CROSS_MS = 1400;

/** Gauge level (0..1) after `t` ms of an action. */
export function actionLevel(kind: 'pour' | 'topping' | 'timing', t: number, target: number, width: number, warm: number, slow = false): number {
  const k = slow ? 1.25 : 1;
  if (kind === 'pour') return Math.min(1, t / (POUR_MS * k));
  if (kind === 'topping') return Math.min(1, t / (TOPPING_MS * k));
  const lo = Math.max(0.05, target - width / 2);
  if (t < warm) return (lo * t) / warm;
  return Math.min(1, lo + ((t - warm) / (ZONE_CROSS_MS * k)) * width);
}

function hintKind(id: string): 'tap' | 'hold' | 'timing' {
  const a = actionOf(id);
  return a === 'tap' ? 'tap' : a === 'timing' ? 'timing' : 'hold';
}

export class App {
  private save: SaveData;
  private readonly gameplay: GameplayTracker;
  private readonly throttle = new MidgameThrottle();
  private readonly watch = new Stopwatch();
  private readonly reduced = prefersReducedMotion();
  private seed: number;
  private run: DayRun | null = null;
  private busy = false;
  private hintTimer = 0;
  private lastSummaryDoubled = false;
  private shopTab: ShopTab = 'recipes';
  private shopReturn: () => void = () => this.renderTitle();
  private suppressClick = false;
  private action: ActiveAction | null = null;
  /** A fancy recipe just unlocked: the first guest of the next day asks for it. */
  private preferNext: string | null = null;

  constructor(private readonly o: AppOptions) {
    this.save = loadSave();
    this.gameplay = new GameplayTracker(o.platform);
    this.seed = o.seed ?? randomSeed();
    const lang = this.save.settings.lang ?? detectLanguage(typeof navigator !== 'undefined' ? navigator.languages : undefined);
    setLanguage(lang);
    o.sound.setMuted(this.save.settings.muted);
    // first gesture unlocks audio
    const unlock = () => o.sound.unlock();
    o.root.addEventListener('pointerdown', unlock);
    o.root.addEventListener('keydown', unlock);
  }

  start(): void {
    this.renderTitle();
  }

  // ------------------------------------------------------------------ helpers

  private get p() {
    return this.save.progress;
  }

  private ms(n: number): number {
    return this.reduced ? Math.min(n, 120) : n;
  }

  private sfx(kind: Parameters<Sound['play']>[0], seconds?: number): void {
    this.o.sound.play(kind, seconds);
  }

  private buzz(pattern: number | number[]): void {
    vibrate(this.save.settings.vibration, pattern);
  }

  private persist(): void {
    persist(this.save);
  }

  private toast(text: string): void {
    const el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.textContent = text;
    this.o.root.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  private coinPill(): string {
    return `<div class="pill coins" id="coins" aria-label="${esc(t('coins'))}">${icon.coin()}<span id="coin-count">${this.p.coins}</span></div>`;
  }

  private muteButton(): string {
    const m = this.save.settings.muted;
    return `<button class="icon-btn" id="mute" aria-label="${esc(t('sound'))}" aria-pressed="${!m}">${m ? icon.soundOff() : icon.soundOn()}</button>`;
  }

  private bindMute(): void {
    $('#mute', this.o.root)?.addEventListener('click', () => {
      this.save.settings.muted = !this.save.settings.muted;
      this.o.sound.setMuted(this.save.settings.muted);
      this.persist();
      const b = $('#mute', this.o.root);
      if (b) {
        b.innerHTML = this.save.settings.muted ? icon.soundOff() : icon.soundOn();
        b.setAttribute('aria-pressed', String(!this.save.settings.muted));
      }
      this.sfx('tap');
    });
  }

  private celebrateRecipe(id: string): void {
    this.o.platform.happytime();
    this.sfx('unlock');
    this.buzz([20, 40, 20]);
    const el = document.createElement('div');
    el.className = 'unlock-pop';
    el.setAttribute('role', 'status');
    el.innerHTML = `<div class="unlock-card"><div class="unlock-pic">${recipeIcon(getRecipe(id).steps)}</div><strong>${esc(t('newRecipe'))}</strong><span>${esc(name('recipes', id))}</span></div>`;
    this.o.root.appendChild(el);
    el.addEventListener('click', () => el.remove());
    setTimeout(() => el.remove(), this.reduced ? 1800 : 2400);
  }

  // ------------------------------------------------------------------ title

  private renderTitle(): void {
    this.gameplay.stop();
    const guest = customer(this.seed, 'happy');
    this.o.root.innerHTML = `
      <div class="screen title-screen">
        <header class="hud"><div class="pill">${icon.sun()}<span>${esc(t('day', { n: this.p.day }))}</span></div>${this.coinPill()}${this.muteButton()}</header>
        <section class="scene title-scene">
          ${cafeBackground(this.p.decor)}
          <div class="guest-wrap wave">${guest}</div>
          <div class="counter-wrap">${counter(this.p.decor)}</div>
          <div class="counter-items">${recipeIcon(getRecipe('latte').steps)}${this.p.recipes.includes('croissant') ? recipeIcon(getRecipe('croissant').steps) : ''}</div>
        </section>
        <div class="logo"><span class="logo-cup">${icon.recipes()}</span><h1>${esc(t('title'))}</h1></div>
        <p class="tagline">${esc(t('tagline'))}</p>
        <div class="menu">
          <button class="btn primary big" id="play">${icon.play()}<span>${esc(t('play'))}</span></button>
          <button class="btn" id="shop">${icon.shop()}<span>${esc(t('shop'))}</span></button>
        </div>
        <div class="settings" role="group" aria-label="${esc(t('settings'))}">
          <button class="chip" id="vib" aria-pressed="${this.save.settings.vibration}" aria-label="${esc(t('vibration'))}">${icon.vibrate()}<span>${this.save.settings.vibration ? 'ON' : 'OFF'}</span></button>
          ${Object.entries(LOCALES)
            .map(([code, l]) => `<button class="chip lang ${l.meta.code === document.documentElement.lang ? 'on' : ''}" data-lang="${code}">${esc(l.meta.name)}</button>`)
            .join('')}
          <button class="chip subtle" id="reset">${esc(t('reset'))}</button>
        </div>
      </div>`;
    this.bindMute();
    $('#play', this.o.root)?.addEventListener('click', () => {
      this.sfx('tap');
      void this.startDay();
    });
    $('#shop', this.o.root)?.addEventListener('click', () => {
      this.sfx('tap');
      this.shopReturn = () => this.renderTitle();
      this.renderShop();
    });
    $('#vib', this.o.root)?.addEventListener('click', () => {
      this.save.settings.vibration = !this.save.settings.vibration;
      this.persist();
      this.buzz(30);
      this.renderTitle();
    });
    this.o.root.querySelectorAll<HTMLElement>('[data-lang]').forEach((b) =>
      b.addEventListener('click', () => {
        const code = b.dataset.lang ?? 'en';
        setLanguage(code);
        this.save.settings.lang = code;
        this.persist();
        this.renderTitle();
      }),
    );
    $('#reset', this.o.root)?.addEventListener('click', () => this.confirmReset());
  }

  private confirmReset(): void {
    const el = document.createElement('div');
    el.className = 'modal';
    el.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true"><p>${esc(t('resetConfirm'))}</p>
      <div class="row"><button class="btn" data-a="no">${esc(t('no'))}</button><button class="btn danger" data-a="yes">${esc(t('yes'))}</button></div></div>`;
    this.o.root.appendChild(el);
    el.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
      if (!a && e.target !== el) return;
      el.remove();
      if (a === 'yes') {
        this.save = resetProgress(this.save);
        this.renderTitle();
      }
    });
  }

  // ------------------------------------------------------------------ day flow

  private async startDay(): Promise<void> {
    this.seed = (this.seed + 0x9e3779b9) >>> 0;
    this.run = new DayRun(this.p.day, this.p.recipes, mulberry32(this.seed ^ this.p.day), this.preferNext ?? undefined);
    this.preferNext = null;
    this.lastSummaryDoubled = false;
    this.renderPlay();
    this.sfx('day');
    const banner = document.createElement('div');
    banner.className = 'day-banner';
    banner.innerHTML = `${icon.sun()}<span>${esc(t('day', { n: this.p.day }))}</span>`;
    $('.scene', this.o.root)?.appendChild(banner);
    await wait(this.ms(900));
    banner.remove();
    this.gameplay.start();
    await this.nextCustomer();
  }

  private renderPlay(): void {
    const run = this.run;
    if (!run) return;
    this.o.root.innerHTML = `
      <div class="screen play-screen">
        <header class="hud">
          <div class="pill">${icon.sun()}<span>${esc(t('day', { n: run.day }))}</span></div>
          <div class="dots" id="dots" aria-hidden="true"></div>
          ${this.coinPill()}
          ${this.muteButton()}
        </header>
        <section class="scene" id="scene" style="--progress:0">
          ${cafeBackground(this.p.decor)}
          <div class="guest-wrap" id="guest"></div>
          <div class="bubble hidden" id="bubble" aria-label="${esc(t('order'))}"></div>
          <div class="counter-wrap">${counter(this.p.decor)}</div>
          <div class="fx" id="fx"></div>
        </section>
        <section class="station" id="station">
          <div class="strip" id="strip" aria-hidden="true"></div>
          <div class="work-row">
            <button class="round-btn" id="redo" aria-label="${esc(t('redo'))}">${icon.redo()}</button>
            <div class="work" id="work">
              <div class="work-item" id="work-item"></div>
              <div class="pour" id="pour"></div>
              <div class="gauge hidden" id="gauge" aria-hidden="true"><div class="gauge-ok" id="gauge-ok"></div><div class="gauge-zone" id="gauge-zone"></div><div class="gauge-fill" id="gauge-fill"></div><div class="gauge-mark" id="gauge-mark"></div></div>
            </div>
            <div class="tray-col">
              <div class="tray" id="tray" aria-label="${esc(t('tray'))}"></div>
              <button class="serve" id="serve" disabled aria-label="${esc(t('serve'))}">${icon.bell()}</button>
            </div>
          </div>
          <div class="ingredients" id="ings" role="group" aria-label="${esc(t('ingredients'))}"></div>
          <div class="hand-hint hidden" id="hand">${icon.hand()}</div>
        </section>
      </div>`;
    this.bindMute();
    $('#redo', this.o.root)?.addEventListener('click', () => {
      if (this.busy || this.action || !this.run || this.run.steps.length === 0) return;
      this.run.redo();
      this.sfx('tap');
      this.renderStation();
    });
    $('#serve', this.o.root)?.addEventListener('click', () => void this.serve());
    // during a timing step, a tap anywhere on the station stops the machine
    $('#station', this.o.root)?.addEventListener('pointerdown', () => {
      if (this.action?.kind === 'timing') this.finishAction();
    });
    this.bindIngredients();
  }

  private renderDots(): void {
    const run = this.run;
    const el = $('#dots', this.o.root);
    if (!run || !el) return;
    el.innerHTML = run.orders.map((_, i) => `<i class="${i < run.index ? 'done' : i === run.index ? 'now' : ''}"></i>`).join('');
    $('#scene', this.o.root)?.style.setProperty('--progress', String(run.index / run.orders.length));
  }

  private renderGuest(mood: Mood, extra = ''): void {
    const el = $('#guest', this.o.root);
    const order = this.run?.order;
    if (!el || !order) return;
    el.className = `guest-wrap ${extra}`;
    el.innerHTML = customer(order.look, mood);
  }

  private renderBubble(): void {
    const run = this.run;
    const el = $('#bubble', this.o.root);
    if (!run || !el || !run.order) return;
    const order = run.order;
    el.innerHTML = order.items
      .map((it, i) => {
        const cls = i < run.tray.length ? 'ready' : i === run.tray.length ? 'active' : '';
        const badge = it.size ? `<span class="size-badge size-${it.size}">${it.size}</span>` : '';
        return `<div class="order-item ${cls}" data-recipe="${it.recipe}">${recipeIcon(it.steps, it.size, it.targets)}${badge}${i < run.tray.length ? `<span class="tick">${icon.check()}</span>` : ''}</div>`;
      })
      .join('');
    el.setAttribute('aria-label', `${t('order')}: ${order.items.map((it) => `${name('recipes', it.recipe)}${it.size ? ` (${it.size})` : ''}`).join(', ')}`);
  }

  private drawWork(fresh: string | null, live?: { id: string; level: number }): void {
    const run = this.run;
    const el = $('#work-item', this.o.root);
    if (!run || !el) return;
    const steps = live ? [...run.steps, live.id] : run.steps;
    const amounts = live ? [...run.amounts, live.level] : run.amounts;
    el.innerHTML = drawItem({ steps, amounts, size: run.currentItem?.size ?? null, fresh });
  }

  /** Re-renders strip, item, gauge, tray and ingredient buttons. */
  private renderStation(fresh: string | null = null): void {
    const run = this.run;
    if (!run) return;
    const item = run.currentItem;
    const strip = $('#strip', this.o.root);
    if (strip) {
      strip.innerHTML = item
        ? item.steps
            .map((s, i) => `<div class="step ${i < run.steps.length ? 'done' : i === run.steps.length ? 'current' : ''} act-${actionOf(s)}" data-step="${s}" data-action="${actionOf(s)}">${ingredientIcon(s)}</div>`)
            .join('<span class="arrow">›</span>')
        : '';
    }
    this.drawWork(fresh);
    const tray = $('#tray', this.o.root);
    if (tray) tray.innerHTML = run.tray.map((p, i) => `<div class="tray-item ${i === run.tray.length - 1 && fresh === 'tray' ? 'pop-in' : ''}">${recipeIcon(p.item.steps, p.item.size, p.amounts)}</div>`).join('');
    const serve = $('#serve', this.o.root) as HTMLButtonElement | null;
    if (serve) {
      serve.disabled = !run.canServe;
      serve.classList.toggle('ready', run.canServe);
    }
    const redo = $('#redo', this.o.root) as HTMLButtonElement | null;
    if (redo) redo.disabled = run.steps.length === 0;
    const ings = $('#ings', this.o.root);
    if (ings) {
      const station = getRecipe(item?.recipe ?? run.order?.items[0]?.recipe ?? 'latte').station;
      const list = stationIngredients(station, this.p.recipes);
      const key = list.join(',');
      if (ings.dataset.key !== key) {
        ings.dataset.key = key;
        ings.innerHTML = list
          .map((id) => `<button class="ing act-${actionOf(id)}" data-ing="${id}" aria-label="${esc(name('ingredients', id))}">${ingredientIcon(id)}</button>`)
          .join('');
      }
      ings.querySelectorAll<HTMLButtonElement>('.ing').forEach((b) => {
        b.disabled = this.busy || !item;
        b.classList.remove('hint', 'holding');
      });
    }
    this.renderBubble();
    this.prepareGauge();
    this.scheduleHint();
    this.showHandHint();
  }

  /** Shows the green zone of the next pour/topping/timing step before it starts. */
  private prepareGauge(): void {
    const run = this.run;
    const g = $('#gauge', this.o.root);
    if (!run || !g) return;
    const next = run.nextIngredient;
    const act = next ? actionOf(next) : 'tap';
    if (!next || act === 'tap' || this.busy) {
      g.classList.add('hidden');
      return;
    }
    const width = zoneWidth(run.day);
    const target = run.nextTarget;
    const lo = Math.max(0, target - width / 2);
    const hi = Math.min(1, target + width / 2);
    g.className = `gauge act-${act}`;
    g.dataset.lo = String(lo);
    g.dataset.hi = String(hi);
    g.dataset.level = '0';
    const zone = $('#gauge-zone', this.o.root);
    if (zone) {
      zone.style.bottom = `${lo * 100}%`;
      zone.style.height = `${(hi - lo) * 100}%`;
    }
    const ok = $('#gauge-ok', this.o.root);
    if (ok) {
      const olo = Math.max(0, lo - OK_MARGIN);
      const ohi = Math.min(1, hi + OK_MARGIN);
      ok.style.bottom = `${olo * 100}%`;
      ok.style.height = `${(ohi - olo) * 100}%`;
    }
    this.setGaugeLevel(0);
  }

  private setGaugeLevel(level: number): void {
    const g = $('#gauge', this.o.root);
    if (!g) return;
    g.dataset.level = level.toFixed(3);
    const fill = $('#gauge-fill', this.o.root);
    if (fill) fill.style.height = `${level * 100}%`;
    const mark = $('#gauge-mark', this.o.root);
    if (mark) mark.style.bottom = `${level * 100}%`;
    const lo = Number(g.dataset.lo);
    const hi = Number(g.dataset.hi);
    g.classList.toggle('in-zone', level >= lo && level <= hi);
  }

  private scheduleHint(): void {
    clearTimeout(this.hintTimer);
    const run = this.run;
    const next = run?.nextIngredient;
    if (!run || !next) return;
    this.hintTimer = window.setTimeout(() => {
      $(`.ing[data-ing="${next}"]`, this.o.root)?.classList.add('hint');
    }, 3500);
  }

  /** First time an action appears: a hand shows what to do (tap / hold / tap in the green). */
  private showHandHint(): void {
    const hand = $('#hand', this.o.root);
    const run = this.run;
    if (!hand || !run) return;
    const next = run.nextIngredient;
    const kind = next ? hintKind(next) : null;
    if (!next || !kind || this.busy || this.save.hints.includes(kind)) {
      hand.className = 'hand-hint hidden';
      return;
    }
    const btn = $(`.ing[data-ing="${next}"]`, this.o.root);
    const station = $('#station', this.o.root);
    if (!btn || !station) return;
    const b = btn.getBoundingClientRect();
    const s = station.getBoundingClientRect();
    hand.style.left = `${b.left - s.left + b.width / 2 - 10}px`;
    hand.style.top = `${b.top - s.top + b.height / 2 - 6}px`;
    hand.className = `hand-hint show-${kind}`;
  }

  private markHintSeen(kind: string): void {
    if (this.save.hints.includes(kind)) return;
    this.save.hints.push(kind);
    this.persist();
    $('#hand', this.o.root)?.classList.add('hidden');
  }

  private bindIngredients(): void {
    const ings = $('#ings', this.o.root);
    if (!ings) return;
    ings.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.ing');
      if (!b || b.disabled) return;
      if (this.suppressClick) {
        this.suppressClick = false;
        return;
      }
      void this.addIngredient(b.dataset.ing ?? '');
    });
    // keyboard: hold Space/Enter to pour
    ings.addEventListener('keydown', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.ing');
      if (!b || b.disabled || e.repeat || (e.key !== ' ' && e.key !== 'Enter')) return;
      if (this.action?.kind === 'timing') {
        e.preventDefault();
        this.finishAction();
        return;
      }
      const id = b.dataset.ing ?? '';
      if (this.isHoldStep(id)) {
        e.preventDefault();
        this.startAction(id, -1);
      }
    });
    ings.addEventListener('keyup', (e) => {
      if ((e.key === ' ' || e.key === 'Enter') && this.action && this.action.pointer === -1 && this.action.kind !== 'timing') this.finishAction();
    });
    // hold to pour + drag & drop for tap ingredients
    let drag: { id: string; x: number; y: number; ghost: HTMLElement | null; pid: number } | null = null;
    ings.addEventListener('pointerdown', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.ing');
      if (!b || b.disabled || this.action) return;
      const id = b.dataset.ing ?? '';
      if (this.isHoldStep(id)) {
        e.preventDefault();
        this.suppressClick = true;
        try {
          b.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        this.startAction(id, e.pointerId);
        return;
      }
      if (actionOf(id) === 'tap') drag = { id, x: e.clientX, y: e.clientY, ghost: null, pid: e.pointerId };
    });
    window.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.pid) return;
      if (!drag.ghost && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 14) {
        drag.ghost = document.createElement('div');
        drag.ghost.className = 'drag-ghost';
        drag.ghost.innerHTML = ingredientIcon(drag.id);
        document.body.appendChild(drag.ghost);
      }
      if (drag.ghost) {
        drag.ghost.style.transform = `translate(${e.clientX - 36}px, ${e.clientY - 36}px)`;
        const work = $('#work', this.o.root);
        if (work) work.classList.toggle('drop-target', hit(work, e.clientX, e.clientY));
      }
    });
    const end = (e: PointerEvent) => {
      if (this.action && this.action.pointer === e.pointerId && this.action.kind !== 'timing') {
        this.finishAction();
        setTimeout(() => (this.suppressClick = false), 50);
      }
      if (!drag || e.pointerId !== drag.pid) return;
      const d = drag;
      drag = null;
      if (!d.ghost) return;
      d.ghost.remove();
      this.suppressClick = true;
      setTimeout(() => (this.suppressClick = false), 0);
      const work = $('#work', this.o.root);
      work?.classList.remove('drop-target');
      if (work && hit(work, e.clientX, e.clientY)) void this.addIngredient(d.id);
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }

  private isHoldStep(id: string): boolean {
    const a = actionOf(id);
    return (a === 'pour' || a === 'topping') && this.run?.nextIngredient === id && !this.busy;
  }

  /** Tap ingredients are added at once; wrong ones get a gentle oops; timing steps start the machine. */
  private async addIngredient(id: string): Promise<void> {
    const run = this.run;
    const item = run?.currentItem;
    if (!run || !item || this.busy || this.action || !INGREDIENTS[id]) return;
    if (checkStep(item.steps, run.steps, id) === 'oops') {
      run.add(id); // counts the mistake, adds nothing
      this.oops();
      return;
    }
    const act = actionOf(id);
    if (act === 'timing') {
      this.startAction(id, -2);
      return;
    }
    if (act !== 'tap') {
      // a quick tap on a pour step: pour a tiny bit (encourages holding)
      this.startAction(id, -3);
      setTimeout(() => this.finishAction(), 120);
      return;
    }
    this.sfx('drop');
    this.markHintSeen('tap');
    await this.commit(id, 3, 1);
  }

  /** Starts holding (pour/topping) or a machine bar (timing). */
  private startAction(id: string, pointer: number): void {
    const run = this.run;
    if (!run || this.action) return;
    const kind = actionOf(id) as 'pour' | 'topping' | 'timing';
    const width = zoneWidth(run.day);
    const target = run.nextTarget;
    const machine = machineOf(id);
    const warm = kind === 'timing' && machine ? machineDuration(this.p.equipment[machine]) : 0;
    const a: ActiveAction = { id, kind, pointer, start: performance.now(), level: 0, target, width, warm, raf: 0, stopSound: null };
    this.action = a;
    clearTimeout(this.hintTimer);
    $('#hand', this.o.root)?.classList.add('hidden');
    const btn = $(`.ing[data-ing="${id}"]`, this.o.root);
    btn?.classList.add('holding');
    btn?.classList.remove('hint');
    const work = $('#work', this.o.root);
    if (kind === 'pour') {
      work?.style.setProperty('--pour', pourColor(id));
      work?.classList.add('pouring');
      a.stopSound = this.o.sound.loop('pour');
    } else if (kind === 'topping') {
      work?.classList.add('sprinkling');
      a.stopSound = this.o.sound.loop('pour', 0.5);
    } else {
      work?.classList.add(id === 'blend' ? 'fx-blend' : 'fx-sizzle', 'working');
      a.stopSound = this.o.sound.loop(id === 'blend' ? 'blend' : 'sizzle');
      $('#gauge', this.o.root)?.classList.add('timing-run');
    }
    const tick = () => {
      if (this.action !== a) return;
      const t = performance.now() - a.start;
      a.level = actionLevel(kind, t, a.target, a.width, a.warm, this.reduced);
      this.setGaugeLevel(a.level);
      this.drawWork(null, { id, level: a.level });
      if (a.level >= 1) {
        this.finishAction();
        return;
      }
      a.raf = requestAnimationFrame(tick);
    };
    a.raf = requestAnimationFrame(tick);
  }

  private finishAction(): void {
    const a = this.action;
    const run = this.run;
    if (!a || !run) return;
    this.action = null;
    cancelAnimationFrame(a.raf);
    a.stopSound?.();
    const work = $('#work', this.o.root);
    work?.classList.remove('pouring', 'sprinkling', 'fx-blend', 'fx-sizzle', 'working');
    $('#gauge', this.o.root)?.classList.remove('timing-run');
    const level = Math.max(0.02, Math.min(1, a.level));
    this.setGaugeLevel(level);
    const q = judge(level, a.target, a.width);
    this.showQuality(q);
    this.markHintSeen(a.kind === 'timing' ? 'timing' : 'hold');
    void this.commit(a.id, q, level);
  }

  private showQuality(q: Quality): void {
    this.sfx(q === 3 ? 'perfect' : q === 2 ? 'good' : 'soft');
    if (q === 3) this.buzz(15);
    const work = $('#work', this.o.root);
    if (!work) return;
    const el = document.createElement('div');
    el.className = `quality q${q}`;
    el.dataset.q = String(q);
    el.innerHTML = Array.from({ length: 3 }, (_, i) => icon.star(i < q ? 'on' : 'off')).join('');
    work.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  /** Adds a validated step to the run and animates the result. */
  private async commit(id: string, q: Quality, amount: number): Promise<void> {
    const run = this.run;
    if (!run) return;
    const res = run.add(id, q, amount);
    if (res === 'done') {
      this.sfx('done');
      this.busy = true;
      const done = run.tray[run.tray.length - 1];
      const item = $('#work-item', this.o.root);
      if (item && done) item.innerHTML = drawItem({ steps: done.item.steps, amounts: done.amounts, size: done.item.size });
      $('#gauge', this.o.root)?.classList.add('hidden');
      ($('#ings', this.o.root)?.querySelectorAll<HTMLButtonElement>('.ing') ?? []).forEach((b) => (b.disabled = true));
      await wait(this.ms(350));
      item?.classList.add('to-tray');
      await wait(this.ms(420));
      this.busy = false;
      item?.classList.remove('to-tray');
      this.renderStation('tray');
      if (run.canServe) this.sfx('bell');
    } else {
      this.renderStation(id);
    }
  }

  private oops(): void {
    this.sfx('oops');
    this.buzz(12);
    const work = $('#work', this.o.root);
    work?.classList.remove('wiggle');
    void work?.offsetWidth;
    work?.classList.add('wiggle');
    if (work) {
      const b = document.createElement('div');
      b.className = 'oops-bubble';
      b.textContent = t('oops');
      work.appendChild(b);
      setTimeout(() => b.remove(), 900);
    }
    this.renderGuest('oops');
    setTimeout(() => {
      if (!this.busy && this.run?.order) this.renderGuest('wait');
    }, 700);
    // after a mistake, show the right ingredient right away
    const next = this.run?.nextIngredient;
    if (next) $(`.ing[data-ing="${next}"]`, this.o.root)?.classList.add('hint');
  }

  private async nextCustomer(): Promise<void> {
    const run = this.run;
    if (!run) return;
    if (run.finished) {
      this.endDay();
      return;
    }
    this.renderDots();
    this.busy = true;
    this.renderGuest('wait', 'enter');
    this.sfx('door');
    $('#bubble', this.o.root)?.classList.add('hidden');
    this.renderStation();
    await wait(this.ms(550));
    $('#bubble', this.o.root)?.classList.remove('hidden');
    this.renderGuest('wait');
    this.busy = false;
    this.renderStation();
    this.watch.start();
  }

  private async serve(): Promise<void> {
    const run = this.run;
    if (!run || this.busy || this.action || !run.canServe) return;
    this.busy = true;
    clearTimeout(this.hintTimer);
    const before = this.p.coins;
    const look = run.order?.look ?? 0;
    const pay = run.serve(this.watch.elapsed()) as Payment;
    this.p.coins += pay.total;
    this.save.stats.customers += 1;
    this.save.stats.earned += pay.total;
    if (pay.stars === 3) this.save.stats.perfect += 1;
    this.persist();
    this.sfx('bell');
    this.buzz(pay.stars === 3 ? [20, 40, 20] : 20);
    const serveBtn = $('#serve', this.o.root) as HTMLButtonElement | null;
    if (serveBtn) {
      serveBtn.disabled = true;
      serveBtn.classList.remove('ready');
    }
    $('#tray', this.o.root)?.classList.add('served');
    $('#bubble', this.o.root)?.classList.add('hidden');
    const guest = $('#guest', this.o.root);
    const mood: Mood = pay.stars === 3 ? 'happy' : pay.stars === 2 ? 'smile' : 'meh';
    if (guest) {
      guest.className = `guest-wrap ${pay.stars === 3 ? 'hop' : pay.stars === 2 ? 'nod' : ''}`;
      guest.innerHTML = customer(look, mood);
      guest.dataset.stars = String(pay.stars);
    }
    setTimeout(() => this.sfx(pay.stars === 3 ? 'happy' : pay.stars === 2 ? 'good' : 'soft'), 150);
    this.showPayment(pay, before);
    await wait(this.ms(1600));
    if (guest) guest.className = 'guest-wrap leave';
    await wait(this.ms(450));
    $('#tray', this.o.root)?.classList.remove('served');
    this.busy = false;
    await this.nextCustomer();
  }

  private showPayment(pay: Payment, before: number): void {
    const fx = $('#fx', this.o.root);
    if (fx) {
      const stars = Array.from({ length: 3 }, (_, i) => icon.star(i < pay.stars ? 'on' : 'off')).join('');
      const pop = document.createElement('div');
      pop.className = `pay-pop stars-${pay.stars}`;
      pop.dataset.stars = String(pay.stars);
      pop.innerHTML = `<div class="stars-row">${stars}</div><div class="pay-amount">+${pay.total} ${icon.coin()}</div>${pay.tip ? `<div class="pay-tip">${icon.jar()}+${pay.tip}</div>` : ''}`;
      fx.appendChild(pop);
      setTimeout(() => pop.remove(), 1700);
      if (!this.reduced) {
        const target = $('#coins', this.o.root)?.getBoundingClientRect();
        const origin = fx.getBoundingClientRect();
        for (let i = 0; i < Math.min(8, 2 + Math.floor(pay.total / 4)); i++) {
          const c = document.createElement('div');
          c.className = 'fly-coin';
          c.innerHTML = icon.coin();
          const sx = origin.width / 2 + (i % 3) * 14 - 14;
          const sy = origin.height * 0.45;
          c.style.left = `${sx}px`;
          c.style.top = `${sy}px`;
          if (target) {
            c.style.setProperty('--tx', `${target.left + target.width / 2 - origin.left - sx - 14}px`);
            c.style.setProperty('--ty', `${target.top + target.height / 2 - origin.top - sy - 14}px`);
          }
          c.style.animationDelay = `${300 + i * 70}ms`;
          fx.appendChild(c);
          setTimeout(() => c.remove(), 1400 + i * 70);
        }
      }
    }
    const el = $('#coin-count', this.o.root);
    const after = this.p.coins;
    const steps = this.reduced ? 1 : 12;
    for (let i = 1; i <= steps; i++) {
      setTimeout(() => {
        if (el) el.textContent = String(Math.round(before + ((after - before) * i) / steps));
        if (i === 1 || i === steps) this.sfx('coin');
      }, (this.reduced ? 0 : 450) + i * 45);
    }
    setTimeout(() => $('#coins', this.o.root)?.classList.add('bump'), 400);
    setTimeout(() => $('#coins', this.o.root)?.classList.remove('bump'), 1100);
  }

  private endDay(): void {
    const run = this.run;
    if (!run) return;
    this.gameplay.stop();
    clearTimeout(this.hintTimer);
    this.p.day = run.day + 1;
    this.save.stats.days += 1;
    this.persist();
    this.renderSummary();
  }

  private renderSummary(): void {
    const run = this.run;
    if (!run) return;
    const s = run.summary;
    this.o.root.innerHTML = `
      <div class="screen summary-screen">
        <header class="hud"><div class="pill">${icon.sun()}<span>${esc(t('day', { n: s.day }))}</span></div>${this.coinPill()}${this.muteButton()}</header>
        <section class="summary-card">
          <div class="sunset">${icon.sun()}</div>
          <h2>${esc(t('dayDone', { n: s.day }))}</h2>
          <ul class="stats">
            <li>${icon.guest()}<span>${esc(t('served'))}</span><b>${s.served}</b></li>
            <li>${icon.coin()}<span>${esc(t('earnedBase'))}</span><b>${s.base}</b></li>
            <li>${icon.jar()}<span>${esc(t('earnedTips'))}</span><b>${s.tips}</b></li>
            <li>${icon.star()}<span>${esc(t('perfect'))}</span><b>${s.perfect}</b></li>
          </ul>
          <div class="total">${icon.coin()}<span>${esc(t('total'))}</span><b id="day-total">+${s.earned * (this.lastSummaryDoubled ? 2 : 1)}</b></div>
        </section>
        <div class="menu">
          ${s.earned > 0 && !this.lastSummaryDoubled ? `<button class="btn reward" id="double">${icon.video()}<span>${esc(t('double'))}</span><b>×2</b></button>` : ''}
          <button class="btn" id="shop">${icon.shop()}<span>${esc(t('shop'))}</span></button>
          <button class="btn primary big" id="next">${icon.next()}<span>${esc(t('nextDay'))}</span></button>
        </div>
      </div>`;
    this.bindMute();
    $('#double', this.o.root)?.addEventListener('click', () => void this.doubleCoins());
    $('#shop', this.o.root)?.addEventListener('click', () => {
      this.sfx('tap');
      this.shopReturn = () => this.renderSummary();
      this.renderShop();
    });
    $('#next', this.o.root)?.addEventListener('click', () => void this.goNextDay());
  }

  private async doubleCoins(): Promise<void> {
    const run = this.run;
    const btn = $('#double', this.o.root) as HTMLButtonElement | null;
    if (!run || this.lastSummaryDoubled || !btn) return;
    btn.disabled = true;
    const ok = await this.o.platform.rewarded();
    if (!ok) {
      btn.disabled = false;
      this.toast(t('adUnavailable'));
      return;
    }
    this.lastSummaryDoubled = true;
    this.p.coins += run.summary.earned;
    this.persist();
    this.sfx('coin');
    this.toast(t('doubled'));
    this.renderSummary();
  }

  private async goNextDay(): Promise<void> {
    const completed = this.p.day - 1;
    const btn = $('#next', this.o.root) as HTMLButtonElement | null;
    if (btn) btn.disabled = true;
    if (midgameAllowed(completed, this.throttle)) {
      this.gameplay.stop();
      await this.o.platform.midgame();
      this.throttle.markShown();
    }
    await this.startDay();
  }

  // ------------------------------------------------------------------ shop

  private renderShop(): void {
    const tabs: ShopTab[] = ['recipes', 'equipment', 'decor'];
    const tabIcon: Record<ShopTab, string> = { recipes: icon.recipes(), equipment: icon.equipment(), decor: icon.decor() };
    this.o.root.innerHTML = `
      <div class="screen shop-screen">
        <header class="hud"><button class="icon-btn" id="back" aria-label="${esc(t('back'))}">${icon.back()}</button><h2 class="hud-title">${esc(t('shop'))}</h2>${this.coinPill()}</header>
        <div class="tabs" role="tablist">
          ${tabs.map((k) => `<button role="tab" class="tab ${k === this.shopTab ? 'on' : ''}" aria-selected="${k === this.shopTab}" data-tab="${k}">${tabIcon[k]}<span>${esc(t(k))}</span></button>`).join('')}
        </div>
        ${this.shopTab === 'decor' ? `<div class="decor-preview">${cafeBackground(this.p.decor)}<div class="counter-wrap">${counter(this.p.decor)}</div></div>` : ''}
        <div class="cards">${this.shopCards()}</div>
      </div>`;
    $('#back', this.o.root)?.addEventListener('click', () => {
      this.sfx('tap');
      this.shopReturn();
    });
    this.o.root.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) =>
      b.addEventListener('click', () => {
        this.shopTab = (b.dataset.tab as ShopTab) ?? 'recipes';
        this.sfx('tap');
        this.renderShop();
      }),
    );
    this.o.root.querySelectorAll<HTMLButtonElement>('[data-buy]').forEach((b) => b.addEventListener('click', () => void this.buy(b)));
  }

  private priceButton(kind: string, id: string, cost: number, affordable: boolean): string {
    return `<button class="buy ${affordable ? '' : 'short'}" data-buy="${kind}" data-id="${id}" ${affordable ? '' : 'disabled'}>${icon.coin()}<span>${cost}</span></button>`;
  }

  private shopCards(): string {
    const p = this.p;
    if (this.shopTab === 'recipes') {
      const canReward = this.save.rewardUnlockDay !== p.day;
      // fancy recipes still to unlock first, then the menu you already have
      const sorted = [...RECIPES].sort((a, b) => Number(p.recipes.includes(a.id)) - Number(p.recipes.includes(b.id)) || a.cost - b.cost);
      return sorted.map((r) => {
        const st = recipeStatus(p, r.id);
        let action: string;
        if (st === 'owned') action = `<span class="badge-owned">${icon.check()}</span>`;
        else {
          action = this.priceButton('recipe', r.id, r.cost, st === 'buyable');
          if (st === 'short' && canReward)
            action += `<button class="buy reward" data-buy="reward" data-id="${r.id}" aria-label="${esc(t('watchAd'))}: ${esc(t('unlockFree'))}">${icon.video()}<span>${esc(t('unlockFree'))}</span></button>`;
        }
        return `<div class="card ${st}" data-recipe="${r.id}"><div class="card-pic">${recipeIcon(r.steps)}</div><div class="card-name">${esc(name('recipes', r.id))}</div><div class="card-action">${action}</div></div>`;
      }).join('');
    }
    if (this.shopTab === 'equipment') {
      return MACHINES.map((m) => {
        const lvl = p.equipment[m];
        const cost = equipmentCost(p, m);
        const needed = machineNeeded(p, m);
        const dots = Array.from({ length: MAX_EQUIPMENT_LEVEL + 1 }, (_, i) => `<i class="${i <= lvl ? 'on' : ''}"></i>`).join('');
        let action: string;
        if (cost === null) action = `<span class="badge-owned">${esc(t('maxLevel'))}</span>`;
        else if (!needed) action = `<span class="badge-locked">${icon.lock()}</span>`;
        else action = this.priceButton('machine', m, cost, p.coins >= cost);
        return `<div class="card"><div class="card-pic">${machineIcon(m)}</div><div class="card-name">${esc(name('machines', m))}</div><div class="level" aria-label="${esc(t('level', { n: lvl + 1 }))}">${dots}<span class="speed">» ${(machineDuration(lvl) / 1000).toFixed(1)}s</span></div><div class="card-action">${action}</div></div>`;
      }).join('');
    }
    return DECOR.map((d) => {
      const owned = p.decor.includes(d.id);
      const action = owned ? `<span class="badge-owned">${icon.check()}</span>` : this.priceButton('decor', d.id, d.cost, p.coins >= d.cost);
      return `<div class="card ${owned ? 'owned' : ''}"><div class="card-pic decor-pic">${decorIcon(d.id)}</div><div class="card-name">${esc(name('decor', d.id))}</div><div class="card-action">${action}</div></div>`;
    }).join('');
  }

  private async buy(b: HTMLButtonElement): Promise<void> {
    const kind = b.dataset.buy;
    const id = b.dataset.id ?? '';
    const p = this.p;
    if (kind === 'recipe') {
      if (buyRecipe(p, id)) {
        this.preferNext = id;
        this.persist();
        this.renderShop();
        this.celebrateRecipe(id);
        return;
      }
    } else if (kind === 'reward') {
      b.disabled = true;
      const ok = await this.o.platform.rewarded();
      if (ok && grantRecipe(p, id)) {
        this.preferNext = id;
        this.save.rewardUnlockDay = p.day;
        this.persist();
        this.renderShop();
        this.celebrateRecipe(id);
        return;
      }
      b.disabled = false;
      if (!ok) this.toast(t('adUnavailable'));
      return;
    } else if (kind === 'machine') {
      if (isMachine(id) && buyEquipment(p, id)) {
        this.persist();
        this.sfx('unlock');
        this.buzz(20);
        this.renderShop();
        return;
      }
    } else if (kind === 'decor') {
      if (buyDecor(p, id)) {
        this.persist();
        this.sfx('unlock');
        this.buzz(20);
        this.renderShop();
        return;
      }
    }
    this.sfx('oops');
  }
}

function hit(el: HTMLElement, x: number, y: number): boolean {
  const r = el.getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

function pourColor(id: string): string {
  const c: Record<string, string> = {
    milk: '#f4ead8', foam: '#fffaf2', cocoa: '#5a3420', orange: '#ffa630', yogurt: '#fff6ea', batter: '#f8e8b8', choco: '#5a3420', coffee: '#6b3e26',
  };
  return c[id] ?? '#fff';
}
