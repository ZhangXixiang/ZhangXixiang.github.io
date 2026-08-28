(function () {
  'use strict';

  var canvas = document.getElementById('confetti-canvas');
  var overlay = document.getElementById('welcome-overlay');
  if (!canvas) return;

  var ctx = canvas.getContext('2d');
  var pieces = [];
  var fireworks = [];
  var running = false;
  var startTime = 0;
  var DURATION = 4500;

  var COLORS = [
    '#00f0ff', '#a855f7', '#00ff88', '#ff006e',
    '#ffd700', '#ff4500', '#7b2fff', '#00d4ff'
  ];

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function randomColor() {
    return COLORS[Math.floor(Math.random() * COLORS.length)];
  }

  function createPiece(x, y, angle, speed, size, type) {
    return {
      x: x,
      y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: size || Math.random() * 8 + 4,
      color: randomColor(),
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 15,
      gravity: 0.12 + Math.random() * 0.08,
      friction: 0.98,
      opacity: 1,
      type: type || 'rect',
      life: 1
    };
  }

  function fireCannon(x, y, spread, power, count) {
    var baseAngle = -Math.PI / 2;
    for (var i = 0; i < count; i++) {
      var angle = baseAngle + (Math.random() - 0.5) * spread;
      var speed = power + Math.random() * power * 0.5;
      var type = Math.random() > 0.5 ? 'rect' : 'circle';
      pieces.push(createPiece(x, y, angle, speed, null, type));
    }
  }

  function fireworkBurst(x, y) {
    var count = 80 + Math.floor(Math.random() * 40);
    for (var i = 0; i < count; i++) {
      var angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
      var speed = 4 + Math.random() * 8;
      pieces.push(createPiece(x, y, angle, speed, Math.random() * 6 + 2, 'circle'));
    }
    // flash ring
    fireworks.push({ x: x, y: y, radius: 0, maxRadius: 120, opacity: 1, color: randomColor() });
  }

  function launchSequence() {
    pieces = [];
    fireworks = [];
    var w = canvas.width;
    var h = canvas.height;

    // screen flash + shake
    overlay && overlay.classList.add('flash');
    document.body.classList.add('confetti-shake');

    // triple cannon blast
    setTimeout(function () {
      fireCannon(w * 0.2, h, Math.PI * 0.8, 18, 120);
      fireCannon(w * 0.5, h, Math.PI * 0.6, 22, 180);
      fireCannon(w * 0.8, h, Math.PI * 0.8, 18, 120);
    }, 100);

    // delayed fireworks
    setTimeout(function () { fireworkBurst(w * 0.3, h * 0.35); }, 400);
    setTimeout(function () { fireCannon(w * 0.5, h, Math.PI * 0.5, 25, 200); }, 600);
    setTimeout(function () { fireworkBurst(w * 0.7, h * 0.25); }, 800);
    setTimeout(function () { fireworkBurst(w * 0.5, h * 0.2); }, 1100);
    setTimeout(function () {
      fireCannon(w * 0.15, h, Math.PI, 16, 80);
      fireCannon(w * 0.85, h, Math.PI, 16, 80);
    }, 1400);

    // show welcome text
    setTimeout(function () {
      overlay && overlay.classList.add('show');
    }, 300);

    setTimeout(function () {
      overlay && overlay.classList.remove('flash');
    }, 600);

    setTimeout(function () {
      overlay && overlay.classList.add('fade-out');
    }, 3200);

    setTimeout(function () {
      overlay && overlay.classList.remove('show', 'fade-out', 'flash');
      document.body.classList.remove('confetti-shake');
      running = false;
      canvas.style.pointerEvents = 'none';
    }, DURATION);
  }

  function drawPiece(p) {
    ctx.save();
    ctx.globalAlpha = p.opacity * p.life;
    ctx.translate(p.x, p.y);
    ctx.rotate((p.rotation * Math.PI) / 180);
    ctx.fillStyle = p.color;

    if (p.type === 'circle') {
      ctx.beginPath();
      ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
    }
    ctx.restore();
  }

  function animate(timestamp) {
    if (!running) return;
    if (!startTime) startTime = timestamp;
    var elapsed = timestamp - startTime;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // draw firework rings
    fireworks.forEach(function (fw) {
      fw.radius += 4;
      fw.opacity -= 0.03;
      if (fw.opacity > 0) {
        ctx.beginPath();
        ctx.arc(fw.x, fw.y, fw.radius, 0, Math.PI * 2);
        ctx.strokeStyle = fw.color;
        ctx.globalAlpha = fw.opacity * 0.5;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    });

    pieces.forEach(function (p) {
      p.vx *= p.friction;
      p.vy *= p.friction;
      p.vy += p.gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.rotationSpeed;
      p.life -= 0.004;

      if (p.life > 0 && p.y < canvas.height + 50) {
        drawPiece(p);
      }
    });

    if (elapsed < DURATION) {
      requestAnimationFrame(animate);
    }
  }

  function start() {
    if (running) return;
    running = true;
    startTime = 0;
    resize();
    canvas.style.pointerEvents = 'auto';
    launchSequence();
    requestAnimationFrame(animate);
  }

  window.addEventListener('resize', resize);
  resize();

  // only on first full page load, not pjax
  if (!window.__pjaxLoaded) {
    window.addEventListener('load', function () {
      setTimeout(start, 200);
    });
  }

  window.replayConfetti = start;
})();
