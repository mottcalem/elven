"use strict";
function element(id) {
    return document.getElementById(id);
}
const start = element('start');
const pause = element('pause');
const overlay = element('overlay');
const title = element('title');
const message = element('message');
const health = element('health');
const time = element('time');
const score = element('score');
const shield = element('shield');
const stick = element('stick');
const thumb = stick.querySelector('i');
const field = element('field');
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const introMusic = element('intro-music');
const musicToggle = element('music-toggle');
function setupIntroMusic() {
    const preference = 'orman-muhafizi:intro-music';
    let enabled = true;
    try {
        enabled = localStorage.getItem(preference) !== 'off';
    }
    catch {
        // Playback remains available when storage is disabled.
    }
    const updateLabel = () => {
        const playing = !introMusic.paused;
        const label = playing ? 'Müziği kapat' : 'Müziği aç';
        musicToggle.dataset.playing = String(playing);
        musicToggle.setAttribute('aria-label', label);
        musicToggle.title = label;
    };
    const play = () => {
        if (enabled && !musicToggle.hidden && introMusic.paused) {
            void introMusic.play().catch(updateLabel);
        }
    };
    introMusic.volume = .45;
    introMusic.addEventListener('playing', updateLabel);
    introMusic.addEventListener('pause', updateLabel);
    introMusic.addEventListener('error', () => {
        musicToggle.setAttribute('aria-label', 'Müzik yüklenemedi');
        musicToggle.title = 'Müzik yüklenemedi';
        musicToggle.disabled = true;
    });
    musicToggle.addEventListener('click', () => {
        enabled = introMusic.paused;
        try {
            localStorage.setItem(preference, enabled ? 'on' : 'off');
        }
        catch {
            // The control still works for the current visit.
        }
        if (enabled)
            play();
        else
            introMusic.pause();
    });
    const playAfterInteraction = (event) => {
        if (event.target instanceof Element && event.target.closest('button'))
            return;
        play();
    };
    overlay.addEventListener('click', playAfterInteraction);
    start.addEventListener('click', () => {
        introMusic.pause();
        musicToggle.hidden = true;
        overlay.removeEventListener('click', playAfterInteraction);
    }, { once: true });
    play();
}
setupIntroMusic();
class Forest extends Phaser.Scene {
    constructor() {
        super(...arguments);
        this.walking = false;
        this.heading = 0;
        this.keys = new Set();
        this.player = { x: 0, y: 0 };
        this.tree = { x: 0, y: 0 };
        this.queuedShot = null;
        this.pointer = null;
        this.firing = false;
        this.touch = null;
        this.mode = 'intro';
        this.shadows = [];
        this.arrows = [];
        this.sparks = [];
        this.seed = null;
        this.elapsed = 0;
        this.nextShadow = 1;
        this.nextSeed = 7;
        this.nextShot = 0;
        this.protectedUntil = 0;
        this.vitality = 100;
        this.cleared = 0;
        this.floor = [];
    }
    preload() {
        this.load.audio('arrow-swish', './ok-efekti.mp3');
    }
    create() {
        this.art = this.add.graphics();
        const random = new Phaser.Math.RandomDataGenerator(['muhafiz']);
        this.floor = Array.from({ length: 270 }, () => ({ x: random.frac(), y: random.frac() }));
        this.place();
        this.scale.on('resize', () => this.place());
        start.disabled = false;
        start.addEventListener('click', () => {
            if (this.mode !== 'paused')
                this.reset();
            this.mode = 'playing';
            pause.disabled = false;
            overlay.hidden = true;
            field.focus({ preventScroll: true });
        });
        field.tabIndex = -1;
        pause.addEventListener('click', () => this.suspend());
        window.addEventListener('blur', () => this.suspend());
        document.addEventListener('visibilitychange', () => { if (document.hidden)
            this.suspend(); });
        window.addEventListener('keydown', event => {
            if (event.code === 'Escape' && this.mode === 'playing')
                this.suspend();
            if (this.mode !== 'playing' || event.target instanceof HTMLButtonElement)
                return;
            if (/^(Arrow(Up|Down|Left|Right)|Key[WASD])$/.test(event.code)) {
                event.preventDefault();
                this.keys.add(event.code);
            }
        });
        window.addEventListener('keyup', event => this.keys.delete(event.code));
        const positionInField = (event) => {
            const bounds = field.getBoundingClientRect();
            return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
        };
        field.addEventListener('pointerdown', event => {
            if (this.mode !== 'playing')
                return;
            if (event.pointerType === 'touch') {
                if (this.touch)
                    return;
                const origin = positionInField(event);
                this.touch = { id: event.pointerId, origin, current: origin, dragged: false };
                stick.style.left = origin.x + 'px';
                stick.style.top = origin.y + 'px';
                thumb.style.transform = '';
            }
            else {
                if (event.button !== 0)
                    return;
                this.firing = true;
                this.pointer = positionInField(event);
                this.queuedShot = this.pointer;
            }
            field.setPointerCapture(event.pointerId);
        });
        field.addEventListener('pointermove', event => {
            var _a;
            const position = positionInField(event);
            if (this.touch?.id === event.pointerId) {
                this.touch.current = position;
                (_a = this.touch).dragged || (_a.dragged = distance(this.touch.origin, position) >= 10);
                stick.hidden = !this.touch.dragged;
            }
            if (event.pointerType !== 'touch')
                this.pointer = position;
        });
        const release = (event) => {
            if (this.touch?.id === event.pointerId) {
                const position = positionInField(event);
                if (event.type === 'pointerup' && !this.touch.dragged && distance(this.touch.origin, position) < 10) {
                    this.queuedShot = position;
                }
                this.touch = null;
                stick.hidden = true;
            }
            if (event.pointerType !== 'touch')
                this.firing = false;
        };
        field.addEventListener('pointerup', release);
        field.addEventListener('pointercancel', release);
        field.addEventListener('lostpointercapture', release);
    }
    place() {
        const { width, height } = this.scale;
        this.tree = { x: width / 2, y: height * .53 };
        if (this.mode === 'intro')
            this.player = { x: width / 2, y: height * .72 };
        this.player.x = Phaser.Math.Clamp(this.player.x, 18, width - 18);
        this.player.y = Phaser.Math.Clamp(this.player.y, 18, height - 18);
        if (this.seed) {
            this.seed.x = Phaser.Math.Clamp(this.seed.x, 24, width - 24);
            this.seed.y = Phaser.Math.Clamp(this.seed.y, 24, height - 24);
        }
    }
    reset() {
        this.elapsed = this.nextShot = this.protectedUntil = this.cleared = 0;
        this.nextShadow = 1;
        this.nextSeed = 7;
        this.vitality = 100;
        this.shadows = [];
        this.arrows = [];
        this.sparks = [];
        this.seed = null;
        this.player = { x: this.tree.x, y: this.scale.height * .72 };
        this.heading = 0;
        this.queuedShot = null;
        this.pointer = null;
        this.walking = false;
        this.status();
    }
    display(heading, body, action) {
        this.keys.clear();
        this.walking = false;
        this.firing = false;
        this.queuedShot = null;
        this.touch = null;
        stick.hidden = true;
        pause.disabled = true;
        title.textContent = heading;
        message.textContent = body;
        start.textContent = action;
        overlay.hidden = false;
        if (!document.hidden && document.hasFocus())
            start.focus();
    }
    suspend() {
        if (this.mode !== 'playing')
            return;
        this.mode = 'paused';
        this.display('Oyun duraklatıldı', 'Hazır olduğunda ışık ağacını korumaya devam edebilirsin.', 'Devam et');
    }
    finish(won) {
        this.mode = 'done';
        this.display(won ? 'Orman güvende!' : 'Ağacın ışığı söndü', won ? `${this.cleared} orku geri püskürttün. Işık ağacı yeniden parlıyor!`
            : `${this.cleared} orku geri püskürttün. Altın tohumlar, ağacı kısa süre korur.`, 'Yeniden oyna');
    }
    status() {
        const remaining = Math.ceil(60 - this.elapsed);
        time.textContent = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
        health.value = Math.max(0, this.vitality);
        score.textContent = String(this.cleared);
        shield.hidden = this.elapsed >= this.protectedUntil;
    }
    update(clock, delta) {
        if (this.mode === 'playing')
            this.step(Math.min(.05, delta / 1000));
        this.paint(clock / 1000);
    }
    step(dt) {
        this.elapsed = Math.min(60, this.elapsed + dt);
        const { width, height } = this.scale;
        const held = (one, two) => Number(this.keys.has(one) || this.keys.has(two));
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
        if (this.elapsed >= this.nextShadow) {
            const angle = Math.random() * Math.PI * 2;
            const reach = Math.max(width, height);
            this.shadows.push({
                x: Phaser.Math.Clamp(this.tree.x + Math.cos(angle) * reach, -18, width + 18),
                y: Phaser.Math.Clamp(this.tree.y + Math.sin(angle) * reach, -18, height + 18),
                speed: 58 + this.elapsed * .8 + Math.random() * 18, attack: 0
            });
            this.nextShadow = this.elapsed + Math.max(.57, 2.15 - this.elapsed * .027);
        }
        if (!this.seed && this.elapsed >= this.nextSeed) {
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.min(width, height) * .3;
            this.seed = { x: this.tree.x + Math.cos(angle) * radius, y: this.tree.y + Math.sin(angle) * radius };
        }
        if (this.seed && distance(this.seed, this.player) < 29) {
            this.burst(this.seed, 0xffdd7d);
            this.seed = null;
            this.nextSeed = this.elapsed + 11;
            this.protectedUntil = this.elapsed + 7;
        }
        const target = this.firing ? this.pointer : this.queuedShot;
        if (target && distance(target, this.player) < 4)
            this.queuedShot = null;
        const hasTarget = target && distance(target, this.player) >= 4;
        const look = hasTarget ? target : this.walking ? null : this.pointer;
        let desired = this.heading;
        if (look && distance(look, this.player) >= 4) {
            desired = Math.atan2(look.y - this.player.y, look.x - this.player.x);
        }
        else if (this.walking) {
            desired = Math.atan2(dy, dx);
        }
        const turn = Math.atan2(Math.sin(desired - this.heading), Math.cos(desired - this.heading));
        this.heading += Phaser.Math.Clamp(turn, -dt * 10, dt * 10);
        if (hasTarget && Math.abs(turn) <= dt * 10 + .01 && this.elapsed >= this.nextShot) {
            this.arrows.push({ ...this.player, vx: Math.cos(desired) * 635, vy: Math.sin(desired) * 635, life: 1.4 });
            this.queuedShot = null;
            this.nextShot = this.elapsed + .27;
            if (this.cache.audio.exists('arrow-swish')) {
                this.sound.play('arrow-swish', { volume: .45 });
            }
        }
        for (const arrow of this.arrows) {
            arrow.x += arrow.vx * dt;
            arrow.y += arrow.vy * dt;
            arrow.life -= dt;
            if (arrow.life <= 0)
                continue;
            const hit = this.shadows.findIndex(shadow => distance(shadow, arrow) < 24);
            if (hit < 0)
                continue;
            this.burst(this.shadows[hit], 0xffe6a1);
            this.shadows.splice(hit, 1);
            arrow.life = 0;
            this.cleared++;
        }
        this.arrows = this.arrows.filter(arrow => arrow.life > 0);
        for (const shadow of this.shadows) {
            const gap = distance(shadow, this.tree);
            if (gap > 41) {
                const move = Math.min(gap - 41, shadow.speed * dt);
                shadow.x += (this.tree.x - shadow.x) / gap * move;
                shadow.y += (this.tree.y - shadow.y) / gap * move;
            }
            else if (shadow.attack <= this.elapsed) {
                if (this.elapsed >= this.protectedUntil)
                    this.vitality -= 7;
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
        if (this.vitality <= 0 || this.elapsed >= 60)
            this.finish(this.vitality > 0);
    }
    burst(point, color) {
        for (let index = 0; index < 9; index++) {
            const angle = Math.random() * Math.PI * 2;
            this.sparks.push({ ...point, vx: Math.cos(angle) * 85, vy: Math.sin(angle) * 85, life: .48, color });
        }
    }
    paintCharacter(point, facing, stride, elf) {
        const g = this.art;
        const { x, y } = point;
        const bob = Math.abs(stride) * .45;
        const horizontal = elf ? Math.cos(facing) : facing;
        const depth = elf ? Math.sin(facing) * .45 : 0;
        const px = (offset) => x + horizontal * offset;
        const py = (height, offset) => y + height + depth * offset - bob;
        const polygon = (color, coordinates) => {
            g.fillStyle(color).beginPath();
            g.moveTo(px(coordinates[0]), py(coordinates[1], coordinates[0]));
            for (let i = 2; i < coordinates.length; i += 2) {
                g.lineTo(px(coordinates[i]), py(coordinates[i + 1], coordinates[i]));
            }
            g.closePath().fillPath();
        };
        const oval = (color, ox, oy, w, h) => g.fillStyle(color).fillEllipse(px(ox), py(oy, ox), w, h);
        const line = (color, width, ax, ay, bx, by) => g.lineStyle(width, color).lineBetween(px(ax), py(ay, ax), px(bx), py(by, bx));
        g.fillStyle(0x081311, .75).fillEllipse(x, y + 18, elf ? 46 : 53, 16);
        if (elf) {
            polygon(0x153a31, [-13, -20, 3, -17, 6, 12, -8, 16, -22, 12, -17, -2]);
            polygon(0x4e8063, [-13, -17, -7, -14, -10, 10, -20, 12]);
            line(0x49342c, 7, -5, 4, -8 + stride, 15);
            line(0x7b5540, 7, 4, 4, 5 - stride, 15);
            oval(0x271e20, -7 + stride, 16, 11, 6);
            oval(0x392b29, 7 - stride, 16, 11, 6);
            line(0x865e42, 5, -13, 1, -19, -31);
            for (const offset of [-2, 2])
                line(0xe4d7a7, 2, -17 + offset, -25, -20 + offset, -35);
            if (depth < 0)
                oval(0x234e3c, -5, -6, Math.abs(depth) * 49, 28);
            if (depth > 0)
                oval(0x795136, 0, -7, Math.abs(depth) * 42, 25);
            polygon(0x795136, [-10, -19, 8, -18, 11, 5, -8, 7]);
            polygon(0x9c7552, [-8, -15, -3, -16, 6, 4, 1, 5]);
            line(0xd5b272, 3, -8, 1, 9, 0);
            oval(0x234e3c, -1, -27, 29, 30);
            polygon(0x5f9071, [-16, -29, -8, -42, 2, -42, 11, -32, -2, -35]);
            if (depth > 0)
                oval(0xdba57d, 5, -25, 16 + depth * 7, 19);
            else if (depth > -.34)
                oval(0xdba57d, 5, -25, 16 + depth * 23, 19);
            polygon(0xebba90, [-9, -29, 1, -25, -5, -20]);
            polygon(0xa65d35, [1, -35, 12, -34, 13, -29, 5, -30, -1, -24]);
            if (depth > -.34)
                oval(0x26342c, 10, -25, 3, 2.5);
            line(0x59775a, 8, 2, -15, 12, -11);
            line(0xe4b38d, 5, 11, -11, 21, -12);
            line(0xdcc390, 2, 23, -27, 23, 4);
            g.lineStyle(3, 0xe7a85f).beginPath();
            for (let step = 0; step <= 12; step++) {
                const angle = -1.4 + 2.8 * step / 12;
                const bowX = 20 + Math.cos(angle) * 16;
                const bowY = -12 + Math.sin(angle) * 16;
                if (step === 0)
                    g.moveTo(px(bowX), py(bowY, bowX));
                else
                    g.lineTo(px(bowX), py(bowY, bowX));
            }
            g.strokePath();
        }
        else {
            line(0x383037, 9, -8, 3, -10 + stride, 15);
            line(0x5a4350, 9, 7, 3, 8 - stride, 15);
            oval(0x2f2933, -7 + stride, 16, 14, 7);
            oval(0x3d3037, 10 - stride, 16, 15, 7);
            oval(0x597650, -15, -8, 15, 26);
            oval(0x829760, 16, -7, 16, 23);
            polygon(0x3b3442, [-15, -20, 14, -20, 14, 5, -12, 7]);
            polygon(0x675264, [-11, -18, 13, -16, 7, -5, -9, -4]);
            polygon(0x77675d, [-16, 0, 14, -1, 13, 4, -15, 6]);
            oval(0xc4a464, 3, 2, 8, 5);
            oval(0x9b765f, -15, -16, 16, 13);
            oval(0xc49b72, -16, -18, 10, 5);
            polygon(0x789452, [-14, -28, -24, -32, -19, -20, -11, -19]);
            polygon(0x8ca966, [13, -29, 22, -35, 19, -23, 13, -19]);
            oval(0x486949, 0, -26, 32, 29);
            oval(0x94ab66, 3, -28, 26, 24);
            polygon(0x483a37, [-14, -31, -12, -37, 5, -41, 13, -35, 15, -31, 1, -34]);
            line(0x43583e, 3, -6, -29, 1, -27);
            line(0x43583e, 3, 7, -27, 13, -30);
            oval(0xe5d88c, -1, -26, 3, 2.4);
            oval(0xe5d88c, 10, -26, 3, 2.4);
            oval(0x607d4d, 6, -22, 10, 5);
            line(0x465744, 2, -2, -18, 12, -18);
            polygon(0xf0dfb0, [-1, -17, 3, -17, 0, -22]);
            polygon(0xf0dfb0, [8, -17, 12, -18, 12, -23]);
            line(0x8a5e48, 5, 20, 8, 26, -17);
            oval(0x6f5143, 27, -20, 12, 18);
            oval(0xa87a59, 28, -23, 7, 10);
            oval(0x8a9e62, 21, 0, 10, 9);
        }
    }
    paint(clock) {
        const g = this.art.clear();
        const { width, height } = this.scale;
        const { x, y } = this.tree;
        g.fillGradientStyle(0x142522, 0x101c27, 0x0c1716, 0x19322b).fillRect(0, 0, width, height);
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
            }
            else {
                g.fillStyle(index % 6 ? 0x81a26f : 0xe0d896, .15 + .14 * Math.sin(clock + index)).fillEllipse(px, py, 2 + index % 5, 2);
            }
        });
        if (this.elapsed < this.protectedUntil) {
            g.fillStyle(0x8bf4ba, .15).fillCircle(x, y, 63);
            g.lineStyle(2, 0x9af7d0, .8).strokeCircle(x, y, 63);
        }
        g.fillStyle(0x111d18, .8).fillEllipse(x, y + 22, 108, 52);
        for (let ring = 7; ring > 0; ring--)
            g.fillStyle(0xe9d982, .045).fillCircle(x, y - 27, ring * 11);
        g.lineStyle(11, 0x665639).lineBetween(x - 6, y + 20, x + 2, y - 39);
        g.lineStyle(5, 0x9b8653).lineBetween(x, y - 12, x - 21, y - 38).lineBetween(x, y - 21, x + 23, y - 49);
        for (const [ox, oy, r] of [[-27, -39, 19], [-15, -54, 20], [5, -59, 25], [24, -49, 21], [11, -35, 21]]) {
            g.fillStyle(0x729260, .94).fillCircle(x + ox, y + oy, r);
            g.fillStyle(0xd5db89, .5).fillCircle(x + ox - 5, y + oy - 5, r * .76);
        }
        for (let i = 0; i < 11; i++) {
            const angle = i * 2.4 + clock * .35;
            g.fillStyle(0xffe6a2, .7).fillCircle(x + Math.cos(angle) * (22 + i * 2), y - 42 + Math.sin(angle) * (18 + i), 1.5);
        }
        if (this.seed) {
            const { x: sx, y: sy } = this.seed;
            const lift = Math.sin(clock * 4) * 4;
            g.fillStyle(0xffd578, .17).fillCircle(sx, sy, 22);
            g.lineStyle(1, 0xffd578, .55).strokeCircle(sx, sy, 18);
            g.fillStyle(0xffdb78).fillTriangle(sx, sy - 12 + lift, sx - 8, sy + lift, sx + 8, sy + lift);
            g.fillTriangle(sx, sy + 12 + lift, sx - 8, sy + lift, sx + 8, sy + lift);
        }
        const actors = this.shadows.map(shadow => ({
            point: shadow,
            facing: x >= shadow.x ? 1 : -1,
            stride: this.mode === 'playing' && distance(shadow, this.tree) > 42
                ? Math.sin(clock * 12 + shadow.speed) * 4 : 0,
            elf: false
        }));
        actors.push({
            point: this.player, facing: this.heading,
            stride: this.walking ? Math.sin(clock * 17) * 4 : 0, elf: true
        });
        actors.sort((a, b) => a.point.y - b.point.y);
        for (const actor of actors)
            this.paintCharacter(actor.point, actor.facing, actor.stride, actor.elf);
        for (const arrow of this.arrows) {
            g.lineStyle(3, 0xffe6a0, .95).lineBetween(arrow.x, arrow.y, arrow.x - arrow.vx * .029, arrow.y - arrow.vy * .029);
        }
        for (const spark of this.sparks)
            g.fillStyle(spark.color, spark.life * 2).fillCircle(spark.x, spark.y, 2.6);
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
