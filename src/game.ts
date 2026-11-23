type Point = { x: number; y: number };
const enemies = {
  orc: { speed: 69, health: 1, damage: 7, points: 100, radius: 24, color: 0xb7c878 },
  runner: { speed: 113, health: 1, damage: 7, points: 150, radius: 20, color: 0xf28e68 },
  armored: { speed: 58, health: 3, damage: 11, points: 250, radius: 27, color: 0x9abbd5 },
  chief: { speed: 56, health: 6, damage: 18, points: 750, radius: 33, color: 0xe2a6fb }
};
type EnemyKind = keyof typeof enemies;
type Shadow = Point & { kind: EnemyKind; health: number; speed: number; attack: number; hitUntil: number };
type Level = { duration: number; interval: number; waves: EnemyKind[][]; threat: string; palette: [number, number, number, number]; chief?: boolean };
const levels: Level[] = [
  { duration: 45, interval: 2.2, waves: [['orc']], threat: 'Orklar Işık Ağacı’na yaklaşıyor.', palette: [0x142522, 0x101c27, 0x0c1716, 0x19322b] },
  { duration: 50, interval: 1.9, waves: [['orc'], ['runner'], ['orc']], threat: 'Hızlı orklar aramıza karıştı.', palette: [0x233128, 0x242537, 0x10201e, 0x343d26] },
  { duration: 55, interval: 1.7, waves: [['orc'], ['runner'], ['armored'], ['orc']], threat: 'Zırhlı orklar geliyor. Büyücü savunmaya katıldı.', palette: [0x21303e, 0x2e2946, 0x171f2b, 0x233f42] },
  { duration: 60, interval: 1.5, waves: [['orc', 'runner'], ['armored', 'orc'], ['orc', 'orc'], ['runner', 'orc']], threat: 'Orklar birden fazla kenardan saldırıyor.', palette: [0x382b31, 0x422f27, 0x1f1d25, 0x462f26] },
  { duration: 65, interval: 1.3, waves: [['armored', 'runner'], ['orc', 'runner'], ['armored', 'orc'], ['runner', 'orc', 'orc']], chief: true, threat: 'Ork şefi son 25 saniyede ortaya çıkacak.', palette: [0x3c233d, 0x46252d, 0x221627, 0x4d2d3e] }
];
const bonuses = [
  { kind: 'shield', label: 'Altın tohum', color: 0xffd578 },
  { kind: 'heal', label: 'Şifa özü', color: 0x93f6b0 },
  { kind: 'rapid', label: 'Hızlı atış rünü', color: 0x9cceff }
] as const;
type Pickup = Point & { bonus: typeof bonuses[number]; expiresAt: number };
type Arrow = Point & { vx: number; vy: number; life: number; magic?: boolean };
type Spark = Arrow & { color: number };
type Companion = { kind: 'archer' | 'wizard'; position: Point; heading: number; nextShot: number };

function element<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

const start = element<HTMLButtonElement>('start');
const arena = element('arena');
const pause = element<HTMLButtonElement>('pause');
const overlay = element('overlay');
const loading = element('loading');
const levelTransition = element('level-transition');
const levelNumber = element('level-number');
const title = element('title');
const message = element('message');
const hud = element('hud');
const health = element<HTMLProgressElement>('health');
const time = element('time');
const score = element('score');
const effects = element('effects');
const notice = element('notice');
const transitionTitle = element('transition-title');
const transitionMessage = element('transition-message');
const continueLevel = element<HTMLButtonElement>('continue-level');
const recordKey = 'orman-muhafizi.rekor';
const formatScore = new Intl.NumberFormat('tr-TR');
function loadRecord() {
  try {
    const value = Number(localStorage.getItem(recordKey));
    return Number.isSafeInteger(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}
const stick = element('stick');
const thumb = stick.querySelector('i')!;
const field = element('field');
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

const introMusic = element<HTMLAudioElement>('intro-music');
const gameMusic = element<HTMLAudioElement>('game-music');
const firstLevelMusic = gameMusic.src;
const musicToggle = element<HTMLButtonElement>('music-toggle');

function setupIntroMusic() {
  let enabled = true;

  const updateLabel = () => {
    const label = enabled ? 'Müziği kapat' : 'Müziği aç';
    musicToggle.dataset.playing = String(enabled);
    musicToggle.setAttribute('aria-label', label);
    musicToggle.title = label;
  };
  const play = () => {
    if (enabled && introMusic.paused) {
      void introMusic.play().catch(() => {
        // The next interaction can unlock playback.
      });
    }
  };

  introMusic.volume = .45;
  introMusic.addEventListener('error', () => {
    musicToggle.setAttribute('aria-label', 'Müzik yüklenemedi');
    musicToggle.title = 'Müzik yüklenemedi';
    musicToggle.disabled = true;
  });

  musicToggle.addEventListener('click', () => {
    enabled = introMusic.paused;
    updateLabel();
    if (enabled) play();
    else introMusic.pause();
  });

  const playAfterInteraction = (event: Event) => {
    if (event.target instanceof Element && event.target.closest('#music-toggle, #start')) return;
    play();
  };
  document.addEventListener('click', playAfterInteraction);
  document.addEventListener('keydown', playAfterInteraction);
  start.addEventListener('click', () => {
    introMusic.pause();
    musicToggle.hidden = true;
    document.removeEventListener('click', playAfterInteraction);
    document.removeEventListener('keydown', playAfterInteraction);
  }, { once: true });
  updateLabel();
  play();
}

setupIntroMusic();

class Forest extends Phaser.Scene {
  private art!: Phaser.GameObjects.Graphics;
  private walking = false;
  private heading = 0;
  private keys = new Set<string>();
  private player: Point = { x: 0, y: 0 };
  private tree: Point = { x: 0, y: 0 };
  private queuedShot: Point | null = null;
  private pointer: Point | null = null;
  private firing = false;
  private touch: { id: number; origin: Point; current: Point; dragged: boolean } | null = null;
  private aimTouch: { id: number; target: Point } | null = null;
  private mode: 'intro' | 'playing' | 'paused' | 'transition' | 'done' = 'intro';
  private shadows: Shadow[] = [];
  private arrows: Arrow[] = [];
  private companions: Companion[] = [];
  private sparks: Spark[] = [];
  private scorePopups = new Set<Phaser.GameObjects.Text>();
  private pickup: Pickup | null = null;
  private elapsed = 0;
  private level = 1;
  private levelStarted = 0;
  private wave = 0;
  private chiefSpawned = false;
  private bonusIndex = 0;
  private points = 0;
  private record = loadRecord();
  private rapidUntil = 0;
  private noticeUntil = 0;

  private get currentLevel() {
    return levels[this.level - 1];
  }
  private nextShadow = 1;
  private nextBonus = 7;
  private nextShot = 0;
  private protectedUntil = 0;
  private vitality = 100;
  private cleared = 0;
  private floor: Point[] = [];

  preload() {
    this.load.audio('arrow-swish', './ok-efekti.mp3');
  }

  create() {
    this.art = this.add.graphics();
    const random = new Phaser.Math.RandomDataGenerator(['muhafiz']);
    this.floor = Array.from({ length: 270 }, () => ({ x: random.frac(), y: random.frac() }));
    this.place();
    this.scale.on('resize', () => this.place());
    gameMusic.volume = .35;
    start.disabled = false;
    start.addEventListener('click', () => {
      if (this.mode !== 'paused') this.reset();
      this.resume();
      if (window.matchMedia('(any-pointer: coarse)').matches && document.fullscreenEnabled && !document.fullscreenElement) {
        void arena.requestFullscreen().catch(() => {
          // The arena still fills the available viewport.
        });
      }
    });
    continueLevel.addEventListener('click', () => {
      if (this.mode !== 'transition') return;
      levelTransition.hidden = true;
      this.resume();
    });
    field.tabIndex = -1;
    pause.addEventListener('click', () => this.suspend());
    window.addEventListener('blur', () => this.suspend());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.suspend(); });
    window.addEventListener('keydown', event => {
      if (event.code === 'Escape' && this.mode === 'playing') this.suspend();
      if (this.mode !== 'playing' || event.target instanceof HTMLButtonElement) return;
      if (/^(Arrow(Up|Down|Left|Right)|Key[WASD])$/.test(event.code)) {
        event.preventDefault();
        this.keys.add(event.code);
      }
    });
    window.addEventListener('keyup', event => this.keys.delete(event.code));
    const positionInField = (event: PointerEvent): Point => {
      const bounds = field.getBoundingClientRect();
      return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    };
    field.addEventListener('pointerdown', event => {
      if (this.mode !== 'playing') return;
      if (event.pointerType === 'touch') {
        if (this.touch || this.aimTouch) {
          if (this.aimTouch) return;
          this.aimTouch = { id: event.pointerId, target: positionInField(event) };
          this.queuedShot = this.aimTouch.target;
          field.setPointerCapture(event.pointerId);
          return;
        }
        const origin = positionInField(event);
        this.touch = { id: event.pointerId, origin, current: origin, dragged: false };
        stick.style.left = origin.x + 'px';
        stick.style.top = origin.y + 'px';
        thumb.style.transform = '';
      } else {
        if (event.button !== 0) return;
        this.firing = true;
        this.pointer = positionInField(event);
        this.queuedShot = this.pointer;
      }
      field.setPointerCapture(event.pointerId);
    });
    field.addEventListener('pointermove', event => {
      const position = positionInField(event);
      if (this.touch?.id === event.pointerId) {
        this.touch.current = position;
        this.touch.dragged ||= distance(this.touch.origin, position) >= 10;
        stick.hidden = !this.touch.dragged;
      }
      if (this.aimTouch?.id === event.pointerId) this.aimTouch.target = position;
      if (event.pointerType !== 'touch') this.pointer = position;
    });
    const release = (event: PointerEvent) => {
      if (this.touch?.id === event.pointerId) {
        const position = positionInField(event);
        if (event.type === 'pointerup' && !this.aimTouch && !this.touch.dragged && distance(this.touch.origin, position) < 10) {
          this.queuedShot = position;
        }
        this.touch = null;
        stick.hidden = true;
      }
      if (this.aimTouch?.id === event.pointerId) {
        this.aimTouch = null;
        if (event.type !== 'pointerup') this.queuedShot = null;
      }
      if (event.pointerType !== 'touch') this.firing = false;
    };
    field.addEventListener('pointerup', release);
    field.addEventListener('pointercancel', release);
    field.addEventListener('lostpointercapture', release);
    loading.hidden = true;
    overlay.hidden = false;
    musicToggle.hidden = false;
  }

  private place() {
    const { width, height } = this.scale;
    this.tree = { x: width / 2, y: height * .53 };
    if (this.mode === 'intro') this.player = { x: width / 2, y: height * .72 };
    this.player.x = Phaser.Math.Clamp(this.player.x, 18, width - 18);
    this.player.y = Phaser.Math.Clamp(this.player.y, 18, height - 18);
    if (this.pickup) {
      this.pickup.x = Phaser.Math.Clamp(this.pickup.x, 24, Math.max(24, width - 24));
      this.pickup.y = Phaser.Math.Clamp(this.pickup.y, 24, Math.max(24, height - 24));
    }
  }

  private reset() {
    if (gameMusic.src !== firstLevelMusic) gameMusic.src = firstLevelMusic;
    gameMusic.currentTime = 0;
    this.elapsed = this.nextShot = this.protectedUntil = this.cleared = 0;
    this.level = 1;
    this.levelStarted = this.wave = this.points = this.bonusIndex = this.rapidUntil = this.noticeUntil = 0;
    this.chiefSpawned = false;
    this.nextShadow = 1;
    this.nextBonus = 7;
    this.vitality = 100;
    this.shadows = [];
    this.arrows = [];
    this.companions = [];
    this.sparks = [];
    this.clearPopups();
    this.pickup = null;
    this.player = { x: this.tree.x, y: this.scale.height * .72 };
    this.heading = 0;
    this.queuedShot = null;
    this.pointer = null;
    this.walking = false;
    this.status();
  }

  private clearPopups() {
    for (const popup of this.scorePopups) {
      this.tweens.killTweensOf(popup);
      popup.destroy();
    }
    this.scorePopups.clear();
  }

  private resume() {
    this.mode = 'playing';
    this.playGameMusic();
    pause.disabled = false;
    overlay.hidden = true;
    field.focus({ preventScroll: true });
  }

  private clearInput() {
    this.keys.clear();
    this.walking = false;
    this.firing = false;
    this.queuedShot = null;
    this.touch = null;
    this.aimTouch = null;
    stick.hidden = true;
  }

  private display(heading: string, body: string, action: string) {
    gameMusic.pause();
    this.clearInput();
    pause.disabled = true;
    title.textContent = heading;
    message.textContent = body;
    start.textContent = action;
    overlay.hidden = false;
    if (!document.hidden && document.hasFocus()) start.focus();
  }

  private suspend() {
    if (this.mode !== 'playing') return;
    this.mode = 'paused';
    this.display('Oyun duraklatıldı', 'Hazır olduğunda ışık ağacını korumaya devam edebilirsin.', 'Devam et');
  }

  private finish(won: boolean) {
    this.mode = 'done';
    this.companions = [];
    this.pickup = null;
    this.protectedUntil = this.rapidUntil = this.noticeUntil = 0;
    if (this.points > this.record) {
      this.record = this.points;
      try {
        localStorage.setItem(recordKey, String(this.record));
      } catch {
        // The scene keeps the record for this session.
      }
    }
    this.status();
    this.display(won ? 'Orman güvende!' : 'Ağacın ışığı söndü',
      `${formatScore.format(this.points)} puan · Seviye ${this.level}/${levels.length} · ${this.cleared} ork yenildi · Rekor ${formatScore.format(this.record)}`,
      'Yeniden oyna');
  }

  private status() {
    const remaining = Math.max(0, Math.ceil(this.currentLevel.duration - (this.elapsed - this.levelStarted)));
    time.textContent = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
    levelNumber.textContent = `${this.level}/${levels.length}`;
    health.value = Math.max(0, this.vitality);
    score.textContent = formatScore.format(this.points);
    const active = [];
    if (this.protectedUntil > this.elapsed) active.push(`Kalkan ${Math.ceil(this.protectedUntil - this.elapsed)} sn`);
    if (this.rapidUntil > this.elapsed) active.push(`Hızlı atış ${Math.ceil(this.rapidUntil - this.elapsed)} sn`);
    effects.textContent = active.join(' · ');
    effects.hidden = !active.length;
    notice.hidden = this.elapsed >= this.noticeUntil;
  }

  update(clock: number, delta: number) {
    if (this.mode === 'playing') this.step(Math.min(.05, delta / 1000));
    this.paint(clock / 1000);
  }

  private playGameMusic() {
    void gameMusic.play().catch(() => {
      // Gameplay remains available if audio playback fails.
    });
  }

  private advanceLevel() {
    this.mode = 'transition';
    this.level++;
    this.levelStarted = this.elapsed;
    this.wave = 0;
    this.chiefSpawned = false;
    if (this.level === 3) this.recruit('wizard');
    if (this.level === 2) gameMusic.src = './ikinci-seviye-muzigi.mp3';
    gameMusic.pause();
    this.nextShadow = this.elapsed + 1.2;
    this.nextBonus = this.elapsed + 7;
    this.nextShot = this.elapsed;
    this.protectedUntil = this.rapidUntil = this.noticeUntil = 0;
    this.pickup = null;
    this.vitality = Math.min(100, this.vitality + 20);
    this.shadows = [];
    this.arrows = [];
    this.sparks = [];
    this.clearPopups();
    this.clearInput();
    pause.disabled = true;
    this.status();
    transitionTitle.textContent = `Seviye ${this.level}`;
    transitionMessage.textContent = this.currentLevel.threat;
    levelTransition.hidden = false;
    continueLevel.focus({ preventScroll: true });
  }

  private recruit(kind: Companion['kind']) {
    this.companions.push({
      kind, position: this.companionPosition(kind === 'wizard' ? -1 : 1),
      heading: this.heading, nextShot: this.elapsed
    });
  }

  private spawnEnemy(kind: EnemyKind, edge: number) {
    const { width, height } = this.scale;
    const position = .12 + Math.random() * .76;
    const margin = enemies[kind].radius + 8;
    const x = edge === 1 ? width + margin : edge === 3 ? -margin : width * position;
    const y = edge === 0 ? -margin : edge === 2 ? height + margin : height * position;
    const { speed, health } = enemies[kind];
    this.shadows.push({ kind, x, y, speed: speed + (this.level - 1) * 3, health, attack: 0, hitUntil: 0 });
  }

  private updatePickup() {
    if (!this.pickup && this.elapsed >= this.nextBonus) {
      const { width, height } = this.scale;
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.min(width, height) * .29;
      const top = hud.offsetTop + hud.offsetHeight + 24;
      this.pickup = {
        x: Phaser.Math.Clamp(this.tree.x + Math.cos(angle) * radius, 24, Math.max(24, width - 24)),
        y: Phaser.Math.Clamp(this.tree.y + Math.sin(angle) * radius, Math.min(top, height / 2), Math.max(height / 2, height - 34)),
        bonus: bonuses[this.bonusIndex++ % bonuses.length], expiresAt: this.elapsed + 10
      };
    }
    if (!this.pickup) return;
    const expired = this.elapsed >= this.pickup.expiresAt;
    if (!expired && distance(this.pickup, this.player) >= 29) return;
    if (!expired) {
      const { bonus } = this.pickup;
      if (bonus.kind === 'shield') this.protectedUntil = this.elapsed + 7;
      if (bonus.kind === 'heal') this.vitality = Math.min(100, this.vitality + 20);
      if (bonus.kind === 'rapid') {
        this.rapidUntil = this.elapsed + 8;
        this.nextShot = Math.min(this.nextShot, this.elapsed + .162);
      }
      this.announce(bonus.label);
      this.burst(this.pickup, bonus.color);
    }
    this.pickup = null;
    this.nextBonus = this.elapsed + 8;
  }

  private announce(label: string) {
    notice.textContent = label;
    this.noticeUntil = this.elapsed + 2.5;
  }

  private step(dt: number) {
    const { duration, interval, waves, chief } = this.currentLevel;
    const levelEnd = this.levelStarted + duration;
    this.elapsed = Math.min(levelEnd, this.elapsed + dt);
    const levelTime = this.elapsed - this.levelStarted;
    const { width, height } = this.scale;
    const held = (one: string, two: string) => Number(this.keys.has(one) || this.keys.has(two));
    let dx = held('KeyD', 'ArrowRight') - held('KeyA', 'ArrowLeft');
    let dy = held('KeyS', 'ArrowDown') - held('KeyW', 'ArrowUp');
    if (this.touch?.dragged) {
      dx += (this.touch.current.x - this.touch.origin.x) / 38;
      dy += (this.touch.current.y - this.touch.origin.y) / 38;
      const limit = Math.max(1, Math.hypot(dx, dy));
      thumb.style.transform = `translate(${dx / limit * 30}px,${dy / limit * 30}px)`;
    }
    const length = Math.max(1, Math.hypot(dx, dy));
    this.walking = Math.hypot(dx, dy) > .06;
    this.player.x = Phaser.Math.Clamp(this.player.x + dx / length * dt * 225, 18, width - 18);
    this.player.y = Phaser.Math.Clamp(this.player.y + dy / length * dt * 225, 18, height - 18);

    if (this.elapsed >= this.nextShadow && this.elapsed < levelEnd) {
      const edge = Math.floor(Math.random() * 4);
      const wave = waves[this.wave++ % waves.length];
      wave.forEach((kind, index) => this.spawnEnemy(kind, (edge + index * 2 + Math.floor(index / 2)) % 4));
      this.nextShadow = this.elapsed + interval * (1 - .25 * levelTime / duration);
    }
    if (chief && !this.chiefSpawned && levelTime >= duration - 25) {
      this.chiefSpawned = true;
      this.spawnEnemy('chief', Math.floor(Math.random() * 4));
      this.announce('Ork şefi saldırıyor!');
    }
    this.updatePickup();

    const target = this.aimTouch?.target ?? (this.firing ? this.pointer : this.queuedShot);
    if (target && distance(target, this.player) < 4) this.queuedShot = null;
    const hasTarget = target && distance(target, this.player) >= 4;
    const look = hasTarget ? target : this.walking ? null : this.pointer;
    let desired = this.heading;
    if (look && distance(look, this.player) >= 4) {
      desired = Math.atan2(look.y - this.player.y, look.x - this.player.x);
    } else if (this.walking) {
      desired = Math.atan2(dy, dx);
    }
    const turn = Math.atan2(Math.sin(desired - this.heading), Math.cos(desired - this.heading));
    this.heading += Phaser.Math.Clamp(turn, -dt * 10, dt * 10);
    if (hasTarget && Math.abs(turn) <= dt * 10 + .01 && this.elapsed >= this.nextShot) {
      this.fireArrow(this.player, desired, .45);
      this.queuedShot = null;
      this.nextShot = this.elapsed + (this.elapsed < this.rapidUntil ? .162 : .27);
    }
    for (const companion of this.companions) this.updateCompanion(companion);
    for (const arrow of this.arrows) {
      arrow.x += arrow.vx * dt;
      arrow.y += arrow.vy * dt;
      arrow.life -= dt;
      if (arrow.life <= 0) continue;
      const hit = this.shadows.findIndex(shadow => distance(shadow, arrow) < enemies[shadow.kind].radius);
      if (hit < 0) continue;
      const orc = this.shadows[hit];
      this.burst(orc, arrow.magic ? 0xa7efff : 0xffe6a1);
      arrow.life = 0;
      orc.health -= arrow.magic ? 2 : 1;
      orc.hitUntil = this.elapsed + .12;
      if (orc.health > 0) continue;
      this.shadows.splice(hit, 1);
      this.cleared++;
      const earned = enemies[orc.kind].points;
      this.points += earned;
      this.showHitScore(orc, earned);
      if (this.cleared === 10) {
        this.recruit('archer');
        this.announce('Elf okçu savunmaya katıldı');
      }
    }
    this.arrows = this.arrows.filter(arrow => arrow.life > 0);

    for (const shadow of this.shadows) {
      const gap = distance(shadow, this.tree);
      if (gap > 41) {
        const move = Math.min(gap - 41, shadow.speed * dt);
        shadow.x += (this.tree.x - shadow.x) / gap * move;
        shadow.y += (this.tree.y - shadow.y) / gap * move;
      } else if (shadow.attack <= this.elapsed) {
        if (this.elapsed >= this.protectedUntil) this.vitality = Math.max(0, this.vitality - enemies[shadow.kind].damage);
        this.burst(this.tree, this.elapsed >= this.protectedUntil ? 0xeea880 : 0x93f6d0);
        shadow.attack = this.elapsed + 1.1;
      }
    }
    for (const spark of this.sparks) {
      spark.x += spark.vx * dt;
      spark.y += spark.vy * dt;
      spark.life -= dt;
    }
    this.sparks = this.sparks.filter(spark => spark.life > 0);
    this.status();
    if (this.vitality <= 0) this.finish(false);
    else if (this.elapsed >= levelEnd) {
      this.points += 500 + this.vitality * 5;
      if (this.level < levels.length) this.advanceLevel();
      else this.finish(true);
    }
  }

  private fireArrow(origin: Point, heading: number, volume: number) {
    this.arrows.push({ ...origin, vx: Math.cos(heading) * 635, vy: Math.sin(heading) * 635, life: 1.4 });
    if (this.cache.audio.exists('arrow-swish')) this.sound.play('arrow-swish', { volume });
  }

  private companionPosition(side: number): Point {
    const { x, y } = this.player;
    const { width, height } = this.scale;
    const preferred = x + side * 52;
    if (preferred >= 18 && preferred <= width - 18) return { x: preferred, y };
    return { x, y: y + (y + 48 <= height - 18 ? 48 : -48) };
  }

  private updateCompanion(companion: Companion) {
    const wizard = companion.kind === 'wizard';
    companion.position = this.companionPosition(wizard ? -1 : 1);
    let target: Shadow | null = null;
    let closest = Infinity;
    const range = wizard ? 270 : 220;
    for (const orc of this.shadows) {
      const gap = distance(companion.position, orc);
      if (gap > range) continue;
      const priority = gap - (wizard && orc.kind === 'armored' ? range : 0);
      if (priority >= closest) continue;
      target = orc;
      closest = priority;
    }
    if (!target) return;
    const { x, y } = companion.position;
    companion.heading = Math.atan2(target.y - y, target.x - x);
    if (this.elapsed >= companion.nextShot) {
      if (wizard) {
        this.arrows.push({
          x, y, vx: Math.cos(companion.heading) * 635, vy: Math.sin(companion.heading) * 635,
          life: 1.4, magic: true
        });
      } else {
        this.fireArrow(companion.position, companion.heading, .25);
      }
      companion.nextShot = this.elapsed + (wizard ? 1.35 : 1.15);
    }
  }

  private showHitScore(point: Point, earned: number) {
    const x = Phaser.Math.Clamp(point.x, 22, this.scale.width - 22);
    const y = Math.max(52, point.y - 35);
    const popup = this.add.text(x, y, '+' + earned, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '25px',
      fontStyle: 'bold',
      color: '#ffdf85',
      stroke: '#101b18',
      strokeThickness: 4
    }).setOrigin(.5).setDepth(1);
    this.scorePopups.add(popup);
    this.tweens.add({
      targets: popup,
      y: y - 32,
      alpha: 0,
      duration: 800,
      ease: 'Quad.In',
      onComplete: () => {
        this.scorePopups.delete(popup);
        popup.destroy();
      }
    });
  }

  private burst(point: Point, color: number) {
    for (let index = 0; index < 9; index++) {
      const angle = Math.random() * Math.PI * 2;
      this.sparks.push({ ...point, vx: Math.cos(angle) * 85, vy: Math.sin(angle) * 85, life: .48, color });
    }
  }

  private paintCharacter(point: Point, facing: number, stride: number, elf: boolean, enemy?: Shadow) {
    const g = this.art;
    const { x, y } = point;
    const bob = Math.abs(stride) * .45;
    const horizontal = elf ? Math.cos(facing) : facing;
    const depth = elf ? Math.sin(facing) * .45 : 0;
    const px = (offset: number) => x + horizontal * offset;
    const py = (height: number, offset: number) => y + height + depth * offset - bob;
    const polygon = (color: number, coordinates: number[]) => {
      g.fillStyle(color).beginPath();
      g.moveTo(px(coordinates[0]), py(coordinates[1], coordinates[0]));
      for (let i = 2; i < coordinates.length; i += 2) {
        g.lineTo(px(coordinates[i]), py(coordinates[i + 1], coordinates[i]));
      }
      g.closePath().fillPath();
    };
    const oval = (color: number, ox: number, oy: number, w: number, h: number) =>
      g.fillStyle(color).fillEllipse(px(ox), py(oy, ox), w, h);
    const line = (color: number, width: number, ax: number, ay: number, bx: number, by: number) =>
      g.lineStyle(width, color).lineBetween(px(ax), py(ay, ax), px(bx), py(by, bx));

    g.fillStyle(0x081311, .75).fillEllipse(x, y + 18, elf ? 46 : 53, 16);
    if (elf) {
      const forward = Math.sin(facing);
      const side = Math.abs(horizontal);
      const project = (ahead: number, across: number, height: number): Point => ({
        x: px(ahead) - forward * across,
        y: py(height, ahead) + horizontal * across * .45
      });
      const joint = (
        color: number, width: number,
        from: [number, number, number], to: [number, number, number]
      ) => {
        const a = project(...from);
        const b = project(...to);
        g.lineStyle(width, color).lineBetween(a.x, a.y, b.x, b.y);
      };

      const farSide = horizontal >= 0 ? -1 : 1;
      for (const leg of [farSide, -farSide]) {
        const step = stride * leg;
        joint(leg === farSide ? 0x49342c : 0x7b5540, 7, [0, leg * 5, 3], [step, leg * 7, 15]);
        const boot = project(step + 2, leg * 7, 16);
        g.fillStyle(0x392b29).fillEllipse(boot.x, boot.y, 9 + side * 3, 6);
      }

      const drawQuiver = () => {
        joint(0x865e42, 5, [-10, -5, 3], [-15, 6, -31]);
        joint(0xe4d7a7, 2, [-14, 4, -26], [-16, 7, -36]);
        joint(0xe4d7a7, 2, [-16, 7, -25], [-18, 10, -35]);
      };
      if (forward >= 0) drawQuiver();

      oval(0x153a31, -8, 0, 23 + (1 - side) * 7, 30);
      oval(0x4e8063, -7, -3, 15 + (1 - side) * 7, 27);
      oval(forward < 0 ? 0x234e3c : 0x795136, 0, -8, 22 + (1 - side) * 9, 27);
      if (forward > -.35) {
        oval(0x9c7552, 3, -9, 13 + (1 - side) * 5, 20);
        oval(0xd5b272, 2, 1, 16 + (1 - side) * 8, 4);
      }

      if (forward < 0) drawQuiver();
      oval(0x234e3c, -1, -27, 27, 30);
      oval(0x5f9071, -3, -34, 21, 14);
      if (forward > -.45) {
        const faceWidth = 15 + Math.max(0, forward) * 7;
        oval(0xdba57d, 6, -25, faceWidth, 18);
        oval(0xa65d35, 5, -32, faceWidth, 6);
        const face = project(8, 0, -26);
        const eyeSpacing = Math.max(0, forward) * 4;
        g.fillStyle(0x26342c).fillEllipse(face.x + horizontal * 3 + eyeSpacing, face.y, 3, 2.5);
        if (eyeSpacing > 2) g.fillEllipse(face.x + horizontal * 3 - eyeSpacing, face.y, 3, 2.5);
      }

      joint(0x59775a, 8, [2, -farSide * 8, -15], [12, -farSide * 7, -11]);
      joint(0xe4b38d, 5, [12, -farSide * 7, -11], [21, 0, -12]);
      joint(0xdcc390, 2, [23, -8, -27], [23, 8, 4]);
      g.lineStyle(3, 0xe7a85f).beginPath();
      for (let step = 0; step <= 12; step++) {
        const angle = -1.4 + 2.8 * step / 12;
        const curve = Math.cos(angle) - Math.cos(1.4);
        const bend = project(23 + curve * 16, Math.sin(angle) * 8 - curve * 8, -12 + Math.sin(angle) * 16);
        if (step === 0) g.moveTo(bend.x, bend.y);
        else g.lineTo(bend.x, bend.y);
      }
      g.strokePath();
    } else {
      line(0x383037, 9, -8,3, -10+stride,15);
      line(0x5a4350, 9, 7,3, 8-stride,15);
      oval(0x2f2933, -7+stride,16,14,7);
      oval(0x3d3037, 10-stride,16,15,7);
      oval(0x597650, -15,-8,15,26);
      oval(0x829760, 16,-7,16,23);
      polygon(0x3b3442, [-15,-20, 14,-20, 14,5, -12,7]);
      polygon(0x675264, [-11,-18, 13,-16, 7,-5, -9,-4]);
      polygon(0x77675d, [-16,0, 14,-1, 13,4, -15,6]);
      oval(0xc4a464, 3,2,8,5);
      oval(0x9b765f, -15,-16,16,13);
      oval(0xc49b72, -16,-18,10,5);
      polygon(0x789452, [-14,-28, -24,-32, -19,-20, -11,-19]);
      polygon(0x8ca966, [13,-29, 22,-35, 19,-23, 13,-19]);
      oval(0x486949, 0,-26,32,29);
      oval(0x94ab66, 3,-28,26,24);
      polygon(0x483a37, [-14,-31,-12,-37, 5,-41, 13,-35, 15,-31, 1,-34]);
      line(0x43583e, 3, -6,-29, 1,-27);
      line(0x43583e, 3, 7,-27, 13,-30);
      oval(0xe5d88c, -1,-26,3,2.4);
      oval(0xe5d88c, 10,-26,3,2.4);
      oval(0x607d4d, 6,-22,10,5);
      line(0x465744, 2, -2,-18, 12,-18);
      polygon(0xf0dfb0, [-1,-17, 3,-17, 0,-22]);
      polygon(0xf0dfb0, [8,-17, 12,-18, 12,-23]);
      line(0x8a5e48, 5, 20,8, 26,-17);
      oval(0x6f5143, 27,-20,12,18);
      oval(0xa87a59, 28,-23,7,10);
      oval(0x8a9e62, 21,0,10,9);
      if (enemy?.kind === 'runner') {
        polygon(0xc25943, [6,-19, -28,-14, -41,-3, -11,-8, 9,-13]);
      } else if (enemy?.kind === 'armored') {
        oval(0x304352, 20,-8,27,35);
        oval(0x91b2ca, 21,-9,21,28);
        oval(0x435e72, 22,-9,9,12);
      } else if (enemy?.kind === 'chief') {
        polygon(0xe8bc68, [-16,-31, -23,-53, -8,-44, 0,-58, 9,-44, 22,-53, 15,-31]);
        line(0x7b533e, 6, 23,7, 34,-31);
        oval(0xbe88c5, 36,-33,22,28);
      }
    }
  }

  private paintWizard(point: Point, heading: number, stride: number, clock: number) {
    const g = this.art;
    const { x, y } = point;
    const bob = Math.abs(stride) * .45;
    const faceX = x + Math.cos(heading) * 5;
    const staffX = x + (Math.cos(heading) < 0 ? -19 : 19);
    g.fillStyle(0x081311, .75).fillEllipse(x, y + 18, 44, 14);
    g.fillStyle(0x737d87).fillTriangle(x - 5, y - 28 - bob, x - 20, y + 15, x + 15, y + 13);
    g.fillStyle(0xdde0d7).fillTriangle(faceX, y - 29 - bob, x - 13, y + 13, x + 14, y + 13);
    g.fillStyle(0xf6eedb).fillEllipse(faceX, y - 29 - bob, 20, 22);
    if (Math.sin(heading) > -.45) {
      g.fillStyle(0xc49c7b).fillEllipse(faceX, y - 28 - bob, 13, 9);
      g.fillStyle(0xf7f6e9).fillTriangle(faceX - 8, y - 26 - bob, faceX + 8, y - 26 - bob, faceX, y - 9 - bob);
    }
    g.fillStyle(0xa8b0b4).fillTriangle(faceX - 11, y - 34 - bob, faceX + 4, y - 51 - bob, faceX + 12, y - 34 - bob);
    g.fillStyle(0xe5e5da).fillEllipse(faceX, y - 34 - bob, 30, 6);
    g.lineStyle(3, 0xa9845f).lineBetween(staffX, y - 36 - bob, staffX - 3, y + 16);
    g.fillStyle(0x8fe7ff, .27).fillCircle(staffX, y - 39 - bob, 9 + Math.sin(clock * 5) * 2);
    g.fillStyle(0xe7fbff).fillCircle(staffX, y - 39 - bob, 4);
  }

  private paintEnemyStatus(enemy: Shadow) {
    const { x, y, kind } = enemy;
    const stats = enemies[kind];
    const g = this.art;
    if (enemy.hitUntil > this.elapsed) {
      g.fillStyle(0xffedcf, .38).fillEllipse(x, y - 14, stats.radius * 2, 43);
    }
    if (stats.health > 1) {
      const width = kind === 'chief' ? 62 : 38;
      const top = y - (kind === 'chief' ? 67 : 50);
      g.fillStyle(0x101b18, .95).fillRoundedRect(x - width / 2, top, width, 6, 2);
      g.fillStyle(stats.color).fillRoundedRect(x - width / 2, top, width * enemy.health / stats.health, 6, 2);
    }
  }

  private paint(clock: number) {
    const g = this.art.clear();
    const { width, height } = this.scale;
    const { x, y } = this.tree;
    g.fillGradientStyle(...this.currentLevel.palette).fillRect(0, 0, width, height);
    for (let ring = 9; ring > 0; ring--) {
      g.fillStyle(0x638157, .047).fillEllipse(x, y + 18, width * ring / 10, height * ring / 11);
    }
    this.floor.forEach((point, index) => {
      const px = point.x * width;
      const py = point.y * height;
      const edge = Math.abs(point.x - .5) * 2 > .75 || Math.abs(point.y - .5) * 2 > .83;
      if (edge && index % 3 === 0) {
        const size = 20 + index % 28;
        g.fillStyle(0x081514, .8).fillEllipse(px, py + size * .45, size * 2, size);
        g.fillStyle(0x244437, .9).fillCircle(px, py, size * .7);
        g.fillStyle(0x36533e, .5).fillCircle(px - 5, py - 6, size * .45);
      } else {
        g.fillStyle(index % 6 ? 0x81a26f : 0xe0d896, .15 + .14 * Math.sin(clock + index)).fillEllipse(px, py, 2 + index % 5, 2);
      }
    });
    if (this.elapsed < this.protectedUntil) {
      g.fillStyle(0x8bf4ba,.15).fillCircle(x,y,63);
      g.lineStyle(2,0x9af7d0,.8).strokeCircle(x,y,63);
    }
    g.fillStyle(0x111d18,.8).fillEllipse(x,y+22,108,52);
    const light = .18 + .82 * this.vitality / 100;
    for (let ring = 7; ring > 0; ring--) g.fillStyle(0xe9d982,.045 * light).fillCircle(x,y-27,ring*11);
    g.lineStyle(11,0x665639).lineBetween(x-6,y+20,x+2,y-39);
    g.lineStyle(5,0x9b8653).lineBetween(x,y-12,x-21,y-38).lineBetween(x,y-21,x+23,y-49);
    for (const [ox,oy,r] of [[-27,-39,19],[-15,-54,20],[5,-59,25],[24,-49,21],[11,-35,21]]) {
      g.fillStyle(0x729260,.94).fillCircle(x+ox,y+oy,r);
      g.fillStyle(0xd5db89,.5 * light).fillCircle(x+ox-5,y+oy-5,r*.76);
    }
    for (let i = 0; i < 11; i++) {
      const angle = i * 2.4 + clock * .35;
      g.fillStyle(0xffe6a2,.7 * light).fillCircle(x+Math.cos(angle)*(22+i*2),y-42+Math.sin(angle)*(18+i),1.5);
    }

    if (this.pickup) {
      const { x: sx, y: sy, bonus } = this.pickup;
      const lift = sy + Math.sin(clock * 4) * 4;
      g.fillStyle(bonus.color, .22).fillCircle(sx, sy, 22);
      g.lineStyle(2, bonus.color, .75).strokeCircle(sx, sy, 18);
      g.fillStyle(bonus.color);
      if (bonus.kind === 'heal') {
        g.fillRect(sx - 3, lift - 10, 6, 20).fillRect(sx - 10, lift - 3, 20, 6);
      } else if (bonus.kind === 'rapid') {
        g.fillTriangle(sx - 9, lift - 9, sx - 9, lift + 9, sx + 2, lift);
        g.fillTriangle(sx, lift - 9, sx, lift + 9, sx + 11, lift);
      } else {
        g.fillTriangle(sx, lift - 12, sx - 8, lift, sx + 8, lift);
        g.fillTriangle(sx, lift + 12, sx - 8, lift, sx + 8, lift);
      }
    }
    const actors = this.shadows.map<{ point: Point; facing: number; stride: number; elf: boolean; wizard?: boolean; enemy?: Shadow }>(shadow => ({
      point: shadow,
      facing: x >= shadow.x ? 1 : -1,
      stride: this.mode === 'playing' && distance(shadow, this.tree) > 42
        ? Math.sin(clock * 12 + shadow.speed) * 4 : 0,
      elf: false, enemy: shadow
    }));
    actors.push({
      point: this.player, facing: this.heading,
      stride: this.walking ? Math.sin(clock * 17) * 4 : 0, elf: true
    });
    for (const { kind, position, heading } of this.companions) {
      g.lineStyle(2, 0x85e8fa, .85).strokeEllipse(position.x, position.y + 12, 44, 20);
      actors.push({
        point: position, facing: heading, stride: this.walking ? Math.sin(clock * 17 + 1) * 4 : 0,
        elf: true, wizard: kind === 'wizard'
      });
    }
    actors.sort((a, b) => a.point.y - b.point.y);
    for (const actor of actors) {
      if (actor.wizard) this.paintWizard(actor.point, actor.facing, actor.stride, clock);
      else this.paintCharacter(actor.point, actor.facing, actor.stride, actor.elf, actor.enemy);
      if (actor.enemy) this.paintEnemyStatus(actor.enemy);
    }
    for (const arrow of this.arrows) {
      if (arrow.magic) {
        g.lineStyle(5, 0x80dfff, .7).lineBetween(arrow.x, arrow.y, arrow.x - arrow.vx * .028, arrow.y - arrow.vy * .028);
        g.fillStyle(0xb6edff, .25).fillCircle(arrow.x, arrow.y, 11);
        g.fillStyle(0xe9fcff).fillCircle(arrow.x, arrow.y, 4);
      } else {
        g.lineStyle(3,0xffe6a0,.95).lineBetween(arrow.x,arrow.y,arrow.x-arrow.vx*.029,arrow.y-arrow.vy*.029);
      }
    }
    for (const spark of this.sparks) g.fillStyle(spark.color,spark.life*2).fillCircle(spark.x,spark.y,2.6);
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'field',
  backgroundColor: '#101b18',
  audio: { disableWebAudio: location.protocol === 'file:' },
  scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
  banner: false,
  scene: Forest
});
