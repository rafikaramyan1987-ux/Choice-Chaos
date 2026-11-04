import {
  DayRun,
  applyDayGifts,
  buyDecor,
  buyEquipment,
  buyRecipe,
  checkStep,
  equipmentCost,
  grantRecipe,
  isMachine,
  machineNeeded,
  machineOf,
  recipeStatus,
  type Payment,
} from '../core/game';
import { DECOR, INGREDIENTS, MACHINES, MAX_EQUIPMENT_LEVEL, RECIPES, getRecipe, machineDuration, stationIngredients } from '../core/recipes';
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
    const gifts = applyDayGifts(this.p);
    if (gifts.length) this.persist();
    this.seed = (this.seed + 0x9e3779b9) >>> 0;
    this.run = new DayRun(this.p.day, this.p.recipes, mulberry32(this.seed ^ this.p.day));
    this.lastSummaryDoubled = false;
    this.renderPlay();
    this.sfx('day');
    const banner = document.createElement('div');
    banner.className = 'day-banner';
    banner.innerHTML = `${icon.sun()}<span>${esc(t('day', { n: this.p.day }))}</span>`;
    $('.scene', this.o.root)?.appendChild(banner);
    for (const id of gifts) this.celebrateRecipe(id);
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
        <section class="station">
          <div class="strip" id="strip" aria-hidden="true"></div>
          <div class="work-row">
            <button class="round-btn" id="redo" aria-label="${esc(t('redo'))}">${icon.redo()}</button>
            <div class="work" id="work"><div class="work-item" id="work-item"></div><div class="pour" id="pour"></div><div class="machine-ring" id="ring"></div></div>
            <div class="tray-col">
              <div class="tray" id="tray" aria-label="${esc(t('tray'))}"></div>
              <button class="serve" id="serve" disabled aria-label="${esc(t('serve'))}">${icon.bell()}</button>
            </div>
          </div>
          <div class="ingredients" id="ings" role="group" aria-label="${esc(t('ingredients'))}"></div>
        </section>
      </div>`;
    this.bindMute();
    $('#redo', this.o.root)?.addEventListener('click', () => {
      if (this.busy || !this.run || this.run.steps.length === 0) return;
      this.run.redo();
      this.sfx('tap');
      this.renderStation();
    });
    $('#serve', this.o.root)?.addEventListener('click', () => void this.serve());
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
      .map((id, i) => {
        const cls = i < run.tray.length ? 'ready' : i === run.tray.length ? 'active' : '';
        return `<div class="order-item ${cls}" title="${esc(name('recipes', id))}">${recipeIcon(getRecipe(id).steps)}${i < run.tray.length ? `<span class="tick">${icon.check()}</span>` : ''}</div>`;
      })
      .join('');
    el.setAttribute('aria-label', `${t('order')}: ${order.items.map((id) => name('recipes', id)).join(', ')}`);
  }

  /** Re-renders strip, item, tray, ingredient buttons. */
  private renderStation(fresh: string | null = null): void {
    const run = this.run;
    if (!run) return;
    const recipe = run.currentRecipe;
    const strip = $('#strip', this.o.root);
    if (strip) {
      strip.innerHTML = recipe
        ? recipe.steps
            .map((s, i) => `<div class="step ${i < run.steps.length ? 'done' : i === run.steps.length ? 'current' : ''}" data-step="${s}">${ingredientIcon(s)}</div>`)
            .join('<span class="arrow">›</span>')
        : '';
    }
    const item = $('#work-item', this.o.root);
    if (item) item.innerHTML = drawItem(run.steps, fresh);
    const tray = $('#tray', this.o.root);
    if (tray) tray.innerHTML = run.tray.map((id, i) => `<div class="tray-item ${i === run.tray.length - 1 && fresh === 'tray' ? 'pop-in' : ''}">${recipeIcon(getRecipe(id).steps)}</div>`).join('');
    const serve = $('#serve', this.o.root) as HTMLButtonElement | null;
    if (serve) {
      serve.disabled = !run.canServe;
      serve.classList.toggle('ready', run.canServe);
    }
    const redo = $('#redo', this.o.root) as HTMLButtonElement | null;
    if (redo) redo.disabled = run.steps.length === 0;
    const ings = $('#ings', this.o.root);
    if (ings) {
      const station = recipe?.station ?? getRecipe(run.order?.items[0] ?? 'latte').station;
      const list = stationIngredients(station, this.p.recipes);
      const key = list.join(',');
      if (ings.dataset.key !== key) {
        ings.dataset.key = key;
        ings.innerHTML = list
          .map(
            (id) =>
              `<button class="ing ${machineOf(id) ? 'machine' : ''}" data-ing="${id}" aria-label="${esc(name('ingredients', id))}">${ingredientIcon(id)}</button>`,
          )
          .join('');
      }
      ings.querySelectorAll<HTMLButtonElement>('.ing').forEach((b) => {
        b.disabled = this.busy || !recipe;
        b.classList.remove('hint');
      });
    }
    this.renderBubble();
    this.scheduleHint();
  }

  private scheduleHint(): void {
    clearTimeout(this.hintTimer);
    const run = this.run;
    const next = run?.nextIngredient;
    if (!run || !next) return;
    const delay = run.day <= 2 ? 2500 : 5000;
    this.hintTimer = window.setTimeout(() => {
      $(`.ing[data-ing="${next}"]`, this.o.root)?.classList.add('hint');
    }, delay);
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
    // drag & drop onto the work area (tap works too)
    let drag: { id: string; x: number; y: number; ghost: HTMLElement | null; pid: number } | null = null;
    ings.addEventListener('pointerdown', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.ing');
      if (!b || b.disabled) return;
      drag = { id: b.dataset.ing ?? '', x: e.clientX, y: e.clientY, ghost: null, pid: e.pointerId };
    });
    window.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.pid) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!drag.ghost && Math.hypot(dx, dy) > 14) {
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

  private async addIngredient(id: string): Promise<void> {
    const run = this.run;
    const recipe = run?.currentRecipe;
    if (!run || !recipe || this.busy || !INGREDIENTS[id]) return;
    const preview = checkStep(recipe, run.steps, id);
    if (preview === 'oops') {
      run.add(id); // counts the mistake, adds nothing
      this.oops();
      return;
    }
    this.busy = true;
    this.renderStation();
    const ing = INGREDIENTS[id];
    const machine = machineOf(id);
    const work = $('#work', this.o.root);
    if (machine) {
      const dur = machineDuration(this.p.equipment[machine]);
      this.sfx(ing?.fx === 'blend' ? 'blend' : ing?.fx === 'pour' ? 'pour' : 'sizzle', dur / 1000);
      work?.classList.add(`fx-${ing?.fx ?? 'sizzle'}`, 'working');
      work?.style.setProperty('--dur', `${dur}ms`);
      await wait(dur);
      work?.classList.remove(`fx-${ing?.fx ?? 'sizzle'}`, 'working');
    } else if (ing?.fx === 'pour') {
      this.sfx('pour', 0.45);
      work?.style.setProperty('--pour', pourColor(id));
      work?.classList.add('fx-pour');
      await wait(this.ms(380));
      work?.classList.remove('fx-pour');
    } else {
      this.sfx('drop');
    }
    if (!this.run || this.run !== run) return;
    const res = run.add(id);
    this.busy = false;
    if (res === 'done') {
      this.sfx('done');
      this.buzz(15);
      const done = run.tray[run.tray.length - 1] as string;
      const item = $('#work-item', this.o.root);
      if (item) item.innerHTML = drawItem(getRecipe(done).steps, null);
      item?.classList.add('to-tray');
      this.busy = true;
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
    const fx = $('#work', this.o.root);
    if (fx) {
      const b = document.createElement('div');
      b.className = 'oops-bubble';
      b.textContent = t('oops');
      fx.appendChild(b);
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
    if (!run || this.busy || !run.canServe) return;
    this.busy = true;
    clearTimeout(this.hintTimer);
    const before = this.p.coins;
    const pay = run.serve(this.watch.elapsed()) as Payment;
    this.p.coins += pay.total;
    this.save.stats.customers += 1;
    this.save.stats.earned += pay.total;
    if (pay.perfect) this.save.stats.perfect += 1;
    this.persist();
    this.sfx('bell');
    this.buzz([20, 40, 20]);
    const serveBtn = $('#serve', this.o.root) as HTMLButtonElement | null;
    if (serveBtn) {
      serveBtn.disabled = true;
      serveBtn.classList.remove('ready');
    }
    // the tray slides to the customer
    $('#tray', this.o.root)?.classList.add('served');
    $('#bubble', this.o.root)?.classList.add('hidden');
    const guest = $('#guest', this.o.root);
    const look = run.orders[run.index - 1]?.look ?? 0;
    if (guest) {
      guest.className = 'guest-wrap hop';
      guest.innerHTML = customer(look, 'happy');
    }
    setTimeout(() => this.sfx('happy'), 150);
    this.showPayment(pay, before);
    await wait(this.ms(1500));
    if (guest) guest.className = 'guest-wrap leave';
    await wait(this.ms(450));
    $('#tray', this.o.root)?.classList.remove('served');
    this.busy = false;
    await this.nextCustomer();
  }

  private showPayment(pay: Payment, before: number): void {
    const fx = $('#fx', this.o.root);
    if (fx) {
      const hearts = Array.from({ length: 3 }, (_, i) => icon.heart(i < pay.hearts ? 'on' : 'off')).join('');
      const pop = document.createElement('div');
      pop.className = 'pay-pop';
      pop.innerHTML = `<div class="hearts-row">${hearts}</div><div class="pay-amount">+${pay.total} ${icon.coin()}</div><div class="pay-tip">${icon.jar()}+${pay.tip}</div>`;
      fx.appendChild(pop);
      setTimeout(() => pop.remove(), 1600);
      if (!this.reduced) {
        const target = $('#coins', this.o.root)?.getBoundingClientRect();
        const origin = fx.getBoundingClientRect();
        for (let i = 0; i < Math.min(8, 3 + Math.floor(pay.total / 4)); i++) {
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
    // count up the coin pill
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
            <li>${icon.heart()}<span>${esc(t('perfect'))}</span><b>${s.perfect}</b></li>
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
      return RECIPES.map((r) => {
        const st = recipeStatus(p, r.id);
        let action: string;
        if (st === 'owned') action = `<span class="badge-owned">${icon.check()}</span>`;
        else if (st === 'locked') action = `<span class="badge-locked">${icon.lock()}<span>${esc(t('fromDay', { n: r.day }))}</span></span>`;
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
        this.persist();
        this.renderShop();
        this.celebrateRecipe(id);
        return;
      }
    } else if (kind === 'reward') {
      b.disabled = true;
      const ok = await this.o.platform.rewarded();
      if (ok && grantRecipe(p, id)) {
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
