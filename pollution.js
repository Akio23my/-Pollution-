class OceanEngine {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.hud = document.getElementById('hud');
    this.width = 0;
    this.height = 0;
    this.hudHeight = 0;
    this.dpr = window.devicePixelRatio || 1;
    this.colors = ['#ffd166', '#ef476f', '#06d6a0', '#118ab2', '#f78c6b'];
    this.trashDefs = {
      micro:  { val: 1, radius: 3.5, hitRadius: 14 },
      bottle: { val: 3, radius: 12,  hitRadius: 22 },
      bag:    { val: 4, radius: 16,  hitRadius: 26 },
      net:    { val: 6, radius: 20,  hitRadius: 30 }
    };
    this.items = [];
    this.popups = [];
    this.totalCollected = 0;
    this.maxItems = 220;
    this.simSpeed = 1;
    this.pollutionRate = 1;
    this.spawnAcc = 0;
    this.time = 0;
    this.lastTime = performance.now();
    this.keys = {};
    this.boat = {
      x: 0, y: 0,
      targetX: 0, targetY: 0,
      vx: 0, vy: 0,
      angle: 0,
      radius: 30,
      wake: []
    };

    this.init();
  }
  init() {
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.boat.x = this.boat.targetX = this.width / 2;
    this.boat.y = this.boat.targetY = this.height / 2;

    this.setupInputs();
    this.setupControls();
    for (let i = 0; i < 46; i++) {
      this.spawnTrash(false);
    }
    requestAnimationFrame((t) => this.loop(t));
  }
  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.hudHeight = this.hud ? this.hud.getBoundingClientRect().height : 0;
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }
  setupInputs() {
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        this.keys[e.key] = true;
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      if (this.keys[e.key] !== undefined) {
        this.keys[e.key] = false;
        e.preventDefault();
      }
    });
    const handlePointer = (x, y) => {
      const rect = this.canvas.getBoundingClientRect();
      this.boat.targetX = this.clamp(x - rect.left, this.boat.radius, this.width - this.boat.radius);
      this.boat.targetY = this.clamp(y - rect.top, this.hudHeight + this.boat.radius, this.height - this.boat.radius);
    };
    this.canvas.addEventListener('mousemove', (e) => handlePointer(e.clientX, e.clientY));
    this.canvas.addEventListener('touchmove', (e) => {
      if (e.touches[0]) handlePointer(e.touches[0].clientX, e.touches[0].clientY);
      e.preventDefault();
    }, { passive: false });
  }
  setupControls() {
    const speedSlider = document.getElementById('speedSlider');
    const rateSlider = document.getElementById('rateSlider');
    if (speedSlider && rateSlider) {
      speedSlider.addEventListener('input', (e) => {
        this.simSpeed = parseFloat(e.target.value);
        document.getElementById('speedOut').textContent = `${this.simSpeed.toFixed(2)}×`;
      });
      rateSlider.addEventListener('input', (e) => {
        this.pollutionRate = parseFloat(e.target.value);
        document.getElementById('rateOut').textContent = `${this.pollutionRate.toFixed(1)}/s`;
      });
    }
  }
  clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }
  random(min, max) { return min + Math.random() * (max - min); }
  getCurrent(x, y, t) {
    const scale = 0.0032;
    const angle = Math.sin(x * scale + t * 0.25) * 1.6 + Math.cos(y * scale * 1.3 - t * 0.18) * 1.6;
    const speed = 14 + Math.sin(x * scale * 2 + y * scale * 2 + t * 0.1) * 6;
    return {
      vx: Math.cos(angle) * speed + 5,
      vy: Math.sin(angle) * speed * 0.6
    };
  }
  spawnTrash(atEdge = false) {
    const roll = Math.random();
    let type = 'micro';
    if (roll > 0.94) type = 'net';
    else if (roll > 0.84) type = 'bag';
    else if (roll > 0.68) type = 'bottle';
    const def = this.trashDefs[type];
    const startX = atEdge ? (Math.random() < 0.5 ? -30 : this.width + 30) : this.random(0, this.width);
    this.items.push({
      type,
      value: def.val,
      radius: def.radius,
      hitRadius: def.hitRadius,
      x: startX,
      y: this.random(this.hudHeight + 20, this.height - 10),
      vx: this.random(-5, 5),
      vy: this.random(-3, 3),
      bobPhase: this.random(0, Math.PI * 2),
      bobSpeed: this.random(1.2, 2.2),
      bobAmp: this.random(2, 5),
      rotation: this.random(0, Math.PI * 2),
      rotSpeed: this.random(-0.4, 0.4),
      color: this.colors[Math.floor(Math.random() * this.colors.length)],
      wobble: this.random(0, 1000)
    });
  }
  update(dt) {
    const speed = 240 * dt;
    if (this.keys.ArrowUp) this.boat.targetY -= speed;
    if (this.keys.ArrowDown) this.boat.targetY += speed;
    if (this.keys.ArrowLeft) this.boat.targetX -= speed;
    if (this.keys.ArrowRight) this.boat.targetX += speed;
    this.boat.targetX = this.clamp(this.boat.targetX, this.boat.radius, this.width - this.boat.radius);
    this.boat.targetY = this.clamp(this.boat.targetY, this.hudHeight + this.boat.radius, this.height - this.boat.radius);
    const prevX = this.boat.x;
    const prevY = this.boat.y;
    this.boat.x += (this.boat.targetX - this.boat.x) * (1 - Math.exp(-15 * dt));
    this.boat.y += (this.boat.targetY - this.boat.y) * (1 - Math.exp(-15 * dt));
    const dx = this.boat.x - prevX;
    const dy = this.boat.y - prevY;
    if (dx * dx + dy * dy > 0.02) {
      this.boat.angle += (Math.atan2(dy, dx) - this.boat.angle) * 0.25;
    }
    this.boat.wake.push({
      x: this.boat.x - Math.cos(this.boat.angle) * 16,
      y: this.boat.y - Math.sin(this.boat.angle) * 16,
      life: 1
    });
    if (this.boat.wake.length > 26) this.boat.wake.shift();
    this.boat.wake.forEach(w => w.life -= dt * 0.9);
    this.boat.wake = this.boat.wake.filter(w => w.life > 0);
    for (const p of this.items) {
      const flow = this.getCurrent(p.x, p.y, this.time);
      p.vx += (flow.vx - p.vx) * 3 * dt;
      p.vy += (flow.vy - p.vy) * 3 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.bobPhase += dt * p.bobSpeed;
      p.rotation += p.rotSpeed * dt;
      if (p.x < -60) p.x = this.width + 60;
      if (p.x > this.width + 60) p.x = -60;
      if (p.y < this.hudHeight - 40) p.y = this.height - 20;
      if (p.y > this.height + 20) p.y = this.hudHeight - 30;
    }
    this.items = this.items.filter(p => {
      const distSq = (this.boat.x - p.x) ** 2 + (this.boat.y - p.y) ** 2;
      const threshold = (this.boat.radius * 0.7 + p.hitRadius * 0.5) ** 2;
      if (distSq < threshold) {
        this.totalCollected += p.value;
        this.popups.push({
          x: p.x, y: p.y,
          text: `+${p.value}`,
          life: 1,
          color: p.type === 'micro' ? '#3fe0c8' : '#ffd166'
        });
        return false;
      }
      return true;
    });
    this.popups.forEach(txt => {
      txt.y -= dt * 26;
      txt.life -= dt * 1.1;
    });
    this.popups = this.popups.filter(txt => txt.life > 0);
    this.spawnAcc += this.pollutionRate * dt;
    while (this.spawnAcc >= 1 && this.items.length < this.maxItems) {
      this.spawnTrash(true);
      this.spawnAcc -= 1;
    }
    this.updateHUD();
  }
  updateHUD() {
    const collectedEl = document.getElementById('collectedValue');
    if (!collectedEl) return;
    collectedEl.textContent = this.totalCollected;
    document.getElementById('remainingValue').textContent = this.items.length;
    const total = this.totalCollected + this.items.length;
    const pct = total > 0 ? Math.round((this.totalCollected / total) * 100) : 0;
    document.getElementById('gauge').style.setProperty('--pct', pct);
    document.getElementById('gaugeLabel').textContent = `${pct}%`;
  }
  render() {
    this.ctx.clearRect(0, 0, this.width, this.height);
    const grad = this.ctx.createLinearGradient(0, 0, 0, this.height);
    grad.addColorStop(0, '#0c4a68');
    grad.addColorStop(0.4, '#0a3251');
    grad.addColorStop(1, '#03101c');
    this.ctx.fillStyle = grad;
    this.ctx.fillRect(0, 0, this.width, this.height);
    for (const p of this.items) {
      this.renderTrashItem(p);
    }
    this.renderBoat();
    this.ctx.textAlign = 'center';
    this.ctx.font = '700 13px monospace';
    for (const txt of this.popups) {
      this.ctx.globalAlpha = this.clamp(txt.life, 0, 1);
      this.ctx.fillStyle = txt.color;
      this.ctx.fillText(txt.text, txt.x, txt.y);
    }
    this.ctx.globalAlpha = 1;
  }
  renderTrashItem(p) {
    const y = p.y + Math.sin(p.bobPhase) * p.bobAmp;
    this.ctx.save();
    this.ctx.translate(p.x, y);

    if (p.type === 'micro') {
      this.ctx.rotate(p.rotation);
      this.ctx.fillStyle = p.color;
      this.ctx.globalAlpha = 0.85;
      this.ctx.beginPath();
      this.ctx.moveTo(-p.radius, 0);
      this.ctx.lineTo(0, -p.radius * 0.9);
      this.ctx.lineTo(p.radius, 0);
      this.ctx.lineTo(0, p.radius * 0.8);
      this.ctx.fill();
    } else if (p.type === 'bottle') {
      this.ctx.rotate(p.rotation * 0.5);
      this.ctx.globalAlpha = 0.8;
      this.ctx.fillStyle = 'rgba(200,235,235,0.55)';
      this.ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      this.ctx.beginPath();
      this.ctx.roundRect(-6, -4, 12, 18, 3);
      this.ctx.fill();
      this.ctx.stroke();
    } else if (p.type === 'net' || p.type === 'bag') {
      this.ctx.rotate(p.rotation * 0.3);
      this.ctx.globalAlpha = 0.55;
      this.ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      this.ctx.strokeRect(-p.radius / 2, -p.radius / 2, p.radius, p.radius);
    }
    this.ctx.restore();
  }
  renderBoat() {
    for (const w of this.boat.wake) {
      this.ctx.beginPath();
      this.ctx.fillStyle = `rgba(234,246,246,${0.25 * w.life})`;
      this.ctx.arc(w.x, w.y, 3 + (1 - w.life) * 6, 0, Math.PI * 2);
      this.ctx.fill();
    }
    this.ctx.save();
    this.ctx.translate(this.boat.x, this.boat.y);
    this.ctx.rotate(this.boat.angle);
    this.ctx.fillStyle = '#e4e9ee';
    this.ctx.beginPath();
    this.ctx.moveTo(-20, -8);
    this.ctx.lineTo(14, -8);
    this.ctx.quadraticCurveTo(24, 0, 14, 8);
    this.ctx.lineTo(-20, 8);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.restore();
  }
  loop(now) {
    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    dt = Math.min(dt, 0.05);
    const scaledDt = dt * this.simSpeed;
    this.time += scaledDt;

    this.update(scaledDt);
    this.render();

    requestAnimationFrame((t) => this.loop(t));
  }
}
window.addEventListener('DOMContentLoaded', () => {
  new OceanEngine('ocean');
});