import {
  DayRun,
  OK_MARGIN,
  buyDecor,
  buyEquipment,
  buyRecipeWithGems,
  checkStep,
  equipmentCost,
  grantRecipe,
  isMachine,
  machineNeeded,
  judge,
  machineOf,
  recipeStatus,
  zoneWidth,
  type Order,
  type Payment,
  type PayMods,
  type Quality,
} from '../core/game';
import {
  ACHIEVEMENTS,
  CHALLENGE_GUESTS,
  CHALLENGE_STARS,
  EXPANSIONS,
  LOGIN_REWARDS,
  REROLL_GEMS,
  STICKERS,
  CUSTOMER_LEVEL,
  cafeEffects,
  canUseAd,
  challengeAvailable,
  challengeSeed,
  claimDayChest,
  claimGift,
  claimLogin,
  dayChest,
  expansionStatus,
  fillMissions,
  finishBuild,
  finishChallenge,
  giftReady,
  guestOptions,
  localDate,
  loginAvailable,
  loginDayIndex,
  nextLockedRecipe,
  onServed,
  rerollMission,
  settleBuilds,
  skipCost,
  startBuild,
  startDayMeta,
  useAd,
  xpToNext,
  type Mission,
  type Reward,
  type RewardEvent,
  type Unlock,
} from '../core/meta';
import { DECOR, INGREDIENTS, MACHINES, MAX_EQUIPMENT_LEVEL, RECIPES, actionOf, getRecipe, machineDuration, recipeGemCost, stationIngredients } from '../core/recipes';
import { mulberry32, randomSeed, type Rng } from '../core/rng';
import { GameplayTracker, MidgameThrottle, midgameAllowed, type Platform } from '../platform/ads';
import { vibrate, type Sound } from '../platform/audio';
import { loadSave, persist, resetProgress, type SaveData } from '../platform/save';
import { LOCALES, detectLanguage, name, setLanguage, t } from '../i18n';
import {
  cafeBackground,
  counter,
  customer,
  decorIcon,
  drawItem,
  expansionIcon,
  icon,
  ingredientIcon,
  machineIcon,
  recipeIcon,
  type GuestKind,
  type GuestSpecial,
  type Mood,
} from './art';
import { $, esc, prefersReducedMotion, Stopwatch, wait } from './dom';
import { appZoom } from './fit';

export interface AppOptions {
  root: HTMLElement;
  platform: Platform;
  sound: Sound;
  seed?: number;
}

type ShopTab = 'recipes' | 'equipment' | 'decor' | 'cafe';

/** Gem alternatives to rewarded videos (CrazyGames: always offer another way to get the reward). */
const VIP_GEMS = 3;
const REDO_GEMS = 2;
type BookTab = 'stickers' | 'achievements';

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


const fmtTime = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return s >= 3600 ? `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export class App {
  private save: SaveData;
  private readonly gameplay: GameplayTracker;
  private readonly throttle = new MidgameThrottle();
  private readonly watch = new Stopwatch();
  private readonly reduced = prefersReducedMotion();
  private seed: number;
  private readonly rng: Rng;
  private run: DayRun | null = null;
  private busy = false;
  private hintTimer = 0;
  private ticker = 0;
  private lastSummaryDoubled = false;
  private dayChestEvents: RewardEvent[] = [];
  private shopTab: ShopTab = 'recipes';
  private bookTab: BookTab = 'stickers';
  private shopReturn: () => void = () => this.renderHub();
  private suppressClick = false;
  private action: ActiveAction | null = null;
  /** A fancy recipe just unlocked: the first guest of the next day asks for it. */
  private preferNext: string | null = null;
  /** "Call a VIP" reward: the first guest of the next day is a VIP. */
  private vipNext = false;
  /** Playing the daily challenge instead of a normal day. */
  private challenge = false;
  private challengeResult: RewardEvent[] | null = null;
  /** Orders of the current day below 3★ (the summary offers to upgrade one). */
  private weakOrders: Array<{ items: Order['items']; special: Order['special']; pay: Payment; mods: PayMods }> = [];

  constructor(private readonly o: AppOptions) {
    this.save = loadSave();
    this.gameplay = new GameplayTracker(o.platform);
    this.seed = o.seed ?? randomSeed();
    this.rng = mulberry32(this.seed ^ 0x51ed);
    // language: saved choice, else the platform locale (CrazyGames system info), else the browser
    const platformLocale = o.platform.locale();
    const lang =
      this.save.settings.lang ??
      detectLanguage(platformLocale ? [platformLocale] : typeof navigator !== 'undefined' ? navigator.languages : undefined);
    setLanguage(lang);
    this.applyMute();
    // the platform's muteAudio setting wins over the in-game toggle
    o.platform.onPlatformMuteChange(() => this.applyMute());
    fillMissions(this.save.meta, this.p, this.rng);
    persist(this.save);
    // first gesture unlocks audio
    const unlock = () => o.sound.unlock();
    o.root.addEventListener('pointerdown', unlock);
    o.root.addEventListener('keydown', unlock);
    // iOS suspends audio when the app is backgrounded; resume needs a real gesture (touchend / click)
    document.addEventListener('touchend', unlock, { passive: true });
    document.addEventListener('click', unlock);
  }

  /** New players land directly in gameplay; returning players see the café screen. */
  start(): void {
    const fresh = this.save.meta.stats.served === 0 && this.p.day === 1 && this.save.stats.customers === 0;
    if (fresh) void this.startDay();
    else this.renderHub();
  }

  private applyMute(): void {
    this.o.sound.setMuted(this.save.settings.muted || this.o.platform.platformMuted());
  }

  // ------------------------------------------------------------------ rewarded videos

  /** Rewarded videos can be offered (no ad blocker detected, ads not disabled for this session). */
  private videosOk(): boolean {
    return this.o.platform.adsUnavailable() === null;
  }

  /** Notice shown instead of video buttons when an ad blocker is detected (the game stays fully playable). */
  private adNote(): string {
    return this.o.platform.adsUnavailable() === 'adblock' ? `<p class="ad-note">${icon.video()}<span>${esc(t('adblockNote'))}</span></p>` : '';
  }

  /** Plays a rewarded video. The reward is given only when it finished (never on adError). */
  private async watchVideo(): Promise<boolean> {
    const ok = await this.o.platform.rewarded();
    if (!ok) {
      const why = this.o.platform.adsUnavailable();
      this.toast(why === 'adblock' ? t('adblockNote') : why === 'disabled' ? t('videosOff') : t('adUnavailable'), icon.video());
    }
    return ok;
  }

  // ------------------------------------------------------------------ helpers

  private get p() {
    return this.save.progress;
  }

  private today(): string {
    return localDate();
  }

  /** Decorations + finished expansions, drawn in the café. */
  private features(): string[] {
    return [...this.p.decor, ...cafeEffects(this.save.meta, Date.now()).built];
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

  /** Small non-blocking notice at the top (stacked). */
  private toast(text: string, pic = '', extra = ''): void {
    let stack = $('.toasts', this.o.root);
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toasts';
      stack.setAttribute('role', 'status');
      this.o.root.appendChild(stack);
    }
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `${pic ? `<span class="toast-pic">${pic}</span>` : ''}<span>${esc(text)}</span>${extra ? `<span class="reward-chips">${extra}</span>` : ''}`;
    stack.appendChild(el);
    setTimeout(() => el.remove(), 2800);
  }

  private coinPill(): string {
    return `<div class="pill coins" id="coins" aria-label="${esc(t('coins'))}">${icon.coin()}<span id="coin-count">${this.p.coins}</span></div>`;
  }

  private gemPill(): string {
    return `<div class="pill gems" id="gems" aria-label="${esc(t('gems'))}">${icon.gem()}<span id="gem-count">${this.p.gems}</span></div>`;
  }

  private updateWallet(): void {
    const c = $('#coin-count', this.o.root);
    if (c) c.textContent = String(this.p.coins);
    const g = $('#gem-count', this.o.root);
    if (g) g.textContent = String(this.p.gems);
    const lv = $('#level', this.o.root);
    if (lv) lv.outerHTML = this.levelPill();
  }

  private levelPill(): string {
    const m = this.save.meta;
    const pct = Math.round((m.xp / xpToNext(m.level)) * 100);
    return `<div class="pill level" id="level" aria-label="${esc(t('level', { n: m.level }))}"><span class="lv">${m.level}</span><span class="xp"><i style="width:${pct}%"></i></span></div>`;
  }

  private muteButton(): string {
    const m = this.save.settings.muted;
    return `<button class="icon-btn" id="mute" aria-label="${esc(t('sound'))}" aria-pressed="${!m}">${m ? icon.soundOff() : icon.soundOn()}</button>`;
  }

  private bindMute(): void {
    $('#mute', this.o.root)?.addEventListener('click', () => {
      this.save.settings.muted = !this.save.settings.muted;
      this.applyMute();
      this.persist();
      const b = $('#mute', this.o.root);
      if (b) {
        b.innerHTML = this.save.settings.muted ? icon.soundOff() : icon.soundOn();
        b.setAttribute('aria-pressed', String(!this.save.settings.muted));
      }
      this.sfx('tap');
    });
  }

  private chips(r: Reward): string {
    return [
      r.coins ? `<span class="chip-r">${icon.coin()}${r.coins}</span>` : '',
      r.gems ? `<span class="chip-r">${icon.gem()}${r.gems}</span>` : '',
      r.xp ? `<span class="chip-r xp">XP ${r.xp}</span>` : '',
    ].join('');
  }

  /** Opens a modal and resolves with the data-a of the pressed button ('' when closed). */
  private modal(inner: string, cls = ''): Promise<string> {
    return new Promise((resolve) => {
      const el = document.createElement('div');
      el.className = `modal ${cls}`;
      el.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true">${inner}</div>`;
      this.o.root.appendChild(el);
      (el.querySelector('[data-a]') as HTMLElement | null)?.focus();
      el.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-a]');
        if (!btn && e.target !== el) return;
        if (btn?.disabled) return;
        el.remove();
        resolve(btn?.dataset.a ?? '');
      });
    });
  }

  private unlockPic(u: Unlock): string {
    if (u.type === 'recipe') return recipeIcon(getRecipe(u.id).steps);
    if (u.type === 'customer') return this.guestPic(u.id);
    return expansionIcon(u.id);
  }

  private guestPic(id: string): string {
    const special = ['vip', 'critic', 'celebrity'].includes(id) ? (id as GuestSpecial) : null;
    return customer(7, 'happy', special ? 'bear' : (id as GuestKind), special);
  }

  /** Mission/achievement/sticker toasts; level-ups open a chest. */
  private async showRewards(events: RewardEvent[]): Promise<void> {
    for (const e of events) {
      if (e.source === 'mission') {
        this.sfx('perfect');
        this.toast(t('missionDone'), icon.missions(), this.chips({ coins: e.reward.coins, gems: e.reward.gems }));
      } else if (e.source === 'achievement') {
        this.sfx('unlock');
        this.toast(`${t('achievement')} ${name('achievements', e.id)}`, icon.trophy(), this.chips(e.reward));
      } else if (e.source === 'sticker') {
        this.toast(`${t('newSticker')} ${name('guests', e.id)}`, this.guestPic(e.id), this.chips(e.reward));
      } else if (e.source === 'build') {
        this.sfx('unlock');
        this.toast(t('isReady', { name: name('expansions', e.id) }), icon.hammer());
      }
    }
    this.updateWallet();
    for (const e of events.filter((x) => x.source === 'level')) await this.levelUp(e);
  }

  private async levelUp(e: RewardEvent): Promise<void> {
    this.o.platform.happytime();
    this.sfx('day');
    this.buzz([30, 50, 30]);
    const unlocks = (e.unlocks ?? [])
      .map((u) => {
        const label = u.type === 'recipe' ? t('newRecipe') : u.type === 'customer' ? t('newGuest') : t('newArea');
        const nm = u.type === 'recipe' ? name('recipes', u.id) : u.type === 'customer' ? name('guests', u.id) : name('expansions', u.id);
        return `<div class="unlock-row"><div class="unlock-mini">${this.unlockPic(u)}</div><div><small>${esc(label)}</small><b>${esc(nm)}</b></div></div>`;
      })
      .join('');
    await this.modal(
      `<div class="chest">${icon.gift()}</div><h2>${esc(t('levelUp', { n: e.id }))}</h2><div class="reward-chips">${this.chips(e.reward)}</div>${unlocks}<button class="btn primary" data-a="ok">${icon.check()}<span>OK</span></button>`,
      'level-modal',
    );
    this.updateWallet();
  }

  // ------------------------------------------------------------------ hub (café screen)

  private renderHub(): void {
    this.gameplay.stop();
    clearInterval(this.ticker);
    const meta = this.save.meta;
    const today = this.today();
    const events = settleBuilds(meta, this.p, Date.now());
    fillMissions(meta, this.p, this.rng);
    this.persist();
    const giftOk = giftReady(meta, Date.now());
    const chOk = challengeAvailable(meta, today);
    const vipOk = meta.level >= CUSTOMER_LEVEL.vip && canUseAd(meta, 'vip', today) && !this.vipNext && (this.videosOk() || this.p.gems >= VIP_GEMS);
    this.o.root.innerHTML = `
      <div class="screen hub-screen">
        <header class="hud">${this.levelPill()}${this.coinPill()}${this.gemPill()}${this.muteButton()}</header>
        <section class="scene title-scene">
          ${cafeBackground(this.features())}
          <div class="guest-wrap wave">${customer(this.seed, 'happy')}</div>
          <div class="counter-wrap">${counter(this.p.decor)}</div>
          <div class="counter-items">${recipeIcon(getRecipe('latte').steps)}${recipeIcon(getRecipe('croissant').steps)}</div>
          <div class="hub-logo"><span class="logo-cup">${icon.recipes()}</span><h1>${esc(t('title'))}</h1></div>
        </section>
        <button class="btn primary big" id="play">${icon.play()}<span>${esc(t('play'))}</span><small>${esc(t('day', { n: this.p.day }))}</small></button>
        <div class="tiles">
          <button class="tile ${giftOk ? 'ready' : ''}" id="gift">${icon.gift()}<span id="gift-label">${giftOk ? esc(t('giftReady')) : fmtTime(meta.giftAt - Date.now())}</span></button>
          <button class="tile ${chOk ? 'ready' : 'done'}" id="challenge">${icon.calendar()}<span>${esc(chOk ? t('challenge') : t('challengeDoneToday'))}</span></button>
          <button class="tile ad ${vipOk ? '' : 'off'}" id="vip" ${vipOk ? '' : 'disabled'}>${icon.crown()}<span>${esc(this.vipNext ? '✓' : t('callVip'))}</span>${vipOk && this.videosOk() ? `<i class="ad-badge">${icon.video()}</i>` : ''}</button>
          <button class="tile" id="book">${icon.book()}<span>${esc(t('book'))}</span></button>
          <button class="tile" id="shop">${icon.shop()}<span>${esc(t('shop'))}</span></button>
        </div>
        ${this.missionsCard()}
        <div class="settings" role="group" aria-label="${esc(t('settings'))}">
          <button class="chip" id="vib" aria-pressed="${this.save.settings.vibration}" aria-label="${esc(t('vibration'))}">${icon.vibrate()}<span>${this.save.settings.vibration ? 'ON' : 'OFF'}</span></button>
          ${Object.entries(LOCALES)
            .map(([code, l]) => `<button class="chip lang ${l.meta.code === document.documentElement.lang ? 'on' : ''}" data-lang="${code}">${esc(l.meta.name)}</button>`)
            .join('')}
          <button class="chip subtle" id="reset">${esc(t('reset'))}</button>
        </div>
      </div>`;
    this.bindMute();
    this.bindMissions(() => this.renderHub());
    $('#play', this.o.root)?.addEventListener('click', () => {
      this.sfx('tap');
      this.challenge = false;
      void this.startDay();
    });
    $('#shop', this.o.root)?.addEventListener('click', () => {
      this.sfx('tap');
      this.shopReturn = () => this.renderHub();
      this.renderShop();
    });
    $('#book', this.o.root)?.addEventListener('click', () => {
      this.sfx('tap');
      this.renderBook();
    });
    $('#gift', this.o.root)?.addEventListener('click', () => void this.openGift());
    $('#challenge', this.o.root)?.addEventListener('click', () => void this.openChallenge());
    $('#vip', this.o.root)?.addEventListener('click', () => void this.callVip());
    $('#vib', this.o.root)?.addEventListener('click', () => {
      this.save.settings.vibration = !this.save.settings.vibration;
      this.persist();
      this.buzz(30);
      this.renderHub();
    });
    this.o.root.querySelectorAll<HTMLElement>('[data-lang]').forEach((b) =>
      b.addEventListener('click', () => {
        const code = b.dataset.lang ?? 'en';
        setLanguage(code);
        this.save.settings.lang = code;
        this.persist();
        this.renderHub();
      }),
    );
    $('#reset', this.o.root)?.addEventListener('click', () => void this.confirmReset());
    // gift box countdown
    this.ticker = window.setInterval(() => {
      const label = $('#gift-label', this.o.root);
      if (!label) return clearInterval(this.ticker);
      const left = meta.giftAt - Date.now();
      if (left <= 0) {
        label.textContent = t('giftReady');
        $('#gift', this.o.root)?.classList.add('ready');
      } else label.textContent = fmtTime(left);
    }, 1000);
    void this.showRewards(events).then(() => {
      if (loginAvailable(meta, today)) void this.openLogin();
    });
  }

  private missionsCard(): string {
    const ms = this.save.meta.missions;
    return `<section class="missions" aria-label="${esc(t('missions'))}"><h3>${icon.missions()}<span>${esc(t('missions'))}</span></h3>${ms.map((m) => this.missionRow(m)).join('')}</section>`;
  }

  private missionRow(m: Mission): string {
    const pct = Math.round((m.progress / m.target) * 100);
    const text = t(`mission_${m.kind}`, { n: m.target, recipe: m.recipe ? name('recipes', m.recipe) : '' });
    const pic = m.recipe ? recipeIcon(getRecipe(m.recipe).steps) : missionIcon(m.kind);
    const reroll = this.p.gems >= REROLL_GEMS ? `<button class="reroll" data-reroll="${m.id}" aria-label="${esc(t('reroll'))}">${icon.redo()}</button>` : '';
    return `<div class="mission" data-mission="${m.kind}"><div class="m-pic">${pic}</div><div class="m-body"><div class="m-text">${esc(text)}</div>
      <div class="bar"><i style="width:${pct}%"></i><span>${m.progress}/${m.target}</span></div></div><div class="m-reward">${this.chips({ coins: m.reward.coins, gems: m.reward.gems })}</div>${reroll}</div>`;
  }

  private bindMissions(after: () => void): void {
    this.o.root.querySelectorAll<HTMLButtonElement>('[data-reroll]').forEach((b) =>
      b.addEventListener('click', () => {
        if (rerollMission(this.save.meta, this.p, b.dataset.reroll ?? '', this.rng)) {
          this.sfx('tap');
          this.persist();
          after();
        }
      }),
    );
  }

  private async confirmReset(): Promise<void> {
    const a = await this.modal(
      `<p>${esc(t('resetConfirm'))}</p><div class="row"><button class="btn" data-a="no">${esc(t('no'))}</button><button class="btn danger" data-a="yes">${esc(t('yes'))}</button></div>`,
    );
    if (a === 'yes') {
      this.save = resetProgress(this.save);
      fillMissions(this.save.meta, this.p, this.rng);
      this.persist();
      this.renderHub();
    }
  }

  // ------------------------------------------------------------------ daily rewards

  private async openLogin(): Promise<void> {
    const meta = this.save.meta;
    const today = this.today();
    if (!loginAvailable(meta, today)) return;
    const day = loginDayIndex(meta, today);
    const cells = LOGIN_REWARDS.map(
      (r, i) =>
        `<div class="cal ${i + 1 < day ? 'past' : i + 1 === day ? 'now' : ''} ${i === 6 ? 'big' : ''}"><small>${esc(t('loginDay', { n: i + 1 }))}</small><div class="reward-chips">${this.chips(r)}</div>${i + 1 < day ? `<span class="tick">${icon.check()}</span>` : ''}</div>`,
    ).join('');
    const a = await this.modal(
      `<h2>${icon.calendar()}<span>${esc(t('dailyLogin'))}</span></h2><div class="calendar">${cells}</div>
       ${this.claimRow()}`,
      'login-modal',
    );
    let mult = 1;
    if (a === 'x2' && (await this.watchVideo())) mult = 2;
    const ev = claimLogin(meta, this.p, today, mult);
    if (!ev) return;
    this.sfx('coin');
    this.toast(t('dailyLogin'), icon.calendar(), this.chips(ev.reward));
    await this.showRewards(settleBuilds(meta, this.p, Date.now()));
    this.persist();
    this.updateWallet();
  }

  /** "Claim" and the optional "×2 with a video" look exactly the same (CrazyGames rewarded-ad rule). */
  private claimRow(): string {
    const x2 = this.videosOk() ? `<button class="btn" data-a="x2">${icon.video()}<span>×2</span></button>` : '';
    return `<div class="row"><button class="btn" data-a="claim">${esc(t('claim'))}</button>${x2}</div>${this.adNote()}`;
  }

  private async openGift(): Promise<void> {
    const meta = this.save.meta;
    if (!giftReady(meta, Date.now())) {
      this.toast(fmtTime(meta.giftAt - Date.now()), icon.timer());
      return;
    }
    const a = await this.modal(
      `<div class="chest">${icon.gift()}</div><h2>${esc(t('gift'))}</h2>
       ${this.claimRow()}`,
      'gift-modal',
    );
    let mult = 1;
    if (a === 'x2' && (await this.watchVideo())) mult = 2;
    const ev = claimGift(meta, this.p, Date.now(), this.rng, mult);
    if (ev) {
      this.sfx('coin');
      this.buzz(20);
      this.toast(t('gift'), icon.gift(), this.chips(ev.reward));
    }
    this.persist();
    this.renderHub();
  }

  private async callVip(): Promise<void> {
    const meta = this.save.meta;
    if (!canUseAd(meta, 'vip', this.today())) {
      this.toast(t('dailyLimit'));
      return;
    }
    const video = this.videosOk() ? `<button class="btn" data-a="video">${icon.video()}<span>${esc(t('watchVideo'))}</span></button>` : '';
    const gems = `<button class="btn" data-a="gems" ${this.p.gems >= VIP_GEMS ? '' : 'disabled'}>${icon.gem()}<span>${VIP_GEMS}</span></button>`;
    const a = await this.modal(
      `<div class="chest">${this.guestPic('vip')}</div><h2>${esc(t('callVip'))}</h2><p class="muted-note">${esc(t('vipInfo'))}</p>
       <div class="row">${video}${gems}</div>${this.adNote()}<button class="btn subtle-btn" data-a="no">${esc(t('back'))}</button>`,
    );
    if (a === 'gems' && this.p.gems >= VIP_GEMS) this.p.gems -= VIP_GEMS;
    else if (!(a === 'video' && (await this.watchVideo()))) return;
    useAd(meta, 'vip', this.today());
    this.vipNext = true;
    this.persist();
    this.toast(t('vipComing'), icon.crown());
    this.renderHub();
  }

  private async openChallenge(): Promise<void> {
    const done = !challengeAvailable(this.save.meta, this.today());
    const a = await this.modal(
      `<h2>${icon.calendar()}<span>${esc(t('challenge'))}</span></h2>
       <p class="goal">${icon.star()}<span>${esc(t('challengeGoal', { n: CHALLENGE_STARS }))}</span> · ${icon.guest()}<span>${CHALLENGE_GUESTS}</span></p>
       <div class="reward-chips">${done ? esc(t('challengeDoneToday')) : this.chips({ coins: 120, gems: 4, xp: 40 })}</div>
       <div class="row"><button class="btn" data-a="no">${esc(t('back'))}</button><button class="btn primary" data-a="go">${icon.play()}</button></div>`,
    );
    if (a !== 'go') return;
    this.challenge = true;
    void this.startDay();
  }

  private renderPlay(): void {
    const run = this.run;
    if (!run) return;
    this.o.root.innerHTML = `
      <div class="screen play-screen">
        <header class="hud">
          ${this.challenge ? `<div class="pill" id="challenge-pill">${icon.star()}<span id="challenge-stars">0/${CHALLENGE_STARS}</span></div>` : `<div class="pill">${icon.sun()}<span>${esc(t('day', { n: run.day }))}</span></div>`}
          <div class="dots" id="dots" aria-hidden="true"></div>
          ${this.coinPill()}
          ${this.muteButton()}
        </header>
        <section class="scene" id="scene" style="--progress:0">
          ${cafeBackground(this.features())}
          <div class="guest-wrap" id="guest"></div>
          <div class="helper-badge hidden" id="helper">${icon.hammer()}</div>
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
    el.innerHTML = customer(order.look, mood, order.kind, order.special);
    el.dataset.kind = order.kind;
    el.dataset.special = order.special ?? '';
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
    const z = appZoom(); // screen px → CSS px inside the (possibly zoomed) app
    hand.style.left = `${(b.left - s.left + b.width / 2) / z - 10}px`;
    hand.style.top = `${(b.top - s.top + b.height / 2) / z - 6}px`;
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
      else await this.maybeHelper();
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
    const sp = run.order?.special;
    if (sp) {
      this.sfx('unlock');
      this.toast(t(sp), sp === 'vip' ? icon.crown() : icon.star());
    }
    await this.maybeHelper();
  }

  /** A hired helper prepares simple items (coffee, juice, croissant, toastie) by themself. */
  private async maybeHelper(): Promise<void> {
    const run = this.run;
    const item = run?.currentItem;
    if (!run || !item || this.busy || run.steps.length > 0 || !cafeEffects(this.save.meta, Date.now()).staff.includes(item.recipe)) return;
    this.busy = true;
    this.renderStation();
    const badge = $('#helper', this.o.root);
    badge?.classList.remove('hidden');
    badge?.setAttribute('aria-label', t('staffHelping'));
    this.sfx('pour', 0.8);
    await wait(this.ms(1300));
    badge?.classList.add('hidden');
    if (this.run !== run) return;
    run.autoComplete();
    this.busy = false;
    this.sfx('done');
    this.renderStation('tray');
    if (run.canServe) this.sfx('bell');
    else await this.maybeHelper();
  }

  private async serve(): Promise<void> {
    const run = this.run;
    const order = run?.order;
    if (!run || !order || this.busy || this.action || !run.canServe) return;
    this.busy = true;
    clearTimeout(this.hintTimer);
    const before = this.p.coins;
    const fx = cafeEffects(this.save.meta, Date.now());
    const mods: PayMods = { tipBonus: fx.tipBonus, bonusStations: fx.bonusStations };
    const pay = run.serve(this.watch.elapsed(), mods) as Payment;
    this.p.coins += pay.total;
    this.p.gems += pay.gems;
    this.save.stats.customers += 1;
    this.save.stats.earned += pay.total;
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
    this.showGuestReaction(order, pay.stars);
    setTimeout(() => this.sfx(pay.stars === 3 ? 'happy' : pay.stars === 2 ? 'good' : 'soft'), 150);
    this.showPayment(pay, before);
    // orders below 3★ can be upgraded on the end-of-day summary (never on the gameplay screen)
    if (pay.stars < 3) this.weakOrders.push({ items: order.items, special: order.special, pay, mods });
    await wait(this.ms(1600));
    if (this.challenge) {
      const el = $('#challenge-stars', this.o.root);
      if (el) el.textContent = `${run.summary.stars}/${CHALLENGE_STARS}`;
    }
    const events = onServed(
      this.save.meta,
      this.p,
      { recipes: order.items.map((i) => i.recipe), sizes: order.items.map((i) => i.size), stars: pay.stars, coins: pay.total, special: order.special, kind: order.kind },
      this.rng,
    );
    events.push(...settleBuilds(this.save.meta, this.p, Date.now()));
    if (pay.stars === 3) this.save.stats.perfect += 1;
    this.persist();
    this.updateWallet();
    const guest = $('#guest', this.o.root);
    if (guest) guest.className = 'guest-wrap leave';
    await wait(this.ms(450));
    $('#tray', this.o.root)?.classList.remove('served');
    await this.showRewards(events);
    this.busy = false;
    await this.nextCustomer();
  }

  private showGuestReaction(order: Order, stars: number): void {
    const guest = $('#guest', this.o.root);
    const mood: Mood = stars === 3 ? 'happy' : stars === 2 ? 'smile' : 'meh';
    if (!guest) return;
    guest.className = `guest-wrap ${stars === 3 ? 'hop' : stars === 2 ? 'nod' : ''}`;
    guest.innerHTML = customer(order.look, mood, order.kind, order.special);
    guest.dataset.stars = String(stars);
  }

  private showPayment(pay: Payment, before: number): void {
    const fx = $('#fx', this.o.root);
    if (fx) {
      const stars = Array.from({ length: 3 }, (_, i) => icon.star(i < pay.stars ? 'on' : 'off')).join('');
      const pop = document.createElement('div');
      pop.className = `pay-pop stars-${pay.stars}`;
      pop.dataset.stars = String(pay.stars);
      pop.innerHTML = `<div class="stars-row">${stars}</div><div class="pay-amount">+${pay.total} ${icon.coin()}</div>${pay.tip ? `<div class="pay-tip">${icon.jar()}+${pay.tip}</div>` : ''}${pay.gems ? `<div class="pay-tip">${icon.gem()}+${pay.gems}</div>` : ''}`;
      fx.appendChild(pop);
      setTimeout(() => pop.remove(), 1700);
      if (!this.reduced) {
        const target = $('#coins', this.o.root)?.getBoundingClientRect();
        const origin = fx.getBoundingClientRect();
        for (let i = 0; i < Math.min(8, 2 + Math.floor(pay.total / 4)); i++) {
          const c = document.createElement('div');
          c.className = 'fly-coin';
          c.innerHTML = icon.coin();
          const z = appZoom();
          const sx = origin.width / z / 2 + (i % 3) * 14 - 14;
          const sy = (origin.height / z) * 0.45;
          c.style.left = `${sx}px`;
          c.style.top = `${sy}px`;
          if (target) {
            c.style.setProperty('--tx', `${(target.left + target.width / 2 - origin.left) / z - sx - 14}px`);
            c.style.setProperty('--ty', `${(target.top + target.height / 2 - origin.top) / z - sy - 14}px`);
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

  // ------------------------------------------------------------------ day flow

  private async startDay(): Promise<void> {
    clearInterval(this.ticker);
    const meta = this.save.meta;
    const fx = cafeEffects(meta, Date.now());
    startDayMeta(meta);
    if (this.challenge) {
      const today = this.today();
      this.run = new DayRun(this.p.day, this.p.recipes, mulberry32(challengeSeed(today)), undefined, guestOptions(meta), 0, CHALLENGE_GUESTS);
    } else {
      this.seed = (this.seed + 0x9e3779b9) >>> 0;
      this.run = new DayRun(this.p.day, this.p.recipes, mulberry32(this.seed ^ this.p.day), this.preferNext ?? undefined, guestOptions(meta, this.vipNext ? 'vip' : null), fx.extraGuests);
      this.preferNext = null;
      this.vipNext = false;
    }
    this.persist();
    this.lastSummaryDoubled = false;
    this.weakOrders = [];
    this.renderPlay();
    this.sfx('day');
    const banner = document.createElement('div');
    banner.className = 'day-banner';
    banner.innerHTML = this.challenge
      ? `${icon.calendar()}<span>${esc(t('challengeGoal', { n: CHALLENGE_STARS }))}</span>`
      : `${icon.sun()}<span>${esc(t('day', { n: this.p.day }))}</span>`;
    $('.scene', this.o.root)?.appendChild(banner);
    await wait(this.ms(this.challenge ? 1400 : 900));
    banner.remove();
    this.gameplay.start();
    await this.nextCustomer();
  }

  private endDay(): void {
    const run = this.run;
    if (!run) return;
    this.gameplay.stop();
    clearTimeout(this.hintTimer);
    if (this.challenge) {
      this.challengeResult = finishChallenge(this.save.meta, this.p, this.today(), run.summary.stars);
      this.dayChestEvents = [];
    } else {
      this.p.day = run.day + 1;
      this.save.stats.days += 1;
      this.dayChestEvents = claimDayChest(this.save.meta, this.p, run.day, run.summary.served, run.summary.perfect);
    }
    this.persist();
    this.renderSummary();
    void this.showRewards([...this.dayChestEvents, ...(this.challengeResult ?? [])].filter((e) => e.source === 'level'));
  }

  private renderSummary(): void {
    const run = this.run;
    if (!run) return;
    const s = run.summary;
    const ch = this.challenge;
    const won = ch && (this.challengeResult?.length ?? 0) > 0;
    const chest = dayChest(s.served, s.perfect);
    this.o.root.innerHTML = `
      <div class="screen summary-screen">
        <header class="hud">${this.levelPill()}${this.coinPill()}${this.gemPill()}${this.muteButton()}</header>
        <section class="summary-card">
          <div class="sunset">${ch ? icon.calendar() : icon.sun()}</div>
          <h2>${esc(ch ? (won ? t('challengeWon') : t('challenge')) : t('dayDone', { n: s.day }))}</h2>
          ${ch ? `<p class="goal ${won ? 'won' : ''}" id="challenge-result">${icon.star()}<b>${s.stars}</b>/<span>${CHALLENGE_STARS}</span></p>${won ? '' : `<p class="muted-note">${esc(t('challengeLost'))}</p>`}` : ''}
          <ul class="stats">
            <li>${icon.guest()}<span>${esc(t('served'))}</span><b>${s.served}</b></li>
            <li>${icon.coin()}<span>${esc(t('earnedBase'))}</span><b>${s.base}</b></li>
            <li>${icon.jar()}<span>${esc(t('earnedTips'))}</span><b>${s.tips}</b></li>
            <li>${icon.star()}<span>${esc(t('perfect'))}</span><b>${s.perfect}</b></li>
            ${s.gems ? `<li>${icon.gem()}<span>${esc(t('gems'))}</span><b>${s.gems}</b></li>` : ''}
          </ul>
          ${!ch ? `<div class="day-bonus">${icon.gift()}<span>${esc(t('dayBonus'))}</span><div class="reward-chips">${this.chips(chest)}</div></div>` : won ? `<div class="day-bonus">${icon.gift()}<div class="reward-chips">${this.chips({ coins: 120, gems: 4, xp: 40 })}</div></div>` : ''}
          <div class="total">${icon.coin()}<span>${esc(t('total'))}</span><b id="day-total">+${s.earned * (this.lastSummaryDoubled ? 2 : 1)}</b></div>
        </section>
        ${this.missionsCard()}
        <div class="menu">
          ${s.earned > 0 && !this.lastSummaryDoubled && this.videosOk() ? `<button class="btn" id="double">${icon.video()}<span>${esc(t('double'))}</span><b>×2</b></button>` : ''}
          ${this.redoOffer()}
          ${this.adNote()}
          <div class="row">
            <button class="btn" id="hub">${icon.back()}<span>${esc(t('toCafe'))}</span></button>
            <button class="btn" id="shop">${icon.shop()}<span>${esc(t('shop'))}</span></button>
          </div>
          ${ch ? '' : `<button class="btn primary big" id="next">${icon.next()}<span>${esc(t('nextDay'))}</span></button>`}
        </div>
      </div>`;
    this.bindMute();
    this.bindMissions(() => this.renderSummary());
    $('#double', this.o.root)?.addEventListener('click', () => void this.doubleCoins());
    $('#redo-video', this.o.root)?.addEventListener('click', () => void this.redoWeakest('video'));
    $('#redo-gems', this.o.root)?.addEventListener('click', () => void this.redoWeakest('gems'));
    $('#hub', this.o.root)?.addEventListener('click', () => {
      this.sfx('tap');
      this.leaveSummary(() => this.renderHub());
    });
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
    if (!(await this.watchVideo())) {
      this.renderSummary();
      return;
    }
    this.lastSummaryDoubled = true;
    this.p.coins += run.summary.earned;
    this.persist();
    this.sfx('coin');
    this.toast(t('doubled'), icon.coin());
    this.renderSummary();
  }

  /** "Make one order 3★": the weakest order of the day, with a video or gems (alternative). */
  private redoOffer(): string {
    if (!this.weakOrders.length || !canUseAd(this.save.meta, 'redo', this.today())) return '';
    const video = this.videosOk() ? `<button class="btn" id="redo-video">${icon.video()}<span>${esc(t('redo3'))}</span></button>` : '';
    const gems = `<button class="btn" id="redo-gems" ${this.p.gems >= REDO_GEMS ? '' : 'disabled'}>${icon.gem()}<span>${REDO_GEMS} · ${esc(t('redo3'))}</span></button>`;
    return `<div class="row redo-row">${video}${gems}</div>`;
  }

  private async redoWeakest(how: 'video' | 'gems'): Promise<void> {
    const run = this.run;
    if (!run || !this.weakOrders.length) return;
    // the order that gains the most
    const scored = this.weakOrders.map((w) => ({ w, extra: DayRun.upgradeTo3(w.pay, w.items, { ...w.mods, special: w.special }) }));
    scored.sort((a, b) => b.extra.total - a.extra.total);
    const best = scored[0];
    if (!best) return;
    if (how === 'gems') {
      if (this.p.gems < REDO_GEMS) return;
      this.p.gems -= REDO_GEMS;
    } else {
      this.o.root.querySelectorAll<HTMLButtonElement>('.redo-row button').forEach((b) => (b.disabled = true));
      if (!(await this.watchVideo())) {
        this.renderSummary();
        return;
      }
    }
    useAd(this.save.meta, 'redo', this.today());
    this.weakOrders.splice(this.weakOrders.indexOf(best.w), 1);
    const e = best.extra;
    this.p.coins += e.total;
    this.p.gems += e.gems;
    run.summary.base += e.paid;
    run.summary.tips += e.tip;
    run.summary.earned += e.total;
    run.summary.gems += e.gems;
    run.summary.perfect += 1;
    this.save.stats.perfect += 1;
    this.persist();
    this.sfx('happy');
    this.toast(t('redoDone'), icon.star(), this.chips({ coins: e.total, gems: e.gems }));
    this.renderSummary();
  }

  /** Midgame ads only at the transition to the next day (never on a navigation button). */
  private async goNextDay(): Promise<void> {
    const completed = this.p.day - 1;
    this.o.root.querySelectorAll<HTMLButtonElement>('.menu button').forEach((b) => (b.disabled = true));
    if (midgameAllowed(completed, this.throttle)) {
      this.gameplay.stop();
      await this.o.platform.midgame();
      this.throttle.markShown();
    }
    this.leaveSummary(() => void this.startDay());
  }

  private leaveSummary(next: () => void): void {
    this.challenge = false;
    this.challengeResult = null;
    next();
  }

  // ------------------------------------------------------------------ shop

  private renderShop(): void {
    clearInterval(this.ticker);
    const tabs: ShopTab[] = ['recipes', 'equipment', 'decor', 'cafe'];
    const tabIcon: Record<ShopTab, string> = { recipes: icon.recipes(), equipment: icon.equipment(), decor: icon.decor(), cafe: icon.hammer() };
    this.o.root.innerHTML = `
      <div class="screen shop-screen">
        <header class="hud"><button class="icon-btn" id="back" aria-label="${esc(t('back'))}">${icon.back()}</button><h2 class="hud-title">${esc(t('shop'))}</h2>${this.coinPill()}${this.gemPill()}</header>
        <div class="tabs four" role="tablist">
          ${tabs.map((k) => `<button role="tab" class="tab ${k === this.shopTab ? 'on' : ''}" aria-selected="${k === this.shopTab}" data-tab="${k}">${tabIcon[k]}<span>${esc(t(k))}</span></button>`).join('')}
        </div>
        ${this.shopTab === 'decor' || this.shopTab === 'cafe' ? `<div class="decor-preview">${cafeBackground(this.features())}<div class="counter-wrap">${counter(this.p.decor)}</div></div>` : ''}
        ${this.adNote()}
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
    if (this.shopTab === 'cafe' && Object.values(this.save.meta.built).some((at) => at > Date.now())) {
      this.ticker = window.setInterval(() => {
        if (!$('.shop-screen', this.o.root)) return clearInterval(this.ticker);
        this.o.root.querySelectorAll<HTMLElement>('[data-left]').forEach((el) => {
          const left = Number(el.dataset.left) - Date.now();
          el.textContent = fmtTime(left);
          if (left <= 0) {
            clearInterval(this.ticker);
            void this.showRewards(settleBuilds(this.save.meta, this.p, Date.now())).then(() => {
              this.persist();
              if ($('.shop-screen', this.o.root)) this.renderShop();
            });
          }
        });
      }, 1000);
    }
  }

  private priceButton(kind: string, id: string, cost: number, affordable: boolean, currency: 'coin' | 'gem' = 'coin'): string {
    return `<button class="buy ${affordable ? '' : 'short'} ${currency}" data-buy="${kind}" data-id="${id}" ${affordable ? '' : 'disabled'}>${currency === 'gem' ? icon.gem() : icon.coin()}<span>${cost}</span></button>`;
  }

  private shopCards(): string {
    const p = this.p;
    const meta = this.save.meta;
    const now = Date.now();
    if (this.shopTab === 'recipes') {
      const next = nextLockedRecipe(p);
      const canAd = canUseAd(meta, 'unlock', this.today());
      const sorted = [...RECIPES].sort((a, b) => Number(p.recipes.includes(a.id)) - Number(p.recipes.includes(b.id)) || a.level - b.level);
      return sorted
        .map((r) => {
          const st = recipeStatus(p, r.id);
          let action: string;
          if (st === 'owned') action = `<span class="badge-owned">${icon.check()}</span>`;
          else {
            const gems = recipeGemCost(r.id);
            action = `<span class="badge-locked">${icon.lock()}<span>${esc(t('level', { n: r.level }))}</span></span>` + this.priceButton('recipe', r.id, gems, p.gems >= gems, 'gem');
            if (r.id === next && canAd && this.videosOk()) action += `<button class="buy video" data-buy="recipe-ad" data-id="${r.id}">${icon.video()}<span>${esc(t('unlockNow'))}</span></button>`;
          }
          return `<div class="card ${st}" data-recipe="${r.id}"><div class="card-pic">${recipeIcon(r.steps)}</div><div class="card-name">${esc(name('recipes', r.id))}</div><div class="card-action">${action}</div></div>`;
        })
        .join('');
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
    if (this.shopTab === 'decor') {
      return DECOR.map((d) => {
        const owned = p.decor.includes(d.id);
        const action = owned
          ? `<span class="badge-owned">${icon.check()}</span>`
          : d.gems
            ? this.priceButton('decor', d.id, d.gems, p.gems >= d.gems, 'gem')
            : this.priceButton('decor', d.id, d.cost, p.coins >= d.cost);
        return `<div class="card ${owned ? 'owned' : ''} ${d.gems ? 'premium' : ''}"><div class="card-pic decor-pic">${decorIcon(d.id)}</div><div class="card-name">${esc(name('decor', d.id))}</div><div class="card-action">${action}</div></div>`;
      }).join('');
    }
    return EXPANSIONS.map((e) => {
      const st = expansionStatus(meta, p, e.id, now);
      const info = e.staff ? name('expansionInfo', 'staff') : e.theme ? name('expansionInfo', 'theme') : e.guests ? name('expansionInfo', 'guests') : e.tip ? name('expansionInfo', 'tip').replace('{n}', String(Math.round(e.tip * 100))) : e.stations ? name('expansionInfo', 'stations') : name('expansionInfo', 'counter');
      let action: string;
      if (st === 'built') action = `<span class="badge-owned">${icon.check()}</span>`;
      else if (st === 'building') {
        const at = meta.built[e.id] ?? now;
        const gems = skipCost(meta, e.id, now);
        action = `<span class="build-timer">${icon.timer()}<span data-left="${at}">${fmtTime(at - now)}</span></span>
          ${this.videosOk() ? `<button class="buy video" data-buy="finish-ad" data-id="${e.id}">${icon.video()}<span>${esc(t('finishNow'))}</span></button>` : ''}
          ${this.priceButton('finish-gems', e.id, gems, p.gems >= gems, 'gem')}`;
      } else if (st === 'locked') {
        action =
          meta.level < e.level
            ? `<span class="badge-locked">${icon.lock()}<span>${esc(t('level', { n: e.level }))}</span></span>`
            : `<span class="badge-locked">${icon.lock()}<span>${esc(t('needs', { name: name('expansions', e.requires ?? '') }))}</span></span>`;
      } else {
        const prices = [e.coins ? `${icon.coin()}<span>${e.coins}</span>` : '', e.gems ? `${icon.gem()}<span>${e.gems}</span>` : ''].join('');
        action = `<button class="buy ${st === 'buyable' ? '' : 'short'}" data-buy="build" data-id="${e.id}" ${st === 'buyable' ? '' : 'disabled'}>${prices}${e.minutes ? `<small>${icon.timer()}${e.minutes}′</small>` : ''}</button>`;
      }
      return `<div class="card ${st}" data-expansion="${e.id}"><div class="card-pic decor-pic">${expansionIcon(e.id)}</div><div class="card-name">${esc(name('expansions', e.id))}</div><div class="card-info">${esc(info)}</div><div class="card-action">${action}</div></div>`;
    }).join('');
  }

  private async buy(b: HTMLButtonElement): Promise<void> {
    const kind = b.dataset.buy;
    const id = b.dataset.id ?? '';
    const p = this.p;
    const meta = this.save.meta;
    const now = Date.now();
    let ok = false;
    if (kind === 'recipe') {
      ok = buyRecipeWithGems(p, id);
      if (ok) {
        this.preferNext = id;
        this.celebrateRecipe(id);
      }
    } else if (kind === 'recipe-ad') {
      b.disabled = true;
      if (await this.watchVideo()) {
        useAd(meta, 'unlock', this.today());
        ok = grantRecipe(p, id);
        if (ok) {
          this.preferNext = id;
          this.celebrateRecipe(id);
        }
      }
    } else if (kind === 'machine') {
      ok = isMachine(id) && buyEquipment(p, id);
    } else if (kind === 'decor') {
      ok = buyDecor(p, id);
    } else if (kind === 'build') {
      ok = startBuild(meta, p, id, now);
    } else if (kind === 'finish-ad') {
      b.disabled = true;
      if (await this.watchVideo()) ok = finishBuild(meta, p, id, Date.now(), false);
    } else if (kind === 'finish-gems') {
      ok = finishBuild(meta, p, id, now, true);
    }
    if (ok) {
      if (kind !== 'recipe' && kind !== 'recipe-ad') {
        this.sfx('unlock');
        this.buzz(20);
      }
      const events = settleBuilds(meta, p, Date.now());
      this.persist();
      this.renderShop();
      await this.showRewards(events);
      return;
    }
    if (kind !== 'recipe-ad' && kind !== 'finish-ad') this.sfx('oops');
    if (b.isConnected) b.disabled = false;
  }

  private celebrateRecipe(id: string): void {
    this.o.platform.happytime();
    this.sfx('unlock');
    this.buzz([20, 40, 20]);
    this.toast(`${t('newRecipe')} ${name('recipes', id)}`, recipeIcon(getRecipe(id).steps));
  }

  // ------------------------------------------------------------------ book (stickers & achievements)

  private renderBook(): void {
    clearInterval(this.ticker);
    const meta = this.save.meta;
    const body =
      this.bookTab === 'stickers'
        ? `<div class="stickers">${STICKERS.map((id) => {
            const n = meta.stickers[id] ?? 0;
            return `<div class="sticker ${n ? 'got' : 'missing'}" data-sticker="${id}"><div class="sticker-pic">${this.guestPic(id)}</div><b>${esc(n ? name('guests', id) : '?')}</b><small>${n ? `×${n}` : esc(t('level', { n: CUSTOMER_LEVEL[id] }))}</small></div>`;
          }).join('')}</div>`
        : `<div class="achievements">${ACHIEVEMENTS.map((a) => {
            const done = meta.achievements.includes(a.id);
            const v = Math.min(a.goal, a.value(meta, this.p));
            return `<div class="achievement ${done ? 'done' : ''}" data-achievement="${a.id}"><div class="a-pic">${icon.trophy()}</div><div class="m-body"><div class="m-text">${esc(name('achievements', a.id))}</div><div class="bar"><i style="width:${Math.round((v / a.goal) * 100)}%"></i><span>${v}/${a.goal}</span></div></div><div class="m-reward">${done ? `<span class="badge-owned">${icon.check()}</span>` : this.chips({ gems: a.gems })}</div></div>`;
          }).join('')}</div>`;
    this.o.root.innerHTML = `
      <div class="screen book-screen">
        <header class="hud"><button class="icon-btn" id="back" aria-label="${esc(t('back'))}">${icon.back()}</button><h2 class="hud-title">${esc(t('book'))}</h2>${this.gemPill()}</header>
        <div class="tabs" role="tablist">
          <button role="tab" class="tab ${this.bookTab === 'stickers' ? 'on' : ''}" data-book="stickers">${icon.book()}<span>${esc(t('stickers'))}</span></button>
          <button role="tab" class="tab ${this.bookTab === 'achievements' ? 'on' : ''}" data-book="achievements">${icon.trophy()}<span>${esc(t('achievements'))}</span></button>
        </div>
        ${body}
      </div>`;
    $('#back', this.o.root)?.addEventListener('click', () => this.renderHub());
    this.o.root.querySelectorAll<HTMLElement>('[data-book]').forEach((b) =>
      b.addEventListener('click', () => {
        this.bookTab = (b.dataset.book as BookTab) ?? 'stickers';
        this.renderBook();
      }),
    );
  }
}

function missionIcon(kind: Mission['kind']): string {
  if (kind === 'vip') return icon.crown();
  if (kind === 'perfect' || kind === 'perfect_streak' || kind === 'stars') return icon.star();
  if (kind === 'earn_today') return icon.coin();
  if (kind === 'large') return drawItem({ steps: ['cup', 'coffee', 'milk', 'foam'], size: 'L' });
  if (kind === 'combo') return recipeIcon(getRecipe('croissant').steps);
  return icon.guest();
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
